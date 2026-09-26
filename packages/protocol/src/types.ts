import type { Address, Hex } from "viem";

/** 金额一律是 USDC 最小单位（6 位小数）的十进制字符串，例如 "200000" = 0.2 USDC */
export type Amount = string;

export interface NodeDTO {
  id: number;
  parentId: number;
  rootId: number;
  authorId: number;
  authorName: string | null;
  kind: 0 | 1 | 2;
  excerpt: string;
  /** 只有经过网关发的帖子才有全文；直接调合约发的为 null，前端标「仅摘要」 */
  fullText: string | null;
  contentHash: Hex;
  fee: Amount;
  txHash: Hex;
  createdAt: number;
  likes: number;
  replies: number;
  reposts: number;
  /** 打在这个节点身上的互动，流给它作者的分账合计 */
  earned: Amount;
  /** 仅 feed 里的转发条目：被转发的原帖 */
  parent?: NodeDTO | null;
}

export interface SplitDTO {
  txHash: Hex;
  logIndex: number;
  /** 被互动的节点 */
  nodeId: number;
  toAccountId: number;
  toName: string | null;
  depth: number;
  amount: Amount;
  /** 这笔分账来自哪种互动，以及由谁触发（同一笔交易里的 Liked / NodeCreated） */
  source: "like" | "reply" | "repost" | null;
  sourceId: number | null;
  sourceAccountId: number | null;
  createdAt: number;
}

export interface AccountDTO {
  id: number;
  owner: Address;
  name: string | null;
  tier: number;
  /** 8 个指标，顺序见 METRIC_NAMES；收益类是 USDC 最小单位 */
  stats: Amount[];
  /** 32 位徽章位图，bit = metric * 4 + tier */
  badges: number;
  /** 从链上实时读的待领余额 */
  pending: Amount;
  spent: Amount;
  rank: { spent: number | null; received: number | null; earned: number | null };
}

export interface FeedPage {
  items: NodeDTO[];
  nextCursor: number | null;
}

export interface TreeDTO {
  node: NodeDTO;
  ancestors: NodeDTO[];
  children: NodeDTO[];
  /** 仅 /nodes/:id/tree：全部后代（含 children） */
  descendants?: NodeDTO[];
  /** 以被互动节点 id 为键 */
  splitsByNode: Record<number, SplitDTO[]>;
}

export interface LeaderboardRow {
  accountId: number;
  name: string | null;
  value: Amount;
  rank: number;
}

export interface ConfigDTO {
  chainId: number;
  network: string;
  addresses: { usdc: Address; account: Address; posts: Address; voucher: Address | null };
  deployBlock: number;
  prices: { mint: Amount; post: Amount; reply: Amount; repost: Amount; like: Amount };
  treasuryBps: number;
  maxDepth: number;
  usdc: { name: string; version: string; decimals: number };
  thresholds: { count: Amount[]; earned: Amount[] };
  excerptMaxBytes: number;
  explorer: string;
}

export type WsMessage =
  | { type: "node"; node: NodeDTO }
  | { type: "like"; nodeId: number; byAccountId: number; fee: Amount; txHash: Hex }
  | { type: "split"; split: SplitDTO }
  | { type: "badge"; accountId: number; metric: number; tier: number; threshold: Amount; txHash: Hex }
  | { type: "claim"; accountId: number; amount: Amount; to: Address; voucherId: number; txHash: Hex }
  | { type: "account"; account: { id: number; owner: Address; name: string | null }; txHash: Hex };

/** deployments/<chain>.json 的形状 */
export interface Deployment {
  chainId: number;
  network: string;
  usdc: Address;
  account: Address;
  posts: Address;
  voucher: Address | null;
  deployBlock: number;
  deployTx: Hex | null;
  deployedAt: string;
  params: {
    mintFee: Amount;
    post: Amount;
    reply: Amount;
    repost: Amount;
    like: Amount;
    treasuryBps: number;
    maxDepth: number;
  };
}
