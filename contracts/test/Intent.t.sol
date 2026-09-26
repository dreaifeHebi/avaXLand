// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

/// 生成「意图哈希」的标准答案 test/vectors/intent.json，供 packages/protocol 的 TypeScript 实现比对。
/// 这里的算法必须与 Posts.sol 里的三处 keccak256(abi.encode(...)) 完全一致。
contract IntentVectors is Test {
    bytes32 constant TAG_MINT = keccak256("MINT");
    bytes32 constant TAG_NODE = keccak256("NODE");
    bytes32 constant TAG_LIKE = keccak256("LIKE");

    function test_WriteVectors() public {
        string memory cjk = "A";
        for (uint256 i = 0; i < 40; i++) {
            cjk = string(abi.encodePacked(cjk, unicode"区块链上的付费社交，每个写操作都花一点钱。"));
        }
        string memory v1 = _node("node_ascii", 1, 0, 0, "hello avaXLand", keccak256("salt-1"));
        string memory v2 = _node("node_cjk_long", 7, 3, 1, cjk, keccak256("salt-2"));
        string memory v3 = _node("repost_empty", 2, 1, 2, "", keccak256("salt-3"));
        string memory v4 = _like("like", 5, 42);
        string memory v5 = _mint("mint", 0x1111111111111111111111111111111111111111, keccak256("salt-4"));

        vm.serializeBytes32("root", "TAG_MINT", TAG_MINT);
        vm.serializeBytes32("root", "TAG_NODE", TAG_NODE);
        vm.serializeBytes32("root", "TAG_LIKE", TAG_LIKE);
        vm.serializeString("root", "node_ascii", v1);
        vm.serializeString("root", "node_cjk_long", v2);
        vm.serializeString("root", "repost_empty", v3);
        vm.serializeString("root", "like", v4);
        string memory json = vm.serializeString("root", "mint", v5);
        vm.writeJson(json, "./test/vectors/intent.json");
    }

    function _node(string memory name, uint64 accountId, uint64 parentId, uint8 kind, string memory fullText, bytes32 salt)
        internal
        returns (string memory)
    {
        string memory excerpt = _excerpt(bytes(fullText), 600);
        bytes32 ch = keccak256(bytes(fullText));
        bytes32 eh = keccak256(bytes(excerpt));
        bytes32 nonce = keccak256(abi.encode(TAG_NODE, accountId, parentId, kind, ch, eh, salt));
        vm.serializeUint(name, "accountId", accountId);
        vm.serializeUint(name, "parentId", parentId);
        vm.serializeUint(name, "kind", kind);
        vm.serializeString(name, "fullText", fullText);
        vm.serializeString(name, "excerpt", excerpt);
        vm.serializeUint(name, "excerptBytes", bytes(excerpt).length);
        vm.serializeBytes32(name, "salt", salt);
        vm.serializeBytes32(name, "contentHash", ch);
        vm.serializeBytes32(name, "excerptHash", eh);
        return vm.serializeBytes32(name, "nonce", nonce);
    }

    function _like(string memory name, uint64 accountId, uint64 nodeId) internal returns (string memory) {
        vm.serializeUint(name, "accountId", accountId);
        vm.serializeUint(name, "nodeId", nodeId);
        return vm.serializeBytes32(name, "nonce", keccak256(abi.encode(TAG_LIKE, accountId, nodeId)));
    }

    function _mint(string memory name, address to, bytes32 salt) internal returns (string memory) {
        vm.serializeAddress(name, "to", to);
        vm.serializeBytes32(name, "salt", salt);
        return vm.serializeBytes32(name, "nonce", keccak256(abi.encode(TAG_MINT, to, salt)));
    }

    /// UTF-8 前缀截断：不超过 maxBytes，且不切断多字节字符
    function _excerpt(bytes memory b, uint256 maxBytes) internal pure returns (string memory) {
        if (b.length <= maxBytes) return string(b);
        uint256 end = maxBytes;
        while (end > 0 && (uint8(b[end]) & 0xC0) == 0x80) end--;
        bytes memory out = new bytes(end);
        for (uint256 i = 0; i < end; i++) out[i] = b[i];
        return string(out);
    }
}
