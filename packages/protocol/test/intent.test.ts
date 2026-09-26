import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keccak256, stringToBytes } from "viem";
import {
  TAG_LIKE,
  TAG_MINT,
  TAG_NODE,
  contentHash,
  excerptOf,
  nonceForLike,
  nonceForMint,
  nonceForNode,
  utf8ByteLength,
} from "../src";

// 标准答案由 contracts/test/Intent.t.sol 生成（forge test 时写入）
const vectors = JSON.parse(
  readFileSync(new URL("../../../contracts/test/vectors/intent.json", import.meta.url), "utf8"),
);

describe("intent hash matches Solidity vectors", () => {
  it("tags", () => {
    expect(TAG_MINT).toBe(vectors.TAG_MINT);
    expect(TAG_NODE).toBe(vectors.TAG_NODE);
    expect(TAG_LIKE).toBe(vectors.TAG_LIKE);
  });

  for (const name of ["node_ascii", "node_cjk_long", "repost_empty"]) {
    it(name, () => {
      const v = vectors[name];
      const excerpt = excerptOf(v.fullText, 600);
      expect(excerpt).toBe(v.excerpt);
      expect(utf8ByteLength(excerpt)).toBe(v.excerptBytes);
      expect(utf8ByteLength(excerpt)).toBeLessThanOrEqual(600);
      expect(contentHash(v.fullText)).toBe(v.contentHash);
      expect(keccak256(stringToBytes(excerpt))).toBe(v.excerptHash);
      expect(
        nonceForNode({
          accountId: BigInt(v.accountId),
          parentId: BigInt(v.parentId),
          kind: v.kind,
          contentHash: v.contentHash,
          excerpt,
          salt: v.salt,
        }),
      ).toBe(v.nonce);
    });
  }

  it("like", () => {
    const v = vectors.like;
    expect(nonceForLike(BigInt(v.accountId), BigInt(v.nodeId))).toBe(v.nonce);
  });

  it("mint", () => {
    const v = vectors.mint;
    expect(nonceForMint(v.to, v.salt)).toBe(v.nonce);
  });

  it("cjk truncation never splits a character", () => {
    const text = "A" + "区块链".repeat(300);
    const e = excerptOf(text, 600);
    expect(utf8ByteLength(e)).toBe(598);
    expect(e.endsWith("链") || e.endsWith("块") || e.endsWith("区")).toBe(true);
  });
});
