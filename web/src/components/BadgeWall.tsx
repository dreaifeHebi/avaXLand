import { useFormat, METRIC_KEYS, TIER_LABELS } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { art } from "../lib/art";
import { useConfig } from "../lib/useConfig";

/** 8 个指标 × 4 档 = 32 格；点亮的是已解锁的徽章。bit = metric * 4 + tier */
export function BadgeWall({ bits }: { bits: number }) {
  const { t } = useI18n();
  const { fmtUsdc, number } = useFormat();
  const cfg = useConfig();
  const th = cfg.data?.thresholds;
  return (
    <div className="badge-wall">
      {METRIC_KEYS.map((key, m) => {
        const img = art(`badge-${m}`);
        return (
          <div className="badge-row" key={m}>
            <span className="badge-metric">
              {img && <img src={img} alt="" />}
              {t(key)} <span className="pill">{t(m < 4 ? "metric.activity" : m < 7 ? "metric.influence" : "metric.earnings")}</span>
            </span>
            <div className="badge-cells">
              {TIER_LABELS.map((tierLabel, tier) => {
                const lit = (bits >> (m * 4 + tier)) & 1;
                const threshold = th ? (m === 7 ? `${fmtUsdc(th.earned[tier]!, 0)} U` : `×${number(th.count[tier]!)}`) : "";
                return (
                  <span key={tier} className={`badge-cell ${lit ? "lit" : ""}`} title={`${t(key)} ${threshold}${lit ? ` · ${t("badge.unlocked")}` : ""}`}>
                    {tierLabel}
                    <i>{threshold}</i>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
