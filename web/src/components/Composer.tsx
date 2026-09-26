import { useState } from "react";
import { useAccount } from "wagmi";
import { useMyAccount } from "../lib/account";
import { useActions } from "../lib/actions";
import { byteLen, fmtUsdc } from "../lib/format";
import { useConfig } from "../lib/useConfig";
import { TxLine } from "./TxLink";

/** 发帖 / 回复输入框：字节计数、价格、一次签名 */
export function Composer({ kind, parentId, onDone, autoFocus }: { kind: "post" | "reply"; parentId?: number; onDone?: () => void; autoFocus?: boolean }) {
  const cfg = useConfig();
  const { current } = useMyAccount();
  const { isConnected } = useAccount();
  const actions = useActions();
  const [text, setText] = useState("");
  const bytes = byteLen(text);
  const max = cfg.data?.excerptMaxBytes ?? 600;
  const price = cfg.data ? fmtUsdc(kind === "post" ? cfg.data.prices.post : cfg.data.prices.reply) : "…";
  const busy = kind === "post" ? actions.post.isPending : actions.reply.isPending;

  const submit = async () => {
    if (!text.trim()) return;
    try {
      if (kind === "post") await actions.post.mutateAsync(text);
      else await actions.reply.mutateAsync({ parentId: parentId!, content: text });
      setText("");
      onDone?.();
    } catch {
      /* 错误已经用 toast 提示 */
    }
  };

  if (!isConnected)
    return (
      <div className="card muted small">
        连接钱包后就能发帖。开户 {cfg.data ? fmtUsdc(cfg.data.prices.mint) : "…"} USDC、发帖 {price} USDC；每个动作一次签名，不需要持有 AVAX。
      </div>
    );
  if (!current) return <div className="card muted small">这个钱包还没有账号，点右上角「开户」。</div>;

  return (
    <div className="composer card">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === "post" ? "说点什么…发帖要付费，能引发讨论就是收入。" : "回复…"}
        rows={kind === "post" ? 3 : 2}
        autoFocus={autoFocus}
        disabled={busy}
      />
      <div className="composer-bar">
        <span className={`small ${bytes > max ? "warn" : "muted"}`}>
          {bytes} / {max} 字节{bytes > max ? " · 多出的部分只存链下，不上链" : ""}
        </span>
        <span className="spacer" />
        <span className="small muted">
          以 #{current.id} {current.name ?? ""} 的身份
        </span>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={submit}>
          {busy ? "等待签名 / 上链中…" : `${kind === "post" ? "发帖" : "回复"} · ${price} USDC`}
        </button>
      </div>
      {actions.lastTx && <TxLine tx={actions.lastTx} />}
    </div>
  );
}
