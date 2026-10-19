import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { PageHead } from "../components/PageHead";
import { api } from "../lib/api";

const TABS = [
  { key: "earned", label: "rank.earned", hint: "rank.earnedHint", money: true },
  { key: "received", label: "rank.received", hint: "rank.receivedHint", money: false },
  { key: "spent", label: "rank.spent", hint: "rank.spentHint", money: true },
] as const;

export function LeaderboardPage() {
  const { t } = useI18n();
  const { fmtUsdc, number } = useFormat();
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const q = useQuery({ queryKey: ["leaderboard", tab.key], queryFn: () => api.leaderboard(tab.key), refetchInterval: 8000 });
  return (
    <>
      <PageHead title={t("nav.rank")} sub={t(tab.hint)} />
      <div className="tabs">
        {TABS.map((item) => (
          <button key={item.key} className={`tab ${item.key === tab.key ? "active" : ""}`} onClick={() => setTab(item)}>
            {t(item.label)}
          </button>
        ))}
      </div>
      <ol>
        {(q.data?.items ?? []).map((r) => (
          <li key={r.accountId}>
            <Link to={`/a/${r.accountId}`} className="rank-row lg">
              <span className={`rank-no ${r.rank <= 3 ? "top" : ""}`}>{number(r.rank)}</span>
              <Avatar id={r.accountId} name={r.name} />
              <span className="rank-name">
                <b>{r.name ?? t("account.id", { id: String(r.accountId) })}</b>
                <span className="small muted">#{r.accountId}</span>
              </span>
              <b className={tab.money ? "amt" : ""}>{tab.money ? `${fmtUsdc(r.value)} USDC` : number(r.value)}</b>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
