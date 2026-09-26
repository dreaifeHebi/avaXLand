// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title 传播链递减分账
/// @notice 每笔互动费（回复、转发、点赞）从被互动的节点开始，沿 parent 指针逐层分给作者：
///         先扣固定比例进国库；然后每层拿走剩余的一半；走到根节点时根拿走全部剩余；
///         若走满 maxDepth 层还没到根，剩余进国库。
abstract contract Splits {
    uint256 public immutable treasuryBps; // 万分比，示意 1000 = 10%
    uint8 public immutable maxDepth; // 示意 6

    uint256 public treasury;
    mapping(uint64 => uint256) public pending; // accountId => 待领 USDC（最小单位）

    event Split(uint64 indexed nodeId, uint64 indexed toAccountId, uint8 depth, uint256 amount);
    event TreasuryAccrued(uint64 indexed nodeId, uint256 amount);

    error BadTreasuryBps();

    constructor(uint256 treasuryBps_, uint8 maxDepth_) {
        if (treasuryBps_ > 10_000) revert BadTreasuryBps();
        treasuryBps = treasuryBps_;
        maxDepth = maxDepth_;
    }

    function _parentOf(uint64 nodeId) internal view virtual returns (uint64);
    function _authorOf(uint64 nodeId) internal view virtual returns (uint64);
    /// @dev 成就模块的钩子：某账号刚收到一笔分账。
    function _onEarned(uint64 accountId, uint256 amount) internal virtual;

    /// @param nodeId 被互动的节点（被回复 / 被转发 / 被点赞的那条）
    /// @param fee 这次互动付的钱
    function _distribute(uint64 nodeId, uint256 fee) internal {
        uint256 cut = (fee * treasuryBps) / 10_000;
        uint256 remaining = fee - cut;
        uint64 cur = nodeId;
        for (uint8 depth = 0; depth < maxDepth; depth++) {
            uint64 parent = _parentOf(cur);
            if (parent == 0) {
                // 到根了：根拿走全部剩余
                _credit(nodeId, _authorOf(cur), depth, remaining);
                remaining = 0;
                break;
            }
            uint256 share = remaining / 2;
            _credit(nodeId, _authorOf(cur), depth, share);
            remaining -= share;
            cur = parent;
        }
        _accrueTreasury(nodeId, cut + remaining);
    }

    function _credit(uint64 nodeId, uint64 to, uint8 depth, uint256 amount) private {
        if (amount == 0) return;
        pending[to] += amount;
        emit Split(nodeId, to, depth, amount);
        _onEarned(to, amount);
    }

    function _accrueTreasury(uint64 nodeId, uint256 amount) internal {
        if (amount == 0) return;
        treasury += amount;
        emit TreasuryAccrued(nodeId, amount);
    }
}
