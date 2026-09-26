// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC3009} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC3009.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @notice 本地 anvil 与单元测试用的 USDC 替身：6 位小数、带 EIP-3009、任何人可 mint。
///         域参数与 Circle 一致（"USD Coin" / "2"），客户端不用区分。
contract MockUSDC is ERC3009 {
    constructor() ERC20("USD Coin", "USDC") EIP712("USD Coin", "2") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Circle 的 USDC 有 version()，服务端靠 name()/version() 组 EIP-712 域，这里保持一致
    function version() external pure returns (string memory) {
        return "2";
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
