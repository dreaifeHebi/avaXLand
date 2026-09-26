import { keccak256, stringToBytes } from "viem";

/** 三种意图的标签，与 Posts.sol 里的 TAG_* 一致（keccak256 of the ASCII string）。 */
export const TAG_MINT = keccak256(stringToBytes("MINT"));
export const TAG_NODE = keccak256(stringToBytes("NODE"));
export const TAG_LIKE = keccak256(stringToBytes("LIKE"));

export const Kind = { Post: 0, Reply: 1, Repost: 2 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];
export const KIND_NAMES = ["post", "reply", "repost"] as const;

export const Metric = {
  PostsMade: 0,
  RepliesMade: 1,
  RepostsMade: 2,
  LikesGiven: 3,
  LikesReceived: 4,
  RepliesReceived: 5,
  RepostsReceived: 6,
  EarnedUsdc: 7,
} as const;
export type Metric = (typeof Metric)[keyof typeof Metric];
export const METRIC_NAMES = [
  "postsMade",
  "repliesMade",
  "repostsMade",
  "likesGiven",
  "likesReceived",
  "repliesReceived",
  "repostsReceived",
  "earnedUsdc",
] as const;

export const USDC_DECIMALS = 6;
/** tier 0 的摘要字节上限；真正的上限以合约 maxExcerptBytes(tier) 为准 */
export const DEFAULT_EXCERPT_MAX_BYTES = 600;
/** 客户端默认签 5 分钟有效的授权 */
export const DEFAULT_AUTH_VALIDITY_SECONDS = 300;
export const X402_VERSION = 2;
