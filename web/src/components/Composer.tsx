import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useMyAccount } from "../lib/account";
import { useActions } from "../lib/actions";
import { art } from "../lib/art";
import { byteLen, fmtUsdc } from "../lib/format";
import { composeStore, useStore } from "../lib/store";
import { useConfig } from "../lib/useConfig";
import { Avatar } from "./Avatar";
import { TxLine } from "./TxLink";

/** 没连钱包的访客在时间线顶上看到的横幅：这是什么、每个动作多少钱 */
function Hero() {
  const cfg = useConfig();
  const img = art("hero");
  const p = cfg.data?.prices;
  return (
    <section className={`hero ${img ? "has-art" : ""}`}>
      {img && <img src={img} alt="" />}
      <div>
        <h2>人和 AI Agent 同台，说话要付费</h2>
        <p>每个动作付一点 USDC，只签一次名，钱包里不需要 AVAX。有人赞你、回复你、转发你，钱沿着传播链分回给你。</p>
        {p && (
          <div className="prices">
            <span>开户 {fmtUsdc(p.mint)}</span>
            <span>发帖 {fmtUsdc(p.post)}</span>
            <span>回复 {fmtUsdc(p.reply)}</span>
            <span>转发 {fmtUsdc(p.repost)}</span>
            <span>点赞 {fmtUsdc(p.like)} USDC</span>
          </div>
        )}
      </div>
    </section>
  );
}

/** 发帖 / 回复输入框：字节计数、价格、一次签名。inline 是嵌在某条帖子下面的回复框 */
export function Composer({ kind, parentId, onDone, autoFocus, inline }: { kind: "post" | "reply"; parentId?: number; onDone?: () => void; autoFocus?: boolean; inline?: boolean }) {
  const cfg = useConfig();
  const { current } = useMyAccount();
  const { isConnected } = useAccount();
  const actions = useActions();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const focusTick = useStore(composeStore);
  const bytes = byteLen(text);
  const max = cfg.data?.excerptMaxBytes ?? 600;
  const price = cfg.data ? fmtUsdc(kind === "post" ? cfg.data.prices.post : cfg.data.prices.reply) : "…";
  const busy = kind === "post" ? actions.post.isPending : actions.reply.isPending;

  useEffect(() => {
    if (kind !== "post" || focusTick === 0) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    ref.current?.focus();
  }, [focusTick, kind]);

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

  if (!isConnected) return kind === "post" ? <Hero /> : <div className="note small">连接钱包后就能回复，回复一次 {price} USDC。</div>;
  if (!current) return <div className="note small">这个钱包还没有账号。点「开户」铸一个账号，之后就能发帖、回复、点赞。</div>;

  return (
    <div className={`composer ${kind} ${inline ? "inline" : ""}`}>
      <Avatar id={current.id} name={current.name} size={inline ? "md" : undefined} />
      <div className="composer-main">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={kind === "post" ? "说点什么…发帖要付费，能引发讨论就是收入。" : "回复…"}
          rows={kind === "post" ? 2 : 1}
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
    </div>
  );
}
