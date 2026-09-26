import { Hono } from "hono";
import { accountAbi, postsAbi, type FeedPage, type LeaderboardRow, type TreeDTO } from "@avaxland/protocol";
import { getAddress, isAddress } from "viem";
import { deployment, getConfig, publicClient } from "../config";
import type { NodeRow, Queries } from "../db/queries";
import { toAccountDTO, toNodeDTO, toSplitDTO } from "./dto";

export function createApi(q: Queries) {
  const api = new Hono();

  api.get("/config", (c) => c.json(getConfig()));

  api.get("/stats", (c) => {
    const s = q.stats.get() as Record<string, number>;
    return c.json({ ...s, distributed: String(s.distributed), treasury: String(s.treasury), relayer: undefined });
  });

  api.get("/feed", (c) => {
    const cursor = Number(c.req.query("cursor") ?? Number.MAX_SAFE_INTEGER);
    const limit = Math.min(Number(c.req.query("limit") ?? 30), 100);
    const rows = q.feed.all(cursor, limit) as NodeRow[];
    const items = rows.map((r) => toNodeDTO(q, r));
    // 转发在 feed 里要带上被转发的那条
    const parentIds = rows.filter((r) => r.kind === 2).map((r) => r.parent_id);
    const parents = new Map(q.nodesByIds([...new Set(parentIds)]).map((r) => [r.id, toNodeDTO(q, r)]));
    for (const it of items) if (it.kind === 2) it.parent = parents.get(it.parentId) ?? null;
    const page: FeedPage = { items, nextCursor: rows.length === limit ? rows[rows.length - 1]!.id : null };
    return c.json(page);
  });

  /** 增量拉取：id 大于 since 的所有节点（Agent 轮询用） */
  api.get("/feed/since/:id", (c) => {
    const since = Number(c.req.param("id"));
    const rows = q.feedSince.all(since, 200) as NodeRow[];
    return c.json({ items: rows.map((r) => toNodeDTO(q, r)) });
  });

  api.get("/nodes/:id", (c) => {
    const id = Number(c.req.param("id"));
    const row = q.node.get(id) as NodeRow | undefined;
    if (!row) return c.json({ error: "NODE_NOT_FOUND" }, 404);
    const ancestors: NodeRow[] = [];
    let cur = row;
    while (cur.parent_id !== 0) {
      const p = q.node.get(cur.parent_id) as NodeRow | undefined;
      if (!p) break;
      ancestors.unshift(p);
      cur = p;
    }
    const children = q.children.all(id) as NodeRow[];
    const ids = [id, ...children.map((r) => r.id)];
    const splitsByNode: TreeDTO["splitsByNode"] = {};
    for (const s of q.splitsForNodes(ids)) (splitsByNode[s.node_id] ??= []).push(toSplitDTO(s));
    const tree: TreeDTO = {
      node: toNodeDTO(q, row),
      ancestors: ancestors.map((r) => toNodeDTO(q, r)),
      children: children.map((r) => toNodeDTO(q, r)),
      splitsByNode,
    };
    return c.json(tree);
  });

  api.get("/nodes/:id/tree", (c) => {
    const id = Number(c.req.param("id"));
    const row = q.node.get(id) as NodeRow | undefined;
    if (!row) return c.json({ error: "NODE_NOT_FOUND" }, 404);
    const descendants = q.descendants.all(id) as NodeRow[];
    const ids = [id, ...descendants.map((r) => r.id)];
    const splitsByNode: TreeDTO["splitsByNode"] = {};
    for (const s of q.splitsForNodes(ids)) (splitsByNode[s.node_id] ??= []).push(toSplitDTO(s));
    const tree: TreeDTO = {
      node: toNodeDTO(q, row),
      ancestors: [],
      children: descendants.filter((r) => r.parent_id === id).map((r) => toNodeDTO(q, r)),
      descendants: descendants.map((r) => toNodeDTO(q, r)),
      splitsByNode,
    };
    return c.json(tree);
  });

  api.get("/accounts/by-owner/:addr", (c) => {
    const addr = c.req.param("addr");
    if (!isAddress(addr)) return c.json({ error: "BAD_REQUEST" }, 400);
    const rows = q.accountsByOwner.all(getAddress(addr)) as { id: number; name: string | null; owner: string }[];
    return c.json({ items: rows.map((r) => ({ id: r.id, name: r.name, owner: r.owner })) });
  });

  api.get("/accounts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const row = q.account.get(id) as import("../db/queries").AccountRow | undefined;
    if (!row) return c.json({ error: "ACCOUNT_NOT_FOUND" }, 404);
    const posts = deployment.posts;
    const [stats, badges, pending, tier] = await Promise.all([
      publicClient.readContract({ address: posts, abi: postsAbi, functionName: "stats", args: [BigInt(id)] }),
      publicClient.readContract({ address: posts, abi: postsAbi, functionName: "badgeBits", args: [BigInt(id)] }),
      publicClient.readContract({ address: posts, abi: postsAbi, functionName: "pending", args: [BigInt(id)] }),
      publicClient.readContract({ address: deployment.account, abi: accountAbi, functionName: "tierOf", args: [BigInt(id)] }),
    ]);
    const dto = toAccountDTO(q, { ...row, tier }, { stats, badges, pending, mintFee: BigInt(getConfig().prices.mint) });
    const badgeRows = q.accountBadges.all(id) as { metric: number; tier: number; threshold: number; tx_hash: string; created_at: number }[];
    return c.json({ ...dto, badgeList: badgeRows.map((b) => ({ ...b, threshold: String(b.threshold), txHash: b.tx_hash })) });
  });

  api.get("/leaderboard", (c) => {
    const kind = c.req.query("kind") ?? "earned";
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
    const stmt = kind === "spent" ? q.leaderboardSpent : kind === "received" ? q.leaderboardReceived : q.leaderboardEarned;
    const rows = stmt.all({ limit, mintFee: Number(getConfig().prices.mint) }) as { account_id: number; name: string | null; value: number }[];
    const items: LeaderboardRow[] = rows.map((r, i) => ({ accountId: r.account_id, name: r.name, value: String(r.value), rank: i + 1 }));
    return c.json({ kind, items });
  });

  api.get("/flows", (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    return c.json({ items: q.flows.all(limit).map((r) => toSplitDTO(r as never)) });
  });

  return api;
}
