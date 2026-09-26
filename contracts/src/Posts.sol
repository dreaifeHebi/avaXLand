// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUSDC3009} from "./IUSDC3009.sol";
import {AccountNFT} from "./AccountNFT.sol";
import {Splits} from "./Splits.sol";
import {Achievements} from "./Achievements.sol";

/// @title Posts：avaXLand 的主合约
/// @notice 唯一收款方、唯一 USDC 持有方。负责：开户收费、记节点、点赞计数、分账、成就、提现、国库。
///         所有写操作都由付款人签一份 EIP-3009 ReceiveWithAuthorization 授权，
///         其 nonce 必须等于「意图哈希」，所以同一份签名既是付款也是对内容的承诺；
///         替人发交易的 relayer 改不了正文、摘要、父节点或类型。
contract Posts is Splits, Achievements, Ownable {
    enum Kind {
        Post,
        Reply,
        Repost
    }

    struct Node {
        uint64 parentId;
        uint64 rootId;
        uint64 authorAccountId;
        uint8 kind;
        uint40 createdAt;
        uint32 likes;
        uint32 replies;
        uint32 reposts;
        bytes32 contentHash;
    }

    /// @dev EIP-3009 授权。to 恒为本合约，所以不放进结构体；signature 为 65 字节 r‖s‖v。
    struct Auth {
        address from;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        bytes signature;
    }

    struct Params {
        uint256 mintFee;
        uint256 pricePost;
        uint256 priceReply;
        uint256 priceRepost;
        uint256 priceLike;
        uint256 treasuryBps;
        uint8 maxDepth;
    }

    bytes32 public constant TAG_MINT = keccak256("MINT");
    bytes32 public constant TAG_NODE = keccak256("NODE");
    bytes32 public constant TAG_LIKE = keccak256("LIKE");

    IUSDC3009 public immutable usdc;
    AccountNFT public immutable account;
    uint256 public immutable mintFee;
    uint256 public immutable pricePost;
    uint256 public immutable priceReply;
    uint256 public immutable priceRepost;
    uint256 public immutable priceLike;

    uint64 public nodeCount;
    mapping(uint64 => Node) internal _nodes;
    mapping(uint64 => mapping(uint64 => bool)) public liked; // accountId => nodeId => 已点赞

    event AccountMinted(uint64 indexed accountId, address indexed to, uint256 fee);
    event NodeCreated(
        uint64 indexed id,
        uint64 indexed parentId,
        uint64 indexed authorAccountId,
        uint8 kind,
        bytes32 contentHash,
        string excerpt,
        uint256 fee
    );
    event Liked(uint64 indexed nodeId, uint64 indexed byAccountId, uint256 fee);
    event Claimed(uint64 indexed accountId, uint256 amount, address to, uint256 voucherId);

    error BadValue();
    error BadNonce();
    error BadKind();
    error BadParent();
    error NodeNotFound();
    error NotAccountOwner();
    error ExcerptTooLong();
    error AlreadyLiked();
    error InsufficientPending();
    error BadSignatureLength();
    error TransferFailed();

    constructor(IUSDC3009 usdc_, AccountNFT account_, address owner_, Params memory p)
        Splits(p.treasuryBps, p.maxDepth)
        Ownable(owner_)
    {
        usdc = usdc_;
        account = account_;
        mintFee = p.mintFee;
        pricePost = p.pricePost;
        priceReply = p.priceReply;
        priceRepost = p.priceRepost;
        priceLike = p.priceLike;
    }

    // ---------------------------------------------------------------- 写操作

    /// @notice 开户：付 mintFee，铸一个账号 NFT 给 to。付款人可以不是 to（代付开户）。
    function mintWithAuth(address to, bytes32 salt, Auth calldata a) external returns (uint64 accountId) {
        if (a.value != mintFee) revert BadValue();
        if (a.nonce != keccak256(abi.encode(TAG_MINT, to, salt))) revert BadNonce();
        _pay(a);
        accountId = account.mint(to);
        emit AccountMinted(accountId, to, a.value);
        _accrueTreasury(0, a.value);
    }

    /// @notice 发帖 / 回复 / 转发。
    /// @param excerpt 上链摘要（≤ 账号等级对应的字节上限）；全文链下，contentHash = keccak256(全文)
    function createWithAuth(
        uint64 accountId,
        uint64 parentId,
        uint8 kind,
        string calldata excerpt,
        bytes32 contentHash,
        bytes32 salt,
        Auth calldata a
    ) external returns (uint64 nodeId) {
        if (a.from != account.ownerOf(accountId)) revert NotAccountOwner();
        if (a.value != priceOf(kind)) revert BadValue();
        if (
            a.nonce
                != keccak256(abi.encode(TAG_NODE, accountId, parentId, kind, contentHash, keccak256(bytes(excerpt)), salt))
        ) revert BadNonce();
        if (kind == uint8(Kind.Post)) {
            if (parentId != 0) revert BadParent();
        } else {
            if (parentId == 0 || parentId > nodeCount) revert BadParent();
        }
        if (bytes(excerpt).length > maxExcerptBytes(account.tierOf(accountId))) revert ExcerptTooLong();

        _pay(a);

        nodeId = ++nodeCount;
        uint64 rootId = kind == uint8(Kind.Post) ? nodeId : _nodes[parentId].rootId;
        _nodes[nodeId] = Node({
            parentId: parentId,
            rootId: rootId,
            authorAccountId: accountId,
            kind: kind,
            createdAt: uint40(block.timestamp),
            likes: 0,
            replies: 0,
            reposts: 0,
            contentHash: contentHash
        });
        emit NodeCreated(nodeId, parentId, accountId, kind, contentHash, excerpt, a.value);

        if (kind == uint8(Kind.Post)) {
            // 根帖没有被互动对象：发帖费全进国库，这是「说话的成本」
            _bump(accountId, POSTS_MADE, 1);
            _accrueTreasury(nodeId, a.value);
        } else {
            Node storage parent = _nodes[parentId];
            if (kind == uint8(Kind.Reply)) {
                parent.replies++;
                _bump(accountId, REPLIES_MADE, 1);
                _bump(parent.authorAccountId, REPLIES_RECEIVED, 1);
            } else {
                parent.reposts++;
                _bump(accountId, REPOSTS_MADE, 1);
                _bump(parent.authorAccountId, REPOSTS_RECEIVED, 1);
            }
            _distribute(parentId, a.value);
        }
    }

    /// @notice 点赞：不建节点，只付费并计数；每账号对每节点一次。
    function likeWithAuth(uint64 accountId, uint64 nodeId, Auth calldata a) external {
        if (a.from != account.ownerOf(accountId)) revert NotAccountOwner();
        if (a.value != priceLike) revert BadValue();
        if (a.nonce != keccak256(abi.encode(TAG_LIKE, accountId, nodeId))) revert BadNonce();
        if (nodeId == 0 || nodeId > nodeCount) revert NodeNotFound();
        if (liked[accountId][nodeId]) revert AlreadyLiked();

        _pay(a);

        liked[accountId][nodeId] = true;
        Node storage n = _nodes[nodeId];
        n.likes++;
        emit Liked(nodeId, accountId, a.value);
        _bump(accountId, LIKES_GIVEN, 1);
        _bump(n.authorAccountId, LIKES_RECEIVED, 1);
        _distribute(nodeId, a.value);
    }

    /// @notice 提领待领收益，直接转 USDC 到 to。只有账号 NFT 的当前持有人能调。
    function claimAndRedeem(uint64 accountId, uint256 amount, address to) external {
        if (msg.sender != account.ownerOf(accountId)) revert NotAccountOwner();
        if (amount == 0 || amount > pending[accountId]) revert InsufficientPending();
        pending[accountId] -= amount;
        emit Claimed(accountId, amount, to, 0);
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }

    function withdrawTreasury(address to, uint256 amount) external onlyOwner {
        treasury -= amount;
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }

    // ---------------------------------------------------------------- 只读

    function getNode(uint64 nodeId) external view returns (Node memory) {
        if (nodeId == 0 || nodeId > nodeCount) revert NodeNotFound();
        return _nodes[nodeId];
    }

    function priceOf(uint8 kind) public view returns (uint256) {
        if (kind == uint8(Kind.Post)) return pricePost;
        if (kind == uint8(Kind.Reply)) return priceReply;
        if (kind == uint8(Kind.Repost)) return priceRepost;
        revert BadKind();
    }

    /// @notice 摘要字节上限：tier 0 = 600（约 200 个中文字）。
    function maxExcerptBytes(uint8 tier) public pure returns (uint256) {
        if (tier == 0) return 600;
        if (tier == 1) return 1200;
        return 2400;
    }

    // ---------------------------------------------------------------- 内部

    /// @dev 用付款人的 EIP-3009 授权把 USDC 收到本合约。to 固定为本合约，USDC 会校验 msg.sender == to。
    function _pay(Auth calldata a) internal {
        bytes calldata sig = a.signature;
        if (sig.length != 65) revert BadSignatureLength();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        usdc.receiveWithAuthorization(a.from, address(this), a.value, a.validAfter, a.validBefore, a.nonce, v, r, s);
    }

    function _parentOf(uint64 nodeId) internal view override returns (uint64) {
        return _nodes[nodeId].parentId;
    }

    function _authorOf(uint64 nodeId) internal view override returns (uint64) {
        return _nodes[nodeId].authorAccountId;
    }

    function _onEarned(uint64 accountId, uint256 amount) internal override {
        _bump(accountId, EARNED_USDC, amount);
    }
}
