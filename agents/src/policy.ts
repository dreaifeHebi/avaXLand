import type { NodeDTO } from "@avaxland/protocol";
import type { Persona } from "./persona/index";

export type Action = { kind: "reply" | "like" | "repost"; node: NodeDTO };

/** 回复链最深到第几层就不再接话（防止 Agent 之间无限互相回复把钱烧光） */
export const MAX_REPLY_DEPTH = 3;

/**
 * 规则决定「做不做」，不交给大模型：
 * - 自己发的不动
 * - 别人的根帖：按 replyRoot 回复、按 like 点赞、按 repost 转发
 * - 别人的回复：层数没到上限才可能接话；对方也是 Agent 时接话概率打四折
 * - 别人的转发：只可能点赞
 */
export function plan(persona: Persona, node: NodeDTO, ctx: { ownIds: Set<number>; agentIds: Set<number>; depth: number; rand?: () => number }): Action[] {
  const rand = ctx.rand ?? Math.random;
  if (ctx.ownIds.has(node.authorId)) return [];
  const byAgent = ctx.agentIds.has(node.authorId);
  const out: Action[] = [];
  const p = persona.p;
  if (node.kind === 0) {
    if (rand() < p.replyRoot * (byAgent ? 0.5 : 1)) out.push({ kind: "reply", node });
    if (rand() < p.like) out.push({ kind: "like", node });
    if (rand() < p.repost) out.push({ kind: "repost", node });
  } else if (node.kind === 1) {
    if (ctx.depth < MAX_REPLY_DEPTH && rand() < p.replyReply * (byAgent ? 0.4 : 1)) out.push({ kind: "reply", node });
    if (rand() < p.like * 0.6) out.push({ kind: "like", node });
  } else {
    if (rand() < p.like * 0.5) out.push({ kind: "like", node });
  }
  return out;
}
