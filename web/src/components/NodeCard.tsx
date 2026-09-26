import { useState } from "react";
import { Link } from "react-router-dom";
import type { NodeDTO, SplitDTO } from "@avaxland/protocol";
import { useActions } from "../lib/actions";
import { KIND_LABELS, avatarColor, fmtUsdc, timeAgo } from "../lib/format";
import { useConfig } from "../lib/useConfig";
import { Composer } from "./Composer";
import { SplitRows } from "./SplitRows";
import { TxLine, TxLink } from "./TxLink";

export function Avatar({ id, name }: { id: number; name: string | null }) {
  return (
    <span className="avatar" style={{ background: avatarColor(id) }}>
      {(name ?? "#").slice(0, 1).toUpperCase()}
    </span>
  );
}

function Quoted({ node }: { node: NodeDTO }) {
  return (
    <blockquote className="quote">
      <Link to={`/n/${node.id}`} className="small">
        <b>{node.authorName ?? `#${node.authorId}`}</b> · #{node.id}
      </Link>
      <div className="small">{node.fullText ?? node.excerpt}</div>
    </blockquote>
  );
}

/** 一条帖子 / 回复 / 转发：内容、计数、三个付费动作、交易链接；可选展示它的分账 */
export function NodeCard({ node, splits, linkTitle }: { node: NodeDTO; splits?: SplitDTO[]; linkTitle?: boolean }) {
  const cfg = useConfig();
  const actions = useActions();
  const [replying, setReplying] = useState(false);
  const text = node.fullText ?? node.excerpt;
  const p = cfg.data?.prices;
  return (
    <article className="node card">
      <header className="node-head">
        <Avatar id={node.authorId} name={node.authorName} />
        <Link to={`/a/${node.authorId}`} className="name">
          {node.authorName ?? `账号 #${node.authorId}`}
        </Link>
        <span className="muted small">
          #{node.authorId} · {KIND_LABELS[node.kind]} · {timeAgo(node.createdAt)}
        </span>
        <span className="spacer" />
        <Link to={`/n/${node.id}`} className="muted small" title="打开帖子树">
          {linkTitle ? "打开 " : ""}#{node.id}
        </Link>
      </header>
      {node.kind === 2 && (
        <div className="small muted">
          ↻ 转发了 {node.parent ? "" : `#${node.parentId}`}
        </div>
      )}
      {node.kind === 2 && node.parent ? <Quoted node={node.parent} /> : null}
      {text ? <p className="content">{text}</p> : null}
      {node.fullText === null && node.kind !== 2 && <span className="pill small">仅链上摘要</span>}
      <footer className="node-foot">
        <button className="btn tiny" disabled={!actions.ready || actions.like.isPending} onClick={() => actions.like.mutate(node.id)} title={p ? `点赞 ${fmtUsdc(p.like)} USDC` : ""}>
          👍 {node.likes}
        </button>
        <button className="btn tiny" disabled={!actions.ready} onClick={() => setReplying((v) => !v)} title={p ? `回复 ${fmtUsdc(p.reply)} USDC` : ""}>
          💬 {node.replies}
        </button>
        <button className="btn tiny" disabled={!actions.ready || actions.repost.isPending} onClick={() => actions.repost.mutate(node.id)} title={p ? `转发 ${fmtUsdc(p.repost)} USDC` : ""}>
          ↻ {node.reposts}
        </button>
        <span className="earned" title="这条帖子（根帖含整棵树）为作者带来的收入">
          +{fmtUsdc(node.earned)} USDC
        </span>
        <span className="spacer" />
        <TxLink hash={node.txHash} />
      </footer>
      {actions.lastTx && <TxLine tx={actions.lastTx} />}
      {replying && <Composer kind="reply" parentId={node.id} autoFocus onDone={() => setReplying(false)} />}
      {splits && splits.length > 0 && <SplitRows splits={splits} />}
    </article>
  );
}
