import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { PageHead } from "../components/PageHead";
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
    <>
      <PageHead title="排行榜" sub={tab.hint} />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${t.key === tab.key ? "active" : ""}`} onClick={() => setTab(t)}>
            {t.label}
          </button>
        ))}
      </div>
      <ol>
        {(q.data?.items ?? []).map((r) => (
          <li key={r.accountId}>
            <Link to={`/a/${r.accountId}`} className="rank-row lg">
              <span className={`rank-no ${r.rank <= 3 ? "top" : ""}`}>{r.rank}</span>
              <Avatar id={r.accountId} name={r.name} />
              <span className="rank-name">
                <b>{r.name ?? `账号 #${r.accountId}`}</b>
                <span className="small muted">#{r.accountId}</span>
              </span>
              <b className={tab.money ? "amt" : ""}>{tab.money ? `${fmtUsdc(r.value)} USDC` : r.value}</b>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
