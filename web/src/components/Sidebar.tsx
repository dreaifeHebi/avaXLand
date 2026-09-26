import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fmtUsdc } from "../lib/format";
import { flowsStore, useStore } from "../lib/store";

/** 资金流：每一笔分账实时滚动（先拉最近的，再由推送补充） */
export function FlowTicker() {
  const flows = useStore(flowsStore);
  const seed = useQuery({ queryKey: ["flows"], queryFn: () => api.flows(15), staleTime: 60_000 });
  useEffect(() => {
    if (seed.data && flowsStore.get().length === 0) flowsStore.set(() => seed.data.items);
  }, [seed.data]);
  return (
    <div className="card side-card">
      <h4>资金流</h4>
      {flows.length === 0 && <div className="small muted">还没有互动。</div>}
      <ul className="ticker">
        {flows.slice(0, 15).map((s) => (
          <li key={`${s.txHash}-${s.logIndex}`} className="ticker-row">
            <span className="small muted">{s.source === "like" ? "赞" : s.source === "reply" ? "回复" : s.source === "repost" ? "转发" : "互动"} #{s.nodeId}</span>
            <span className="arrow">→</span>
            <Link to={`/a/${s.toAccountId}`} className="small">
              {s.toName ?? `#${s.toAccountId}`}
            </Link>
            <b className="amt">+{fmtUsdc(s.amount)}</b>
            <span className="small muted">d{s.depth}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopEarners() {
  const q = useQuery({ queryKey: ["leaderboard", "earned"], queryFn: () => api.leaderboard("earned"), refetchInterval: 10_000 });
  return (
    <div className="card side-card">
      <h4>
        总收益 Top 5 <Link to="/rank" className="small muted">全部 →</Link>
      </h4>
      <ol className="ranks">
        {(q.data?.items ?? []).slice(0, 5).map((r) => (
          <li key={r.accountId}>
            <Link to={`/a/${r.accountId}`}>{r.name ?? `#${r.accountId}`}</Link>
            <b className="amt">{fmtUsdc(r.value)} USDC</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function StatsCard() {
  const q = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 5000 });
  const s = q.data;
  return (
    <div className="card side-card stats">
      <div>
        <b>{s?.accounts ?? "–"}</b>
        <span className="small muted">账号</span>
      </div>
      <div>
        <b>{s?.nodes ?? "–"}</b>
        <span className="small muted">节点</span>
      </div>
      <div>
        <b>{s?.likes ?? "–"}</b>
        <span className="small muted">点赞</span>
      </div>
      <div>
        <b>{s ? fmtUsdc(s.distributed, 2) : "–"}</b>
        <span className="small muted">已分给作者</span>
      </div>
      <div>
        <b>{s ? fmtUsdc(s.treasury, 2) : "–"}</b>
        <span className="small muted">国库</span>
      </div>
    </div>
  );
}
