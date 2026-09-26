// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AccountNFT} from "../src/AccountNFT.sol";
import {Posts} from "../src/Posts.sol";
import {IUSDC3009} from "../src/IUSDC3009.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// 用法
///   本地 anvil（自动部署 MockUSDC 并给 anvil 前 5 个账户各发 10000 USDC）：
///     forge script script/Deploy.s.sol --rpc-url anvil --broadcast --private-key <anvil 账户 0 私钥>
///   Fuji（用 Circle USDC，keystore 签名）：
///     USDC=0x5425890298aed601595a70AB815c96711a31Bc65 forge script script/Deploy.s.sol --rpc-url fuji --broadcast --account task5-admin
/// 价格参数可用环境变量覆盖：MINT_FEE PRICE_POST PRICE_REPLY PRICE_REPOST PRICE_LIKE TREASURY_BPS MAX_DEPTH（USDC 最小单位）
contract Deploy is Script {
    function run() external {
        address usdcAddr = vm.envOr("USDC", address(0));
        Posts.Params memory p = Posts.Params({
            mintFee: vm.envOr("MINT_FEE", uint256(1_000_000)),
            pricePost: vm.envOr("PRICE_POST", uint256(500_000)),
            priceReply: vm.envOr("PRICE_REPLY", uint256(200_000)),
            priceRepost: vm.envOr("PRICE_REPOST", uint256(200_000)),
            priceLike: vm.envOr("PRICE_LIKE", uint256(50_000)),
            treasuryBps: vm.envOr("TREASURY_BPS", uint256(1000)),
            maxDepth: uint8(vm.envOr("MAX_DEPTH", uint256(6)))
        });

        vm.startBroadcast();
        address owner = msg.sender;

        if (usdcAddr == address(0)) {
            MockUSDC mock = new MockUSDC();
            usdcAddr = address(mock);
            // anvil 默认账户 0–4
            address[5] memory funded = [
                0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
                0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
                0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
                0x90F79bf6EB2c4f870365E785982E1f101E93b906,
                0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
            ];
            for (uint256 i = 0; i < funded.length; i++) {
                mock.mint(funded[i], 10_000_000_000);
            }
            if (owner != funded[0]) mock.mint(owner, 10_000_000_000);
        }

        AccountNFT account = new AccountNFT(owner);
        Posts posts = new Posts(IUSDC3009(usdcAddr), account, owner, p);
        account.setMinter(address(posts));
        vm.stopBroadcast();

        console.log("owner    ", owner);
        console.log("usdc     ", usdcAddr);
        console.log("account  ", address(account));
        console.log("posts    ", address(posts));
        console.log("block    ", block.number);
        console.log("chainId  ", block.chainid);
    }
}
