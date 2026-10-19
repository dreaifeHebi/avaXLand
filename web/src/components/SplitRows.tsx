import { useFormat } from "../lib/format";
import { useI18n, type MessageKey } from "../lib/i18n";
import { Link } from "react-router-dom";
import type { SplitDTO } from "@avaxland/protocol";

import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icons";

const SOURCE: Record<string, { label: MessageKey; icon: IconName }> = {
  like: { label: "kind.like", icon: "heart" },
  reply: { label: "kind.reply", icon: "reply" },
  repost: { label: "kind.repost", icon: "repost" },
};

/** 打在某个节点上的每一笔互动，钱是怎么沿着传播链分出去的。一笔互动一行，收款人从近到远排开。默认收起 */
export function SplitRows({ splits }: { splits: SplitDTO[] }) {
  const { t } = useI18n();
  const { fmtUsdc } = useFormat();
  const groups: { key: string; rows: SplitDTO[] }[] = [];
  for (const s of splits) {
    const last = groups[groups.length - 1];
    if (last && last.key === s.txHash) last.rows.push(s);
    else groups.push({ key: s.txHash, rows: [s] });
  }
  if (!groups.length) return null;
  const total = splits.reduce((a, s) => a + BigInt(s.amount), 0n);
  return (
    <details className="splits">
      <summary>
        <Icon name="coin" />
        <span>
          {t("split.summary", { count: groups.length })} <b>{fmtUsdc(total)} USDC</b>
        </span>
        <span className="chev">
          <Icon name="chevron" />
        </span>
      </summary>
      {groups.map((g) => {
        const first = g.rows[0]!;
        const src = SOURCE[first.source ?? ""] ?? { label: "split.reaction" as const, icon: "coin" as const };
        return (
          <div className="split-group" key={g.key}>
            <span className={`split-src ${first.source ?? ""}`}>
              <Icon name={src.icon} />
              {t(src.label)}
              {first.source !== "like" ? ` #${first.sourceId}` : ""}
            </span>
            <Link to={`/a/${first.sourceAccountId}`} className="muted" title={t("split.payer")}>
              {t("split.from", { id: String(first.sourceAccountId) })}
            </Link>
            <span className="arrow">→</span>
            {g.rows.map((s) => (
              <Link to={`/a/${s.toAccountId}`} className="split-to" key={`${s.txHash}-${s.logIndex}`} title={t("flow.depth", { depth: s.depth })}>
                <Avatar id={s.toAccountId} name={s.toName} size="sm" />
                {s.toName ?? `#${s.toAccountId}`}
                <b className="amt">+{fmtUsdc(s.amount)}</b>
              </Link>
            ))}
          </div>
        );
      })}
    </details>
  );
}
