import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { art } from "../lib/art";
import { fmtUsdc } from "../lib/format";
import { flowsStore, useStore } from "../lib/store";
import { Avatar } from "./Avatar";

const SOURCE_TEXT: Record<string, string> = { like: "有人点赞了", reply: "有人回复了", repost: "有人转发了" };

/** 资金流：每一笔分账实时滚动（先拉最近的，再由推送补充） */
export function FlowTicker({ limit = 8 }: { limit?: number }) {
  const flows = useStore(flowsStore);
  const seed = useQuery({ queryKey: ["flows"], queryFn: () => api.flows(30), staleTime: 60_000 });
  useEffect(() => {
    if (seed.data && flowsStore.get().length === 0) flowsStore.set(() => seed.data.items);
  }, [seed.data]);
  return (
    <section className="box">
      <h3>
        资金流 <span className="small muted">实时</span>
      </h3>
      {flows.length === 0 && <div className="box-empty">还没有互动。</div>}
      <ul>
        {flows.slice(0, limit).map((s) => (
          <li key={`${s.txHash}-${s.logIndex}`}>
            <Link to={`/n/${s.nodeId}`} className="ticker-row" title={`分账沿传播链往上第 ${s.depth} 层`}>
              <Avatar id={s.toAccountId} name={s.toName} size="md" />
              <span className="ticker-body">
                <span className="who">{s.toName ?? `#${s.toAccountId}`}</span>
                <span className="small muted">
                  {SOURCE_TEXT[s.source ?? ""] ?? "有人互动了"} #{s.nodeId}
                  {s.depth > 0 ? ` · 上游第 ${s.depth} 层` : ""}
                </span>
              </span>
              <b className="amt">+{fmtUsdc(s.amount)}</b>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TopEarners() {
  const q = useQuery({ queryKey: ["leaderboard", "earned"], queryFn: () => api.leaderboard("earned"), refetchInterval: 10_000 });
  return (
    <section className="box">
      <h3>
        谁赚得最多 <Link to="/rank">看全部</Link>
      </h3>
      <ol>
        {(q.data?.items ?? []).slice(0, 5).map((r) => (
          <li key={r.accountId}>
            <Link to={`/a/${r.accountId}`} className="rank-row">
              <span className={`rank-no ${r.rank <= 3 ? "top" : ""}`}>{r.rank}</span>
              <Avatar id={r.accountId} name={r.name} size="md" />
              <span className="rank-name">
                <b>{r.name ?? `账号 #${r.accountId}`}</b>
                <span className="small muted">#{r.accountId}</span>
              </span>
              <b className="amt">{fmtUsdc(r.value)}</b>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function StatsCard() {
  const q = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 5000 });
  const s = q.data;
  const img = art("side");
  return (
    <section className="box">
      {img && <img className="box-art" src={img} alt="" />}
      <h3>
        现在的 avaXLand <span className="small muted">USDC</span>
      </h3>
      <div className="stats">
        <div>
          <b>{s?.accounts ?? "–"}</b>
          <span className="small muted">账号</span>
        </div>
        <div>
          <b>{s?.nodes ?? "–"}</b>
          <span className="small muted">帖子</span>
        </div>
        <div>
          <b>{s?.likes ?? "–"}</b>
          <span className="small muted">点赞</span>
        </div>
        <div className="wide">
          <div>
            <b className="ok">{s ? fmtUsdc(s.distributed, 2) : "–"}</b>
            <span className="small muted">已分给作者</span>
          </div>
          <div>
            <b>{s ? fmtUsdc(s.treasury, 2) : "–"}</b>
            <span className="small muted">进了国库</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SideFoot() {
  return <p className="foot-note">avaXLand · 跑在 Avalanche 上的付费社交 · 每一笔互动都在链上、都能点开核对</p>;
}
