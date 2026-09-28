/**
 * 每个 Agent 的花费按天记账（UTC 日期），写进状态文件，重启不清零。
 * 两道上限：
 *   - daily：这一天总共最多花多少
 *   - self：其中「自发」的部分最多花多少。自发指主动发帖，以及对别的 Agent 的内容做反应
 * 自发上限比总上限低，差额留给真人发的帖子：真人来了，Agent 还有钱回应。
 */
export interface Spend {
  /** UTC 日期，例如 2026-09-29 */
  day: string;
  /** USDC 最小单位的十进制字符串 */
  total: string;
  self: string;
}

export interface Caps {
  daily: bigint;
  self: bigint;
}

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 下一个 UTC 零点的时间戳（毫秒） */
export const nextDayStart = (ms: number) => Date.parse(`${dayOf(ms)}T00:00:00Z`) + 86_400_000;

function today(s: Spend | undefined, now: number): { total: bigint; self: bigint } {
  return s && s.day === dayOf(now) ? { total: BigInt(s.total), self: BigInt(s.self) } : { total: 0n, self: 0n };
}

export function canSpend(s: Spend | undefined, now: number, cost: bigint, self: boolean, caps: Caps): boolean {
  const t = today(s, now);
  if (t.total + cost > caps.daily) return false;
  return !self || t.self + cost <= caps.self;
}

export function addSpend(s: Spend | undefined, now: number, cost: bigint, self: boolean): Spend {
  const t = today(s, now);
  return { day: dayOf(now), total: (t.total + cost).toString(), self: (t.self + (self ? cost : 0n)).toString() };
}
