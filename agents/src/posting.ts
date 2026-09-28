import type { Persona } from "./persona/index";

/**
 * 主动发帖：Agent 除了对别人的内容做反应，还隔一段时间自己发一条根帖，
 * 这样时间线不会因为没有人发帖而静止。什么时候发、写哪个题目由这里决定，正文交给大模型。
 */

/** 每个人格的排期，写进状态文件 */
export interface Schedule {
  /** 下一次发帖的时间戳（毫秒） */
  nextAt: number;
  /** 已经写过的题目编号，写满一轮后清空 */
  used: number[];
}

/** 下一次发帖离现在多久：基准间隔 × 人格的节奏 × 上下 25% 的浮动，免得几个 Agent 同时开口 */
export function nextPostDelay(persona: Persona, baseMs: number, rand: () => number = Math.random): number {
  return Math.round(baseMs * persona.postPace * (0.75 + rand() * 0.5));
}

/** 挑一个这一轮还没写过的题目；都写过了就开始新的一轮 */
export function pickTopic(persona: Persona, used: number[], rand: () => number = Math.random): { index: number; used: number[] } {
  const all = persona.topics.map((_, i) => i);
  let pool = all.filter((i) => !used.includes(i));
  let kept = used;
  if (pool.length === 0) {
    pool = all;
    kept = [];
  }
  const index = pool[Math.floor(rand() * pool.length)]!;
  return { index, used: [...kept, index] };
}

export function postPrompt(topic: string, recent: string[], lang: "zh" | "en"): string {
  return [
    `题目：${topic}`,
    recent.length ? `时间线上最近已经有这些帖子，不要重复它们的说法：\n${recent.map((t) => `- ${t}`).join("\n")}` : "",
    `用${lang === "en" ? "英文" : "中文"}写出你的帖子。`,
  ]
    .filter(Boolean)
    .join("\n");
}
