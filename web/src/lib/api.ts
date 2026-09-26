import type { AccountDTO, ConfigDTO, FeedPage, LeaderboardRow, NodeDTO, SplitDTO, TreeDTO } from "@avaxland/protocol";

/** 开发时 Vite 把 /api 代理到 8787；打包后由服务端同源托管，直接同源请求 */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) || (import.meta.env.DEV ? "/api" : "");

export const WS_URL: string = (() => {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (base) return base.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  return proto + location.host + "/ws";
})();

async function get<T>(path: string): Promise<T> {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return (await r.json()) as T;
}

export interface BadgeEntry {
  metric: number;
  tier: number;
  threshold: string;
  txHash: string;
  created_at: number;
}
export type AccountView = AccountDTO & { badgeList: BadgeEntry[] };
export interface MyAccount {
  id: number;
  name: string | null;
  owner: string;
}
export interface Stats {
  accounts: number;
  nodes: number;
  likes: number;
  distributed: string;
  treasury: string;
}

export const api = {
  config: () => get<ConfigDTO>("/config"),
  stats: () => get<Stats>("/stats"),
  feed: (cursor?: number | null) => get<FeedPage>(`/feed?limit=20${cursor ? `&cursor=${cursor}` : ""}`),
  node: (id: number) => get<TreeDTO>(`/nodes/${id}`),
  nodeTree: (id: number) => get<TreeDTO>(`/nodes/${id}/tree`),
  account: (id: number) => get<AccountView>(`/accounts/${id}`),
  accountsByOwner: (addr: string) => get<{ items: MyAccount[] }>(`/accounts/by-owner/${addr}`),
  leaderboard: (kind: "spent" | "received" | "earned") => get<{ kind: string; items: LeaderboardRow[] }>(`/leaderboard?kind=${kind}&limit=20`),
  flows: (limit = 20) => get<{ items: SplitDTO[] }>(`/flows?limit=${limit}`),
};

export type { NodeDTO, SplitDTO, TreeDTO, ConfigDTO, LeaderboardRow };
