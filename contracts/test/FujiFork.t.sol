// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccountNFT} from "../src/AccountNFT.sol";
import {Posts} from "../src/Posts.sol";
import {IUSDC3009} from "../src/IUSDC3009.sol";

interface IFiatToken {
    function masterMinter() external view returns (address);
    function configureMinter(address minter, uint256 minterAllowedAmount) external returns (bool);
    function mint(address to, uint256 amount) external returns (bool);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function balanceOf(address a) external view returns (uint256);
    function transferWithAuthorization(
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
}

/// 在 Fuji 的当前状态上（本地 fork）用 Circle 真正的 USDC 走一遍开户与发帖。
/// 运行：FORK=true forge test --match-contract FujiFork -vv
contract FujiForkTest is Test {
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    IFiatToken constant USDC = IFiatToken(0x5425890298aed601595a70AB815c96711a31Bc65);
    uint256 constant PK = 0xF0F0;

    AccountNFT account;
    Posts posts;
    address alice;

    function setUp() public {
        if (!vm.envOr("FORK", false)) return;
        vm.createSelectFork(vm.rpcUrl("fuji"));
        alice = vm.addr(PK);
        account = new AccountNFT(address(this));
        posts = new Posts(
            IUSDC3009(address(USDC)),
            account,
            address(this),
            Posts.Params(1_000_000, 500_000, 200_000, 200_000, 50_000, 1000, 6)
        );
        account.setMinter(address(posts));
        // 借用 masterMinter 的身份给本合约铸币权，再给 alice 发 10 USDC
        vm.prank(USDC.masterMinter());
        USDC.configureMinter(address(this), 1_000_000_000);
        USDC.mint(alice, 10_000_000);
    }

    function _auth(uint256 value, bytes32 nonce) internal view returns (Posts.Auth memory) {
        uint256 validBefore = block.timestamp + 300;
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, alice, address(posts), value, 0, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", USDC.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, digest);
        return Posts.Auth(alice, value, 0, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    function test_RealUsdc_MintAndPost() public {
        vm.skip(!vm.envOr("FORK", false));
        bytes32 salt = keccak256("fork-salt");
        uint64 id = posts.mintWithAuth(alice, salt, _auth(1_000_000, keccak256(abi.encode(posts.TAG_MINT(), alice, salt))));
        assertEq(account.ownerOf(id), alice);
        assertEq(USDC.balanceOf(address(posts)), 1_000_000);

        string memory text = "hello from a Fuji fork";
        bytes32 ch = keccak256(bytes(text));
        bytes32 nonce = keccak256(abi.encode(posts.TAG_NODE(), id, uint64(0), uint8(0), ch, ch, salt));
        uint64 nodeId = posts.createWithAuth(id, 0, 0, text, ch, salt, _auth(500_000, nonce));
        assertEq(nodeId, 1);
        assertEq(USDC.balanceOf(address(posts)), 1_500_000);
        assertEq(USDC.balanceOf(alice), 8_500_000);
    }

    function test_RealUsdc_ReceiveSignatureCannotBeUsedAsTransfer() public {
        vm.skip(!vm.envOr("FORK", false));
        bytes32 nonce = keccak256("some-nonce");
        Posts.Auth memory a = _auth(50_000, nonce);
        bytes32 r;
        bytes32 s;
        uint8 v;
        bytes memory sig = a.signature;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        // 同一份 ReceiveWithAuthorization 签名拿去当 transferWithAuthorization 用：typehash 不同，验签失败
        vm.expectRevert();
        USDC.transferWithAuthorization(alice, address(posts), 50_000, 0, a.validBefore, nonce, v, r, s);
    }
}
