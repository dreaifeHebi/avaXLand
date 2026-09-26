import { Link } from "react-router-dom";
import type { SplitDTO } from "@avaxland/protocol";
import { fmtUsdc } from "../lib/format";

function sourceLabel(s: SplitDTO): string {
  if (s.source === "like") return "点赞";
  if (s.source === "reply") return `回复 #${s.sourceId}`;
  if (s.source === "repost") return `转发 #${s.sourceId}`;
  return "互动";
}

/** 打在某个节点上的每一笔互动，钱是怎么沿着传播链分出去的 */
export function SplitRows({ splits, title }: { splits: SplitDTO[]; title?: string }) {
  const groups: { key: string; rows: SplitDTO[] }[] = [];
  for (const s of splits) {
    const last = groups[groups.length - 1];
    if (last && last.key === s.txHash) last.rows.push(s);
    else groups.push({ key: s.txHash, rows: [s] });
  }
  if (!groups.length) return null;
  return (
    <div className="splits">
      <div className="small muted">{title ?? "打在这条上的互动，钱分给了谁"}</div>
      {groups.map((g) => {
        const first = g.rows[0]!;
        const total = g.rows.reduce((a, s) => a + BigInt(s.amount), 0n);
        return (
          <div className="split-group" key={g.key}>
            <div className="small">
              <b>{sourceLabel(first)}</b> <span className="muted">来自 #{first.sourceAccountId} · 分出 {fmtUsdc(total)} USDC</span>
            </div>
            <ul>
              {g.rows.map((s) => (
                <li key={`${s.txHash}-${s.logIndex}`}>
                  <span className="depth">第 {s.depth} 层</span>
                  <span className="arrow">→</span>
                  <Link to={`/a/${s.toAccountId}`}>{s.toName ?? `#${s.toAccountId}`}</Link>
                  <b className="amt">+{fmtUsdc(s.amount)}</b>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
