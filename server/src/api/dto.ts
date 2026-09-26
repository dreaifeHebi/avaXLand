import type { AccountDTO, NodeDTO, SplitDTO } from "@avaxland/protocol";
import type { Hex } from "viem";
import type { AccountRow, NodeRow, Queries, SplitRow } from "../db/queries";

export function toNodeDTO(q: Queries, r: NodeRow): NodeDTO {
  const earned = (q.nodeEarned.get({ author: r.author_id, id: r.id, isRoot: r.parent_id === 0 ? 1 : 0 }) as { v: number }).v;
  return {
    id: r.id,
    parentId: r.parent_id,
    rootId: r.root_id,
    authorId: r.author_id,
    authorName: r.author_name ?? null,
    kind: r.kind as 0 | 1 | 2,
    excerpt: r.excerpt,
    fullText: r.full_text,
    contentHash: r.content_hash as Hex,
    fee: String(r.fee),
    txHash: r.tx_hash as Hex,
    createdAt: r.created_at,
    likes: r.likes,
    replies: r.replies,
    reposts: r.reposts,
    earned: String(earned),
  };
}

export function toSplitDTO(r: SplitRow): SplitDTO {
  return {
    txHash: r.tx_hash as Hex,
    logIndex: r.log_index,
    nodeId: r.node_id,
    toAccountId: r.to_account,
    toName: r.to_name ?? null,
    depth: r.depth,
    amount: String(r.amount),
    source: (r.source as SplitDTO["source"]) ?? null,
    sourceId: r.source_id,
    sourceAccountId: r.source_account,
    createdAt: r.created_at,
  };
}

export function toAccountDTO(
  q: Queries,
  r: AccountRow,
  extra: { stats: readonly bigint[]; badges: number; pending: bigint; mintFee: bigint },
): AccountDTO {
  const spent = (q.accountSpent.get({ id: r.id }) as { v: number }).v;
  return {
    id: r.id,
    owner: r.owner as `0x${string}`,
    name: r.name,
    tier: r.tier,
    stats: extra.stats.map(String),
    badges: extra.badges,
    pending: extra.pending.toString(),
    spent: (BigInt(spent) + extra.mintFee).toString(),
    rank: { spent: null, received: null, earned: null },
  };
}
