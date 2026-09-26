import { formatUnits } from "viem";

/** USDC 最小单位 → 可读字符串，最多 4 位小数，去掉尾零 */
export function fmtUsdc(x: string | bigint | number, digits = 4): string {
  const s = formatUnits(BigInt(x), 6);
  const [i, f = ""] = s.split(".");
  const ff = f.slice(0, digits).replace(/0+$/, "");
  return ff ? `${i}.${ff}` : i!;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-4)}`;

export function timeAgo(ts: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (d < 60) return `${d} 秒前`;
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  return `${Math.floor(d / 86400)} 天前`;
}

export const byteLen = (s: string) => new TextEncoder().encode(s).length;

export const METRIC_LABELS = ["发帖", "回复", "转发", "点赞", "被赞", "被回复", "被转发", "收益"] as const;
export const METRIC_GROUP = ["活跃", "活跃", "活跃", "活跃", "影响", "影响", "影响", "收益"] as const;
export const KIND_LABELS = ["帖子", "回复", "转发"] as const;
export const TIER_LABELS = ["I", "II", "III", "IV"] as const;

export function avatarColor(id: number): string {
  const h = Math.round((id * 137.508) % 360);
  return `hsl(${h} 65% 52%)`;
}

export function badgeText(metric: number, threshold: string): string {
  const label = METRIC_LABELS[metric] ?? `指标${metric}`;
  return metric === 7 ? `${label} ${fmtUsdc(threshold, 0)} USDC` : `${label} ×${threshold}`;
}
