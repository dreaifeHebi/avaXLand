// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AccountNFT：账号 NFT
/// @notice 谁持有 tokenId，谁就是这个账号的主人；可转让。帖子作者、待领收益、成就都挂 accountId。
///         铸造只能由 Posts 合约（minter）发起，开户费在 Posts 里收取。
contract AccountNFT is ERC721, Ownable {
    address public minter;
    uint64 public nextId = 1;
    /// @dev 会员等级，决定摘要字节上限；默认 0。
    mapping(uint64 => uint8) public tierOf;

    event MinterSet(address indexed minter);
    event TierSet(uint64 indexed accountId, uint8 tier);

    error NotMinter();
    error MinterAlreadySet();

    constructor(address owner_) ERC721("avaXLand Account", "AXLA") Ownable(owner_) {}

    /// @notice 只能设一次，设成 Posts 合约地址。
    function setMinter(address minter_) external onlyOwner {
        if (minter != address(0)) revert MinterAlreadySet();
        minter = minter_;
        emit MinterSet(minter_);
    }

    function mint(address to) external returns (uint64 accountId) {
        if (msg.sender != minter) revert NotMinter();
        accountId = nextId++;
        _mint(to, accountId);
    }

    function setTier(uint64 accountId, uint8 tier) external onlyOwner {
        _requireOwned(accountId);
        tierOf[accountId] = tier;
        emit TierSet(accountId, tier);
    }
}
