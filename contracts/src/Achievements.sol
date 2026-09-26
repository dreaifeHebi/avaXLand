// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title 成就（付费动作的里程碑徽章）
/// @notice 8 个指标 × 4 个档位 = 32 枚徽章，记在 accountId 名下，随账号 NFT 走，不可单独转让。
///         纯状态，不进任何奖励逻辑。跨阈值的瞬间发事件。
abstract contract Achievements {
    // 指标下标
    uint8 public constant POSTS_MADE = 0;
    uint8 public constant REPLIES_MADE = 1;
    uint8 public constant REPOSTS_MADE = 2;
    uint8 public constant LIKES_GIVEN = 3;
    uint8 public constant LIKES_RECEIVED = 4;
    uint8 public constant REPLIES_RECEIVED = 5;
    uint8 public constant REPOSTS_RECEIVED = 6;
    uint8 public constant EARNED_USDC = 7;

    mapping(uint64 => uint256[8]) internal _stats;
    /// @dev bit (metric * 4 + tier) 为 1 表示已解锁
    mapping(uint64 => uint32) public badgeBits;

    event BadgeUnlocked(uint64 indexed accountId, uint8 indexed metric, uint8 tier, uint256 threshold);

    /// @notice 计数类阈值 1/10/100/1000；收益类同样的数字，单位 USDC（6 位小数）。
    function thresholds(uint8 metric) public pure returns (uint256[4] memory t) {
        uint256 unit = metric == EARNED_USDC ? 1_000_000 : 1;
        t[0] = 1 * unit;
        t[1] = 10 * unit;
        t[2] = 100 * unit;
        t[3] = 1000 * unit;
    }

    function stats(uint64 accountId) external view returns (uint256[8] memory) {
        return _stats[accountId];
    }

    function _bump(uint64 accountId, uint8 metric, uint256 delta) internal {
        uint256 before = _stats[accountId][metric];
        uint256 after_ = before + delta;
        _stats[accountId][metric] = after_;
        uint256[4] memory t = thresholds(metric);
        for (uint8 tier = 0; tier < 4; tier++) {
            if (before < t[tier] && after_ >= t[tier]) {
                badgeBits[accountId] |= uint32(1) << (metric * 4 + tier);
                emit BadgeUnlocked(accountId, metric, tier, t[tier]);
            }
        }
    }
}
