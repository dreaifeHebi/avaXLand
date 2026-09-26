// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice 我们用到的 USDC 子集。Circle 的 FiatToken 与 OpenZeppelin 的 ERC3009 都实现了这几个函数。
interface IUSDC3009 {
    /// @dev EIP-3009：由收款方（to == msg.sender）凭付款人的签名把 value 从 from 划到 to。
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
