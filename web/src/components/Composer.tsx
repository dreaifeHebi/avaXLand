import { useFormat, byteLen } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useMyAccount } from "../lib/account";
import { useActions } from "../lib/actions";
import { art } from "../lib/art";
import { USDC_FAUCET, useOnTestnet } from "../lib/faucet";
import { composeStore, useStore } from "../lib/store";
import { useConfig } from "../lib/useConfig";
import { Avatar } from "./Avatar";
import { LinkedMessage } from "./LinkedMessage";
import { FaucetHint } from "./StartGuide";
import { TxLine } from "./TxLink";

/** 没连钱包的访客在时间线顶上看到的横幅：这是什么、每个动作多少钱 */
function Hero() {
  const { t } = useI18n();
  const { fmtUsdc } = useFormat();
  const cfg = useConfig();
  const onTestnet = useOnTestnet();
  const img = art("hero");
  const p = cfg.data?.prices;
  return (
    <section className={`hero ${img ? "has-art" : ""}`}>
      {img && <img src={img} alt="" />}
      <div>
        <h2>{t("hero.title")}</h2>
        <p>{t("hero.body")}</p>
        {p && (
          <div className="prices">
            <span>{t("price.account")} {fmtUsdc(p.mint)}</span>
            <span>{t("action.post")} {fmtUsdc(p.post)}</span>
            <span>{t("kind.reply")} {fmtUsdc(p.reply)}</span>
            <span>{t("kind.repost")} {fmtUsdc(p.repost)}</span>
            <span>{t("kind.like")} {fmtUsdc(p.like)} USDC</span>
          </div>
        )}
        {onTestnet && (
          <p className="hero-try">
            <LinkedMessage message="hero.try" link={<a href={USDC_FAUCET} target="_blank" rel="noreferrer">{t("faucet.circle")}</a>} />
          </p>
        )}
      </div>
    </section>
  );
}

/** 发帖 / 回复输入框：字节计数、价格、一次签名。inline 是嵌在某条帖子下面的回复框 */
export function Composer({ kind, parentId, onDone, autoFocus, inline }: { kind: "post" | "reply"; parentId?: number; onDone?: () => void; autoFocus?: boolean; inline?: boolean }) {
  const { t } = useI18n();
  const { fmtUsdc } = useFormat();
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

  if (!isConnected) return kind === "post" ? <Hero /> : <div className="note small">{t("composer.connectReply", { price })}</div>;
  if (!current)
    return (
      <div className="note small">{t("composer.noAccount")} <FaucetHint need={cfg.data?.prices.mint} />
      </div>
    );

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
          placeholder={kind === "post" ? t("composer.placeholder") : t("composer.reply")}
          rows={kind === "post" ? 2 : 1}
          autoFocus={autoFocus}
          disabled={busy}
        />
        <div className="composer-bar">
          <span className={`small ${bytes > max ? "warn" : "muted"}`}>
            {t("composer.bytes", { bytes, max })}{bytes > max ? t("composer.overflow") : ""}
          </span>
          <span className="spacer" />
          <span className="small muted">
            {t("composer.identity", { id: String(current.id), name: current.name ?? "" })}
          </span>
          <button className="btn primary" disabled={busy || !text.trim()} onClick={submit}>
            {busy ? t("payment.busy") : `${kind === "post" ? t("action.post") : t("kind.reply")} · ${price} USDC`}
          </button>
        </div>
        {actions.lastTx && <TxLine tx={actions.lastTx} />}
      </div>
    </div>
  );
}
