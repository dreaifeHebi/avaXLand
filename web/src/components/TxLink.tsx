import { useFormat, shortHash } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { LastTx } from "../lib/actions";
import { useConfig } from "../lib/useConfig";
import { Icon } from "./Icons";

/** 指向区块浏览器的交易链接。icon 为真时只画一个小图标（信息流里用），完整哈希放在悬停提示里 */
export function TxLink({ hash, label, icon }: { hash: string; label?: string; icon?: boolean }) {
  const { t } = useI18n();
  const cfg = useConfig();
  const explorer = cfg.data?.explorer;
  const text = label ?? shortHash(hash);
  if (icon)
    return explorer ? (
      <a className="act tx" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer" title={t("tx.explorer", { hash })} aria-label={t("tx.onchain")}>
        <span className="ring">
          <Icon name="external" />
        </span>
      </a>
    ) : (
      <span className="act tx" title={hash} />
    );
  return explorer ? (
    <a className="tx small" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer" title={hash}>
      {text} ↗
    </a>
  ) : (
    <span className="tx small" title={hash}>
      {text}
    </span>
  );
}

/** 一次付费动作的结果行：做了什么、多少毫秒上链、交易号 */
export function TxLine({ tx }: { tx: LastTx }) {
  const { t } = useI18n();
  const { number } = useFormat();
  const precision = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  const params = {
    label: t(tx.label, { id: String(tx.id) }),
    seconds: number(tx.ms / 1000, precision),
  };
  const timing = tx.confirmMs === undefined
    ? t("tx.timing", params)
    : t("tx.timingWithBlock", { ...params, block: number(tx.confirmMs / 1000, precision) });
  return (
    <div className="txline small">
      <span className="ok">{t("tx.confirmed")}</span>{" "}{timing} · <TxLink hash={tx.txHash} />
    </div>
  );
}
