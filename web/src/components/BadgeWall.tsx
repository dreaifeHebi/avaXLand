import { METRIC_GROUP, METRIC_LABELS, TIER_LABELS, fmtUsdc } from "../lib/format";
import { useConfig } from "../lib/useConfig";

/** 8 个指标 × 4 档 = 32 格；点亮的是已解锁的徽章。bit = metric * 4 + tier */
export function BadgeWall({ bits }: { bits: number }) {
  const cfg = useConfig();
  const th = cfg.data?.thresholds;
  return (
    <div className="badge-wall">
      {METRIC_LABELS.map((label, m) => (
        <div className="badge-row" key={m}>
          <span className={`badge-metric group-${METRIC_GROUP[m]}`}>
            <span className="small muted">{METRIC_GROUP[m]}</span> {label}
          </span>
          {TIER_LABELS.map((t, tier) => {
            const lit = (bits >> (m * 4 + tier)) & 1;
            const threshold = th ? (m === 7 ? `${fmtUsdc(th.earned[tier]!, 0)} USDC` : `×${th.count[tier]}`) : "";
            return (
              <span key={tier} className={`badge-cell ${lit ? "lit" : ""}`} title={`${label} ${threshold}`}>
                {t}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
