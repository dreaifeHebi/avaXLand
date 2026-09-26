// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC3009} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC3009.sol";
import {AccountNFT} from "../src/AccountNFT.sol";
import {Posts} from "../src/Posts.sol";
import {IUSDC3009} from "../src/IUSDC3009.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract PostsTest is Test {
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    uint256 constant PK_ALICE = 0xA11CE;
    uint256 constant PK_BOB = 0xB0B;
    uint256 constant PK_CAROL = 0xCA401;
    uint256 constant PK_DAVE = 0xDA7E;
    uint256 constant PK_ERIN = 0xE417;

    MockUSDC usdc;
    AccountNFT account;
    Posts posts;

    address alice;
    address bob;
    address carol;
    address dave;
    address erin;
    uint64 aliceId;
    uint64 bobId;
    uint64 carolId;
    uint64 daveId;
    uint64 erinId;

    function setUp() public {
        vm.warp(1_700_000_000);
        alice = vm.addr(PK_ALICE);
        bob = vm.addr(PK_BOB);
        carol = vm.addr(PK_CAROL);
        dave = vm.addr(PK_DAVE);
        erin = vm.addr(PK_ERIN);
        _deploy(_params(50_000));
    }

    // ------------------------------------------------------------ helpers

    function _params(uint256 like) internal pure returns (Posts.Params memory) {
        return Posts.Params({
            mintFee: 1_000_000,
            pricePost: 500_000,
            priceReply: 200_000,
            priceRepost: 200_000,
            priceLike: like,
            treasuryBps: 1000,
            maxDepth: 6
        });
    }

    /// 部署一整套并给五个人开户、各发 100 USDC
    function _deploy(Posts.Params memory p) internal {
        usdc = new MockUSDC();
        account = new AccountNFT(address(this));
        posts = new Posts(IUSDC3009(address(usdc)), account, address(this), p);
        account.setMinter(address(posts));
        usdc.mint(alice, 100_000_000);
        usdc.mint(bob, 100_000_000);
        usdc.mint(carol, 100_000_000);
        usdc.mint(dave, 100_000_000);
        usdc.mint(erin, 100_000_000);
        aliceId = _mintAccount(PK_ALICE, alice);
        bobId = _mintAccount(PK_BOB, bob);
        carolId = _mintAccount(PK_CAROL, carol);
        daveId = _mintAccount(PK_DAVE, dave);
        erinId = _mintAccount(PK_ERIN, erin);
    }

    function _auth(uint256 pk, uint256 value, bytes32 nonce) internal view returns (Posts.Auth memory) {
        address from = vm.addr(pk);
        uint256 validBefore = block.timestamp + 300;
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, from, address(posts), value, 0, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return Posts.Auth({
            from: from, value: value, validAfter: 0, validBefore: validBefore, nonce: nonce, signature: abi.encodePacked(r, s, v)
        });
    }

    function _mintAccount(uint256 pk, address to) internal returns (uint64) {
        bytes32 salt = keccak256(abi.encode("salt", to));
        bytes32 nonce = keccak256(abi.encode(posts.TAG_MINT(), to, salt));
        return posts.mintWithAuth(to, salt, _auth(pk, posts.mintFee(), nonce));
    }

    function _nodeNonce(uint64 accountId, uint64 parentId, uint8 kind, string memory text, bytes32 salt)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(posts.TAG_NODE(), accountId, parentId, kind, keccak256(bytes(text)), keccak256(bytes(text)), salt)
        );
    }

    function _create(uint256 pk, uint64 accountId, uint64 parentId, uint8 kind, string memory text)
        internal
        returns (uint64)
    {
        bytes32 salt = keccak256(abi.encode(text, accountId, parentId));
        Posts.Auth memory a = _auth(pk, posts.priceOf(kind), _nodeNonce(accountId, parentId, kind, text, salt));
        return posts.createWithAuth(accountId, parentId, kind, text, keccak256(bytes(text)), salt, a);
    }

    function _post(uint256 pk, uint64 id, string memory text) internal returns (uint64) {
        return _create(pk, id, 0, 0, text);
    }

    function _reply(uint256 pk, uint64 id, uint64 parent, string memory text) internal returns (uint64) {
        return _create(pk, id, parent, 1, text);
    }

    function _repost(uint256 pk, uint64 id, uint64 parent, string memory text) internal returns (uint64) {
        return _create(pk, id, parent, 2, text);
    }

    function _like(uint256 pk, uint64 accountId, uint64 nodeId) internal {
        bytes32 nonce = keccak256(abi.encode(posts.TAG_LIKE(), accountId, nodeId));
        posts.likeWithAuth(accountId, nodeId, _auth(pk, posts.priceLike(), nonce));
    }

    // ------------------------------------------------------------ 基本

    function test_MintAccount_FeeToTreasury() public view {
        assertEq(account.ownerOf(aliceId), alice);
        assertEq(posts.treasury(), 5_000_000);
        assertEq(usdc.balanceOf(address(posts)), 5_000_000);
        assertEq(aliceId, 1);
        assertEq(erinId, 5);
    }

    function test_RootPost_FeeToTreasury() public {
        uint64 id = _post(PK_ALICE, aliceId, "hello");
        assertEq(posts.treasury(), 5_500_000);
        Posts.Node memory n = posts.getNode(id);
        assertEq(n.rootId, id);
        assertEq(n.parentId, 0);
        assertEq(n.authorAccountId, aliceId);
        assertEq(n.contentHash, keccak256("hello"));
        assertEq(posts.stats(aliceId)[0], 1);
    }

    // ------------------------------------------------------------ 分账

    function test_LikeRoot_Author90_Treasury10() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        uint256 t0 = posts.treasury();
        _like(PK_BOB, bobId, root);
        assertEq(posts.pending(aliceId), 45_000);
        assertEq(posts.treasury() - t0, 5_000);
        assertEq(posts.getNode(root).likes, 1);
        assertTrue(posts.liked(bobId, root));
    }

    function test_ReplyFee_FlowsToParentChain() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        uint256 t0 = posts.treasury();
        uint64 r1 = _reply(PK_BOB, bobId, root, "r1");
        // 0.2：国库 0.02，根拿 0.18
        assertEq(posts.pending(aliceId), 180_000);
        assertEq(posts.treasury() - t0, 20_000);
        assertEq(posts.getNode(root).replies, 1);
        assertEq(posts.getNode(r1).rootId, root);
        // carol 回复 r1：国库 0.02；bob 0.09；根 alice 0.09
        _reply(PK_CAROL, carolId, r1, "r2");
        assertEq(posts.pending(bobId), 90_000);
        assertEq(posts.pending(aliceId), 270_000);
        assertEq(posts.treasury() - t0, 40_000);
    }

    function test_LikeDeepReply_DecreasingSplit() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        uint64 r1 = _reply(PK_BOB, bobId, root, "r1");
        uint64 r2 = _reply(PK_CAROL, carolId, r1, "r2");
        uint64 r3 = _reply(PK_DAVE, daveId, r2, "r3");
        uint256 pa = posts.pending(aliceId);
        uint256 pb = posts.pending(bobId);
        uint256 pc = posts.pending(carolId);
        uint256 pd = posts.pending(daveId);
        uint256 t0 = posts.treasury();
        _like(PK_ERIN, erinId, r3);
        // 0.05：国库 0.005；剩 0.045 → dave 0.0225 → carol 0.01125 → bob 0.005625 → 根 alice 拿剩余 0.005625
        assertEq(posts.pending(daveId) - pd, 22_500);
        assertEq(posts.pending(carolId) - pc, 11_250);
        assertEq(posts.pending(bobId) - pb, 5_625);
        assertEq(posts.pending(aliceId) - pa, 5_625);
        assertEq(posts.treasury() - t0, 5_000);
    }

    function test_DepthCap_RemainderToTreasury() public {
        // 根 + 7 层回复，点最深的一条；maxDepth = 6，只分 6 层，根拿不到，尾巴进国库
        uint64 cur = _post(PK_ALICE, aliceId, "root");
        uint64 root = cur;
        uint256[] memory pks = new uint256[](2);
        pks[0] = PK_BOB;
        pks[1] = PK_CAROL;
        uint64[] memory ids = new uint64[](2);
        ids[0] = bobId;
        ids[1] = carolId;
        for (uint256 i = 0; i < 7; i++) {
            cur = _reply(pks[i % 2], ids[i % 2], cur, string(abi.encodePacked("d", vm.toString(i))));
        }
        uint256 pa = posts.pending(aliceId);
        uint256 sumBefore = posts.pending(bobId) + posts.pending(carolId);
        uint256 t0 = posts.treasury();
        _like(PK_ERIN, erinId, cur);
        // 45000 → 22500, 11250, 5625, 2812, 1406, 703 = 44296；剩 704 进国库
        assertEq(posts.pending(aliceId), pa, "root beyond depth cap gets nothing");
        assertEq(posts.pending(bobId) + posts.pending(carolId) - sumBefore, 44_296);
        assertEq(posts.treasury() - t0, 5_704);
        assertEq(posts.getNode(root).rootId, root);
    }

    function test_Conservation_WithTinyFees() public {
        Posts.Params memory p = _params(3);
        p.priceReply = 7;
        p.priceRepost = 5;
        _deploy(p);
        uint64 root = _post(PK_ALICE, aliceId, "root");
        uint64 r1 = _reply(PK_BOB, bobId, root, "r1");
        uint64 r2 = _reply(PK_CAROL, carolId, r1, "r2");
        uint64 rp = _repost(PK_DAVE, daveId, r2, "");
        _like(PK_ERIN, erinId, rp);
        _like(PK_ALICE, aliceId, r2);
        _like(PK_BOB, bobId, r1);
        uint256 sumPending = posts.pending(aliceId) + posts.pending(bobId) + posts.pending(carolId)
            + posts.pending(daveId) + posts.pending(erinId);
        assertEq(usdc.balanceOf(address(posts)), sumPending + posts.treasury(), "USDC in contract == pending + treasury");
        assertEq(usdc.balanceOf(address(posts)), 5_000_000 + 500_000 + 7 + 7 + 5 + 3 + 3 + 3);
    }

    function test_Repost_SplitsToOriginal_ThenLikeOnRepost() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        uint256 t0 = posts.treasury();
        uint64 rp = _repost(PK_BOB, bobId, root, "");
        assertEq(posts.pending(aliceId), 180_000);
        assertEq(posts.treasury() - t0, 20_000);
        assertEq(posts.getNode(root).reposts, 1);
        _like(PK_CAROL, carolId, rp);
        assertEq(posts.pending(bobId), 22_500);
        assertEq(posts.pending(aliceId), 180_000 + 22_500);
        assertEq(posts.treasury() - t0, 25_000);
    }

    // ------------------------------------------------------------ 绑定与权限

    function test_TamperedExcerpt_Reverts() public {
        bytes32 salt = keccak256("s");
        Posts.Auth memory a = _auth(PK_ALICE, posts.pricePost(), _nodeNonce(aliceId, 0, 0, "hello", salt));
        vm.expectRevert(Posts.BadNonce.selector);
        posts.createWithAuth(aliceId, 0, 0, "hellp", keccak256("hello"), salt, a);
    }

    function test_TamperedParent_Reverts() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        bytes32 salt = keccak256("s");
        Posts.Auth memory a = _auth(PK_BOB, posts.priceReply(), _nodeNonce(bobId, root, 1, "reply", salt));
        vm.expectRevert(Posts.BadNonce.selector);
        posts.createWithAuth(bobId, 0, 1, "reply", keccak256("reply"), salt, a);
    }

    function test_RelayerCannotForgeNonce() public {
        // relayer 想改正文，于是把 nonce 也改成新正文的意图哈希：合约的 nonce 校验会过，但 USDC 验签会失败
        bytes32 salt = keccak256("s");
        Posts.Auth memory a = _auth(PK_ALICE, posts.pricePost(), _nodeNonce(aliceId, 0, 0, "hello", salt));
        a.nonce = _nodeNonce(aliceId, 0, 0, "hellp", salt);
        vm.expectRevert(ERC3009.ERC3009InvalidSignature.selector);
        posts.createWithAuth(aliceId, 0, 0, "hellp", keccak256("hellp"), salt, a);
    }

    function test_WrongPayer_Reverts() public {
        bytes32 salt = keccak256("s");
        Posts.Auth memory a = _auth(PK_BOB, posts.pricePost(), _nodeNonce(aliceId, 0, 0, "hello", salt));
        vm.expectRevert(Posts.NotAccountOwner.selector);
        posts.createWithAuth(aliceId, 0, 0, "hello", keccak256("hello"), salt, a);
    }

    function test_WrongAmount_Reverts() public {
        bytes32 salt = keccak256("s");
        Posts.Auth memory a = _auth(PK_ALICE, 1, _nodeNonce(aliceId, 0, 0, "hello", salt));
        vm.expectRevert(Posts.BadValue.selector);
        posts.createWithAuth(aliceId, 0, 0, "hello", keccak256("hello"), salt, a);
    }

    function test_ExcerptTooLong_Reverts() public {
        bytes memory long = new bytes(601);
        for (uint256 i = 0; i < long.length; i++) long[i] = "a";
        string memory text = string(long);
        bytes32 salt = keccak256("s");
        Posts.Auth memory a = _auth(PK_ALICE, posts.pricePost(), _nodeNonce(aliceId, 0, 0, text, salt));
        vm.expectRevert(Posts.ExcerptTooLong.selector);
        posts.createWithAuth(aliceId, 0, 0, text, keccak256(bytes(text)), salt, a);
    }

    function test_DoubleLike_Reverts() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        _like(PK_BOB, bobId, root);
        bytes32 nonce = keccak256(abi.encode(posts.TAG_LIKE(), bobId, root));
        Posts.Auth memory a = _auth(PK_BOB, posts.priceLike(), nonce);
        vm.expectRevert(Posts.AlreadyLiked.selector);
        posts.likeWithAuth(bobId, root, a);
    }

    function test_Claim_OnlyOwner_And_TransferMovesClaim() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        _like(PK_BOB, bobId, root);
        assertEq(posts.pending(aliceId), 45_000);

        vm.prank(bob);
        vm.expectRevert(Posts.NotAccountOwner.selector);
        posts.claimAndRedeem(aliceId, 45_000, bob);

        vm.prank(alice);
        account.transferFrom(alice, bob, aliceId);

        vm.prank(alice);
        vm.expectRevert(Posts.NotAccountOwner.selector);
        posts.claimAndRedeem(aliceId, 45_000, alice);

        uint256 b0 = usdc.balanceOf(bob);
        vm.prank(bob);
        posts.claimAndRedeem(aliceId, 45_000, bob);
        assertEq(usdc.balanceOf(bob) - b0, 45_000);
        assertEq(posts.pending(aliceId), 0);

        vm.prank(bob);
        vm.expectRevert(Posts.InsufficientPending.selector);
        posts.claimAndRedeem(aliceId, 1, bob);
    }

    // ------------------------------------------------------------ 成就

    function test_Badges_LikesReceived_1_and_10() public {
        uint64 root = _post(PK_ALICE, aliceId, "root");
        vm.recordLogs();
        for (uint256 i = 0; i < 11; i++) {
            uint256 pk = 1000 + i;
            address who = vm.addr(pk);
            usdc.mint(who, 2_000_000);
            uint64 id = _mintAccount(pk, who);
            _like(pk, id, root);
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("BadgeUnlocked(uint64,uint8,uint8,uint256)");
        uint256 aliceLikesReceivedBadges;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] != sig) continue;
            if (uint256(logs[i].topics[1]) != aliceId) continue;
            if (uint256(logs[i].topics[2]) != posts.LIKES_RECEIVED()) continue;
            aliceLikesReceivedBadges++;
        }
        assertEq(aliceLikesReceivedBadges, 2, "tier 0 at like #1, tier 1 at like #10");
        uint32 bits = posts.badgeBits(aliceId);
        uint8 m = posts.LIKES_RECEIVED();
        assertTrue(bits & (uint32(1) << (m * 4 + 0)) != 0);
        assertTrue(bits & (uint32(1) << (m * 4 + 1)) != 0);
        assertTrue(bits & (uint32(1) << (m * 4 + 2)) == 0);
        assertEq(posts.stats(aliceId)[m], 11);
    }

    function test_Badges_EarnedCrossesTwoTiersAtOnce() public {
        _deploy(_params(20_000_000)); // 一次点赞 20 USDC，作者到手 18 USDC，一次跨过 1 与 10 两档
        uint64 root = _post(PK_ALICE, aliceId, "root");
        uint8 m = posts.EARNED_USDC();
        vm.expectEmit(true, true, false, true);
        emit BadgeUnlocked(aliceId, m, 0, 1_000_000);
        vm.expectEmit(true, true, false, true);
        emit BadgeUnlocked(aliceId, m, 1, 10_000_000);
        _like(PK_BOB, bobId, root);
        uint32 bits = posts.badgeBits(aliceId);
        assertTrue(bits & (uint32(1) << (m * 4 + 0)) != 0);
        assertTrue(bits & (uint32(1) << (m * 4 + 1)) != 0);
        assertTrue(bits & (uint32(1) << (m * 4 + 2)) == 0);
        assertEq(posts.stats(aliceId)[m], 18_000_000);
    }

    event BadgeUnlocked(uint64 indexed accountId, uint8 indexed metric, uint8 tier, uint256 threshold);
}
