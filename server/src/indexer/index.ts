import { accountAbi, postsAbi, type WsMessage } from "@avaxland/protocol";
import type { AbiEvent, Hex, Log, PublicClient } from "viem";
import type { Deployment } from "@avaxland/protocol";
import type { Queries } from "../db/queries";
import type { Hub } from "../ws/hub";
import type { DB } from "../db/index";
import { toNodeDTO, toSplitDTO } from "../api/dto";

const STEP = 2000n; // 公共 RPC 一次 getLogs 最多 2048 块
const postsEvents = postsAbi.filter((x) => x.type === "event") as AbiEvent[];
const transferEvent = accountAbi.find((x) => x.type === "event" && x.name === "Transfer") as AbiEvent;

type DecodedLog = Log<bigint, number, false, undefined, true, AbiEvent[], string> & {
  eventName: string;
  args: Record<string, unknown>;
};

interface TxCtx {
  txHash: Hex;
  source: "like" | "reply" | "repost" | null;
  sourceId: number | null;
  sourceAccount: number | null;
}

export interface Indexer {
  stop(): void;
  cursor(): bigint;
}

/**
 * 链 → SQLite 的投影。回放与实时用同一条路径：从游标（没有则从部署区块）追到最新块，每批最多 2000 块，
 * 处理完一批就把游标落库；(tx_hash, log_index) 主键保证重复处理无副作用。
 */
export function startIndexer(opts: {
  db: DB;
  q: Queries;
  client: PublicClient;
  deployment: Deployment;
  hub: Hub;
  pollIntervalMs: number;
  log?: (msg: string) => void;
}): Indexer {
  const { db, q, client, deployment, hub } = opts;
  const log = opts.log ?? ((m: string) => console.log(`[indexer] ${m}`));
  const tsCache = new Map<bigint, number>();
  let stopped = false;
  let cursor = BigInt((q.getCursor.get() as { block: number } | undefined)?.block ?? deployment.deployBlock - 1);

  async function blockTs(n: bigint): Promise<number> {
    const hit = tsCache.get(n);
    if (hit !== undefined) return hit;
    const b = await client.getBlock({ blockNumber: n });
    const ts = Number(b.timestamp);
    tsCache.set(n, ts);
    if (tsCache.size > 5000) tsCache.delete(tsCache.keys().next().value!);
    return ts;
  }

  const applyBatch = db.transaction((logs: DecodedLog[], tsByBlock: Map<bigint, number>, toBlock: bigint) => {
    const out: WsMessage[] = [];
    let ctx: TxCtx | null = null;
    for (const l of logs) {
      if (!ctx || ctx.txHash !== l.transactionHash) ctx = { txHash: l.transactionHash!, source: null, sourceId: null, sourceAccount: null };
      handle(l, tsByBlock.get(l.blockNumber!)!, ctx, out);
    }
    q.setCursor.run(Number(toBlock));
    return out;
  });

  function handle(l: DecodedLog, ts: number, ctx: TxCtx, out: WsMessage[]) {
    const a = l.args as Record<string, any>;
    const txHash = l.transactionHash as Hex;
    const logIndex = l.logIndex!;
    const addr = l.address.toLowerCase();
    switch (l.eventName) {
      case "Transfer": {
        if (addr !== deployment.account.toLowerCase()) return;
        const id = Number(a.tokenId);
        if (a.from !== "0x0000000000000000000000000000000000000000") q.setOwner.run(a.to, id);
        else q.upsertAccount.run({ id, owner: a.to, mintedTx: txHash, createdAt: ts });
        return;
      }
      case "AccountMinted": {
        const id = Number(a.accountId);
        q.upsertAccount.run({ id, owner: a.to, mintedTx: txHash, createdAt: ts });
        const row = q.account.get(id) as { name: string | null } | undefined;
        out.push({ type: "account", account: { id, owner: a.to, name: row?.name ?? null }, txHash });
        return;
      }
      case "NodeCreated": {
        const id = Number(a.id);
        const parentId = Number(a.parentId);
        const kind = Number(a.kind);
        const authorId = Number(a.authorAccountId);
        const parent = parentId ? (q.node.get(parentId) as { root_id: number } | undefined) : undefined;
        const rootId = parentId === 0 ? id : (parent?.root_id ?? parentId);
        const pending = q.getPendingContent.get(a.contentHash) as { full_text: string } | undefined;
        const res = q.insertNode.run({
          id,
          parentId,
          rootId,
          authorId,
          kind,
          excerpt: a.excerpt,
          contentHash: a.contentHash,
          fullText: pending?.full_text ?? null,
          fee: Number(a.fee),
          txHash,
          logIndex,
          block: Number(l.blockNumber),
          createdAt: ts,
        });
        if (res.changes === 0) return; // 已处理过
        if (kind === 1) q.bumpReplies.run(parentId);
        if (kind === 2) q.bumpReposts.run(parentId);
        ctx.source = kind === 1 ? "reply" : kind === 2 ? "repost" : null;
        ctx.sourceId = id;
        ctx.sourceAccount = authorId;
        const row = q.node.get(id) as import("../db/queries").NodeRow;
        out.push({ type: "node", node: toNodeDTO(q, row) });
        return;
      }
      case "Liked": {
        const nodeId = Number(a.nodeId);
        const by = Number(a.byAccountId);
        const res = q.insertLike.run({ nodeId, byAccount: by, fee: Number(a.fee), txHash, logIndex, createdAt: ts });
        if (res.changes === 0) return;
        q.bumpLikes.run(nodeId);
        ctx.source = "like";
        ctx.sourceId = nodeId;
        ctx.sourceAccount = by;
        out.push({ type: "like", nodeId, byAccountId: by, fee: String(a.fee), txHash });
        return;
      }
      case "Split": {
        const res = q.insertSplit.run({
          txHash,
          logIndex,
          nodeId: Number(a.nodeId),
          toAccount: Number(a.toAccountId),
          depth: Number(a.depth),
          amount: Number(a.amount),
          source: ctx.source,
          sourceId: ctx.sourceId,
          sourceAccount: ctx.sourceAccount,
          createdAt: ts,
        });
        if (res.changes === 0) return;
        const toName = (q.account.get(Number(a.toAccountId)) as { name: string | null } | undefined)?.name ?? null;
        out.push({
          type: "split",
          split: toSplitDTO({
            tx_hash: txHash,
            log_index: logIndex,
            node_id: Number(a.nodeId),
            to_account: Number(a.toAccountId),
            depth: Number(a.depth),
            amount: Number(a.amount),
            source: ctx.source,
            source_id: ctx.sourceId,
            source_account: ctx.sourceAccount,
            created_at: ts,
            to_name: toName,
          }),
        });
        return;
      }
      case "TreasuryAccrued":
        q.insertTreasury.run({ txHash, logIndex, nodeId: Number(a.nodeId), amount: Number(a.amount), createdAt: ts });
        return;
      case "BadgeUnlocked": {
        const accountId = Number(a.accountId);
        const res = q.insertBadge.run({ accountId, metric: Number(a.metric), tier: Number(a.tier), threshold: Number(a.threshold), txHash, createdAt: ts });
        if (res.changes === 0) return;
        out.push({ type: "badge", accountId, metric: Number(a.metric), tier: Number(a.tier), threshold: String(a.threshold), txHash });
        return;
      }
      case "Claimed": {
        const res = q.insertClaim.run({ txHash, logIndex, accountId: Number(a.accountId), amount: Number(a.amount), toAddr: a.to, voucherId: Number(a.voucherId), createdAt: ts });
        if (res.changes === 0) return;
        out.push({ type: "claim", accountId: Number(a.accountId), amount: String(a.amount), to: a.to, voucherId: Number(a.voucherId), txHash });
        return;
      }
      default:
        return;
    }
  }

  async function catchUp() {
    const latest = await client.getBlockNumber();
    while (!stopped && cursor < latest) {
      const from = cursor + 1n;
      const to = from + STEP - 1n < latest ? from + STEP - 1n : latest;
      const logs = (await client.getLogs({
        address: [deployment.posts, deployment.account],
        events: [...postsEvents, transferEvent],
        fromBlock: from,
        toBlock: to,
      })) as unknown as DecodedLog[];
      logs.sort((x, y) => (x.blockNumber! === y.blockNumber! ? x.logIndex! - y.logIndex! : Number(x.blockNumber! - y.blockNumber!)));
      const tsByBlock = new Map<bigint, number>();
      for (const l of logs) if (!tsByBlock.has(l.blockNumber!)) tsByBlock.set(l.blockNumber!, await blockTs(l.blockNumber!));
      const messages = applyBatch(logs, tsByBlock, to);
      for (const m of messages) hub.publish(m);
      if (logs.length) log(`blocks ${from}-${to}: ${logs.length} logs`);
      cursor = to;
    }
  }

  (async () => {
    log(`start from block ${cursor + 1n}`);
    while (!stopped) {
      try {
        await catchUp();
      } catch (e) {
        log(`error: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, Math.max(opts.pollIntervalMs, 2000)));
      }
      await new Promise((r) => setTimeout(r, opts.pollIntervalMs));
    }
  })();

  return { stop: () => (stopped = true), cursor: () => cursor };
}
