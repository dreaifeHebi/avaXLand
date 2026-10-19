import { useFormat } from "../lib/format";
import { useI18n, type Translate } from "../lib/i18n";
import { useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { NodeDTO, SplitDTO } from "@avaxland/protocol";
import { useActions } from "../lib/actions";

import { useConfig } from "../lib/useConfig";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { Icon } from "./Icons";
import { SplitRows } from "./SplitRows";
import { TxLine, TxLink } from "./TxLink";

const authorOf = (n: NodeDTO, t: Translate) => n.authorName ?? t("account.id", { id: String(n.authorId) });

function Quoted({ node }: { node: NodeDTO }) {
  const { t } = useI18n();
  const { timeAgo } = useFormat();
  return (
    <Link to={`/n/${node.id}`} className="quote">
      <div className="quote-head">
        <Avatar id={node.authorId} name={node.authorName} size="sm" />
        <b>{authorOf(node, t)}</b>
        <span className="muted">
          #{node.authorId} · {timeAgo(node.createdAt)}
        </span>
      </div>
      <div>{node.fullText ?? node.excerpt}</div>
    </Link>
  );
}

/**
 * 一条帖子 / 回复 / 转发。
 * variant：row 是信息流里的一行；chain 是帖子详情里排在上面的祖先，头像下面拉一条线连到下一条；focal 是详情页的主角，字大、数字展开。
 */
export function NodeCard({ node, splits, variant = "row" }: { node: NodeDTO; splits?: SplitDTO[]; variant?: "row" | "chain" | "focal" }) {
  const { t } = useI18n();
  const { fmtUsdc, fullTime, timeAgo, number } = useFormat();
  const cfg = useConfig();
  const actions = useActions();
  const navigate = useNavigate();
  const [replying, setReplying] = useState(false);
  const text = node.fullText ?? node.excerpt;
  const p = cfg.data?.prices;
  const focal = variant === "focal";
  const earnedZero = BigInt(node.earned) === 0n;

  const open = (e: MouseEvent) => {
    if (focal) return;
    if ((e.target as HTMLElement).closest("a, button, textarea, input, details, .txline")) return;
    if (window.getSelection()?.toString()) return;
    navigate(`/n/${node.id}`);
  };

  const body = (
    <>
      {node.kind === 1 && node.parent && !focal && variant !== "chain" && (
        <div className="replying">{t("node.replying")} <Link to={`/n/${node.parentId}`}>{t("node.replyTarget", { name: authorOf(node.parent, t), id: String(node.parentId) })}</Link>
        </div>
      )}
      {text ? <p className="content">{text}</p> : null}
      {node.fullText === null && node.kind !== 2 && <span className="pill">{t("node.excerpt")}</span>}
      {node.kind === 2 && node.parent ? <Quoted node={node.parent} /> : null}
    </>
  );

  const bar = (
    <footer className="actions">
      <button
        className="act reply"
        disabled={!actions.ready}
        onClick={() => setReplying((v) => !v)}
        aria-label={p ? t("node.actionPrice", { action: t("kind.reply"), price: fmtUsdc(p.reply) }) : t("kind.reply")}
        title={p ? t("node.actionPrice", { action: t("kind.reply"), price: fmtUsdc(p.reply) }) : t("kind.reply")}
      >
        <span className="ring">
          <Icon name="reply" />
        </span>
        {node.replies > 0 && !focal ? number(node.replies) : ""}
        {p && <span className="price">{fmtUsdc(p.reply)} U</span>}
      </button>
      <button
        className={`act repost ${actions.repost.isPending ? "busy" : ""}`}
        disabled={!actions.ready || actions.repost.isPending}
        onClick={() => actions.repost.mutate(node.id)}
        aria-label={p ? t("node.actionPrice", { action: t("kind.repost"), price: fmtUsdc(p.repost) }) : t("kind.repost")}
        title={p ? t("node.actionPrice", { action: t("kind.repost"), price: fmtUsdc(p.repost) }) : t("kind.repost")}
      >
        <span className="ring">
          <Icon name="repost" />
        </span>
        {node.reposts > 0 && !focal ? number(node.reposts) : ""}
        {p && <span className="price">{fmtUsdc(p.repost)} U</span>}
      </button>
      <button
        className={`act like ${actions.like.isPending ? "busy" : ""}`}
        disabled={!actions.ready || actions.like.isPending}
        onClick={() => actions.like.mutate(node.id)}
        aria-label={p ? t("node.actionPrice", { action: t("kind.like"), price: fmtUsdc(p.like) }) : t("kind.like")}
        title={p ? t("node.actionPrice", { action: t("kind.like"), price: fmtUsdc(p.like) }) : t("kind.like")}
      >
        <span className="ring">
          <Icon name="heart" />
        </span>
        {node.likes > 0 && !focal ? number(node.likes) : ""}
        {p && <span className="price">{fmtUsdc(p.like)} U</span>}
      </button>
      {!focal && (
        <span className={`act earn ${earnedZero ? "zero" : ""}`} title={t("node.earnHint")}>
          <span className="ring">
            <Icon name="coin" />
          </span>
          {earnedZero ? "" : `+${fmtUsdc(node.earned)}`}
        </span>
      )}
      <TxLink hash={node.txHash} icon />
    </footer>
  );

  const extras = (
    <>
      {actions.lastTx && <TxLine tx={actions.lastTx} />}
      {replying && <Composer kind="reply" parentId={node.id} autoFocus inline onDone={() => setReplying(false)} />}
      {splits && splits.length > 0 && <SplitRows splits={splits} />}
    </>
  );

  if (focal)
    return (
      <article className="tweet focal">
        <div className="focal-head">
          <Link to={`/a/${node.authorId}`}>
            <Avatar id={node.authorId} name={node.authorName} />
          </Link>
          <div>
            <Link to={`/a/${node.authorId}`} className="name">
              {authorOf(node, t)}
            </Link>
            <span className="muted">{t("account.id", { id: String(node.authorId) })}</span>
          </div>
        </div>
        {body}
        <div className="focal-time">
          <span>{fullTime(node.createdAt)}</span>·<span>{t("node.id", { id: String(node.id) })}</span>·<TxLink hash={node.txHash} />
        </div>
        <div className="focal-stats">
          <span>
            <b>{number(node.replies)}</b>{" "}{t("stats.replies")}</span>
          <span>
            <b>{number(node.reposts)}</b>{" "}{t("stats.reposts")}</span>
          <span>
            <b>{number(node.likes)}</b>{" "}{t("stats.likes")}</span>
          <span className="earn" title={t("node.earnHint")}>
            <b>+{fmtUsdc(node.earned)}</b> USDC · {t("metric.earnings")}</span>
        </div>
        {bar}
        {extras}
      </article>
    );

  return (
    <article className={`tweet ${variant === "chain" ? "chain" : ""}`} onClick={open}>
      {node.kind === 2 && (
        <div className="tweet-context">
          <Icon name="repost" />
          <Link to={`/a/${node.authorId}`}>{authorOf(node, t)}</Link>{" "}{t("node.reposted")}</div>
      )}
      <div className="tweet-row">
        <div className="tweet-left">
          <Link to={`/a/${node.authorId}`}>
            <Avatar id={node.authorId} name={node.authorName} />
          </Link>
          {variant === "chain" && <span className="thread-line" />}
        </div>
        <div className="tweet-main">
          <header className="tweet-meta">
            <Link to={`/a/${node.authorId}`} className="name">
              {authorOf(node, t)}
            </Link>
            <span className="muted">
              #{node.authorId} · {timeAgo(node.createdAt)}
            </span>
            <Link to={`/n/${node.id}`} className="node-id" aria-label={t("node.open", { id: String(node.id) })} title={t("node.openHint")}>
              #{node.id}
            </Link>
          </header>
          {body}
          {bar}
          {extras}
        </div>
      </div>
    </article>
  );
}
