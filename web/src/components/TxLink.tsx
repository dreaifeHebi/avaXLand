import type { LastTx } from "../lib/actions";
import { shortHash } from "../lib/format";
import { useConfig } from "../lib/useConfig";

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const cfg = useConfig();
  const explorer = cfg.data?.explorer;
  const text = label ?? shortHash(hash);
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
  return (
    <div className="txline small">
      <span className="ok">✓ 已上链</span> {tx.label} · 签名后 <b>{(tx.ms / 1000).toFixed(1)} 秒</b>
      {tx.confirmMs !== undefined ? <span className="muted">（其中等出块 {(tx.confirmMs / 1000).toFixed(1)} 秒）</span> : null} · <TxLink hash={tx.txHash} />
    </div>
  );
}
