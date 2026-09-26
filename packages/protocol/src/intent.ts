import { encodeAbiParameters, keccak256, stringToBytes, toHex, type Address, type Hex } from "viem";
import { DEFAULT_EXCERPT_MAX_BYTES, TAG_LIKE, TAG_MINT, TAG_NODE, type Kind } from "./constants";

/** 全文指纹：keccak256(UTF-8 字节) */
export function contentHash(text: string): Hex {
  return keccak256(stringToBytes(text));
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** UTF-8 前缀截断：不超过 maxBytes，且不切断多字节字符。短文原样返回。与 Intent.t.sol 的 _excerpt 一致。 */
export function excerptOf(text: string, maxBytes: number = DEFAULT_EXCERPT_MAX_BYTES): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

export function randomSalt(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** 开户意图：keccak256(abi.encode(TAG_MINT, to, salt)) */
export function nonceForMint(to: Address, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "bytes32" }], [TAG_MINT, to, salt]),
  );
}

export interface NodeIntentInput {
  accountId: bigint;
  parentId: bigint;
  kind: Kind;
  contentHash: Hex;
  excerpt: string;
  salt: Hex;
}

/** 发帖/回复/转发意图：keccak256(abi.encode(TAG_NODE, accountId, parentId, kind, contentHash, keccak256(excerpt), salt)) */
export function nonceForNode(i: NodeIntentInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [TAG_NODE, i.accountId, i.parentId, i.kind, i.contentHash, keccak256(stringToBytes(i.excerpt)), i.salt],
    ),
  );
}

/** 点赞意图：keccak256(abi.encode(TAG_LIKE, accountId, nodeId))，无 salt，所以同账号对同节点只可能有一个 nonce */
export function nonceForLike(accountId: bigint, nodeId: bigint): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }, { type: "uint64" }], [TAG_LIKE, accountId, nodeId]),
  );
}

export interface NodeIntent {
  contentHash: Hex;
  excerpt: string;
  excerptHash: Hex;
  nonce: Hex;
  salt: Hex;
}

/** 服务端与客户端共用：从全文算出上链摘要与意图哈希。 */
export function buildNodeIntent(p: {
  accountId: bigint;
  parentId: bigint;
  kind: Kind;
  content: string;
  salt: Hex;
  maxExcerptBytes?: number;
}): NodeIntent {
  const excerpt = excerptOf(p.content, p.maxExcerptBytes ?? DEFAULT_EXCERPT_MAX_BYTES);
  const ch = contentHash(p.content);
  const nonce = nonceForNode({
    accountId: p.accountId,
    parentId: p.parentId,
    kind: p.kind,
    contentHash: ch,
    excerpt,
    salt: p.salt,
  });
  return { contentHash: ch, excerpt, excerptHash: keccak256(stringToBytes(excerpt)), nonce, salt: p.salt };
}
