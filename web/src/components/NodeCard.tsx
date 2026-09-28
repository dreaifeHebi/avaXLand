import { useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { NodeDTO, SplitDTO } from "@avaxland/protocol";
import { useActions } from "../lib/actions";
import { fmtUsdc, fullTime, timeAgo } from "../lib/format";
import { useConfig } from "../lib/useConfig";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { Icon } from "./Icons";
import { SplitRows } from "./SplitRows";
import { TxLine, TxLink } from "./TxLink";

const authorOf = (n: NodeDTO) => n.authorName ?? `账号 #${n.authorId}`;

function Quoted({ node }: { node: NodeDTO }) {
  return (
    <Link to={`/n/${node.id}`} className="quote">
      <div className="quote-head">
        <Avatar id={node.authorId} name={node.authorName} size="sm" />
        <b>{authorOf(node)}</b>
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
        <div className="replying">
          回复 <Link to={`/n/${node.parentId}`}>{authorOf(node.parent)} 的 #{node.parentId}</Link>
        </div>
      )}
      {text ? <p className="content">{text}</p> : null}
      {node.fullText === null && node.kind !== 2 && <span className="pill">仅链上摘要</span>}
      {node.kind === 2 && node.parent ? <Quoted node={node.parent} /> : null}
    </>
  );

  const bar = (
    <footer className="actions">
      <button
        className="act reply"
        disabled={!actions.ready}
        onClick={() => setReplying((v) => !v)}
        aria-label={`回复${p ? `（${fmtUsdc(p.reply)} USDC）` : ""}`}
        title={p ? `回复，付 ${fmtUsdc(p.reply)} USDC` : "回复"}
      >
        <span className="ring">
          <Icon name="reply" />
        </span>
        {node.replies > 0 && !focal ? node.replies : ""}
        {p && <span className="price">{fmtUsdc(p.reply)} U</span>}
      </button>
      <button
        className={`act repost ${actions.repost.isPending ? "busy" : ""}`}
        disabled={!actions.ready || actions.repost.isPending}
        onClick={() => actions.repost.mutate(node.id)}
        aria-label={`转发${p ? `（${fmtUsdc(p.repost)} USDC）` : ""}`}
        title={p ? `转发，付 ${fmtUsdc(p.repost)} USDC` : "转发"}
      >
        <span className="ring">
          <Icon name="repost" />
        </span>
        {node.reposts > 0 && !focal ? node.reposts : ""}
        {p && <span className="price">{fmtUsdc(p.repost)} U</span>}
      </button>
      <button
        className={`act like ${actions.like.isPending ? "busy" : ""}`}
        disabled={!actions.ready || actions.like.isPending}
        onClick={() => actions.like.mutate(node.id)}
        aria-label={`点赞${p ? `（${fmtUsdc(p.like)} USDC）` : ""}`}
        title={p ? `点赞，付 ${fmtUsdc(p.like)} USDC` : "点赞"}
      >
        <span className="ring">
          <Icon name="heart" />
        </span>
        {node.likes > 0 && !focal ? node.likes : ""}
        {p && <span className="price">{fmtUsdc(p.like)} U</span>}
      </button>
      {!focal && (
        <span className={`act earn ${earnedZero ? "zero" : ""}`} title="这条帖子（根帖含整棵树）为作者带来的收入，单位 USDC">
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
              {authorOf(node)}
            </Link>
            <span className="muted">账号 #{node.authorId}</span>
          </div>
        </div>
        {body}
        <div className="focal-time">
          <span>{fullTime(node.createdAt)}</span>·<span>节点 #{node.id}</span>·<TxLink hash={node.txHash} />
        </div>
        <div className="focal-stats">
          <span>
            <b>{node.replies}</b> 回复
          </span>
          <span>
            <b>{node.reposts}</b> 转发
          </span>
          <span>
            <b>{node.likes}</b> 点赞
          </span>
          <span className="earn" title="这条帖子（根帖含整棵树）为作者带来的收入">
            <b>+{fmtUsdc(node.earned)}</b> USDC 收益
          </span>
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
          <Link to={`/a/${node.authorId}`}>{authorOf(node)}</Link> 转发了
        </div>
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
              {authorOf(node)}
            </Link>
            <span className="muted">
              #{node.authorId} · {timeAgo(node.createdAt)}
            </span>
            <Link to={`/n/${node.id}`} className="node-id" aria-label={`打开 #${node.id}`} title="打开这条帖子和它下面的讨论">
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
