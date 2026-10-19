import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { art } from "../lib/art";

import { flowsStore, useStore } from "../lib/store";
import { Avatar } from "./Avatar";

const SOURCE_KEYS = { like: "flow.like", reply: "flow.reply", repost: "flow.repost" } as const;

/** 资金流：每一笔分账实时滚动（先拉最近的，再由推送补充） */
export function FlowTicker({ limit = 8 }: { limit?: number }) {
  const { t } = useI18n();
  const { fmtUsdc } = useFormat();
  const flows = useStore(flowsStore);
  const seed = useQuery({ queryKey: ["flows"], queryFn: () => api.flows(30), staleTime: 60_000 });
  useEffect(() => {
    if (seed.data && flowsStore.get().length === 0) flowsStore.set(() => seed.data.items);
  }, [seed.data]);
  return (
    <section className="box">
      <h3> {t("nav.flows")} <span className="small muted">{t("network.live")}</span>
      </h3>
      {flows.length === 0 && <div className="box-empty">{t("flow.empty")}</div>}
      <ul>
        {flows.slice(0, limit).map((s) => (
          <li key={`${s.txHash}-${s.logIndex}`}>
            <Link to={`/n/${s.nodeId}`} className="ticker-row" title={t("flow.depth", { depth: s.depth })}>
              <Avatar id={s.toAccountId} name={s.toName} size="md" />
              <span className="ticker-body">
                <span className="who">{s.toName ?? `#${s.toAccountId}`}</span>
                <span className="small muted">
                  {t(s.source ? SOURCE_KEYS[s.source] : "flow.other")} #{s.nodeId}
                  {s.depth > 0 ? t("flow.upstream", { depth: s.depth }) : ""}
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
  const { t } = useI18n();
  const { fmtUsdc, number } = useFormat();
  const q = useQuery({ queryKey: ["leaderboard", "earned"], queryFn: () => api.leaderboard("earned"), refetchInterval: 10_000 });
  return (
    <section className="box">
      <h3> {t("rank.top")} <Link to="/rank">{t("common.seeAll")}</Link>
      </h3>
      <ol>
        {(q.data?.items ?? []).slice(0, 5).map((r) => (
          <li key={r.accountId}>
            <Link to={`/a/${r.accountId}`} className="rank-row">
              <span className={`rank-no ${r.rank <= 3 ? "top" : ""}`}>{number(r.rank)}</span>
              <Avatar id={r.accountId} name={r.name} size="md" />
              <span className="rank-name">
                <b>{r.name ?? t("account.id", { id: String(r.accountId) })}</b>
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
  const { t } = useI18n();
  const { fmtUsdc, number } = useFormat();
  const q = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 5000 });
  const s = q.data;
  const img = art("side");
  return (
    <section className="box">
      {img && <img className="box-art" src={img} alt="" />}
      <h3> {t("stats.now")} <span className="small muted">USDC</span>
      </h3>
      <div className="stats">
        <div>
          <b>{s ? number(s.accounts) : "–"}</b>
          <span className="small muted">{t("stats.accounts")}</span>
        </div>
        <div>
          <b>{s ? number(s.nodes) : "–"}</b>
          <span className="small muted">{t("stats.posts")}</span>
        </div>
        <div>
          <b>{s ? number(s.likes) : "–"}</b>
          <span className="small muted">{t("stats.likes")}</span>
        </div>
        <div className="wide">
          <div>
            <b className="ok">{s ? fmtUsdc(s.distributed, 2) : "–"}</b>
            <span className="small muted">{t("stats.distributed")}</span>
          </div>
          <div>
            <b>{s ? fmtUsdc(s.treasury, 2) : "–"}</b>
            <span className="small muted">{t("stats.treasury")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SideFoot() {
  const { t } = useI18n();
  return <p className="foot-note">{t("footer")}</p>;
}
