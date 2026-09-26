import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fmtUsdc } from "../lib/format";

const TABS = [
  { key: "earned", label: "总收益", hint: "传播树分回来的 USDC", money: true },
  { key: "received", label: "总被互动", hint: "被赞 + 被回复 + 被转发", money: false },
  { key: "spent", label: "总投入", hint: "付过的所有费用", money: true },
] as const;

export function LeaderboardPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const q = useQuery({ queryKey: ["leaderboard", tab.key], queryFn: () => api.leaderboard(tab.key), refetchInterval: 8000 });
  return (
    <div className="card">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${t.key === tab.key ? "active" : ""}`} onClick={() => setTab(t)}>
            {t.label}
          </button>
        ))}
        <span className="small muted">{tab.hint}</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>账号</th>
            <th className="num">{tab.label}</th>
          </tr>
        </thead>
        <tbody>
          {(q.data?.items ?? []).map((r) => (
            <tr key={r.accountId}>
              <td>{r.rank}</td>
              <td>
                <Link to={`/a/${r.accountId}`}>{r.name ?? `#${r.accountId}`}</Link> <span className="muted small">#{r.accountId}</span>
              </td>
              <td className="num">{tab.money ? `${fmtUsdc(r.value)} USDC` : r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
