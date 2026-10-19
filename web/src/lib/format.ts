import { formatUnits } from "viem";
import { useMemo } from "react";
import { useI18n, type Locale, type Translate } from "./i18n";

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-4)}`;
export const byteLen = (s: string) => new TextEncoder().encode(s).length;
export const METRIC_KEYS = ["action.post", "kind.reply", "kind.repost", "kind.like", "metric.liked", "metric.replied", "metric.reposted", "metric.earnings"] as const;
export const TIER_LABELS = ["I", "II", "III", "IV"] as const;
export const KIND_KEYS = ["kind.post", "kind.reply", "kind.repost"] as const;

export function createFormat(locale: Locale, t: Translate) {
  const number = (value: string | number | bigint, options?: Intl.NumberFormatOptions) =>
    // Intl accepts decimal strings without losing precision; TypeScript's overload only lists number/bigint.
    new Intl.NumberFormat(locale, options).format(value as number | bigint);
  const fmtUsdc = (value: string | bigint | number, digits = 4) => {
    const [whole, fraction = ""] = formatUnits(BigInt(value), 6).split(".");
    return number(`${whole}.${fraction.slice(0, digits) || "0"}`, { maximumFractionDigits: digits });
  };
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const timeAgo = (ts: number) => {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    if (seconds < 60) return relative.format(-seconds, "second");
    if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), "minute");
    if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), "hour");
    return relative.format(-Math.floor(seconds / 86400), "day");
  };
  const fullTime = (ts: number) => new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(ts * 1000);
  const badgeText = (metric: number, threshold: string) => {
    const label = t(METRIC_KEYS[metric]!);
    return metric === 7 ? `${label} ${fmtUsdc(threshold, 0)} USDC` : `${label} ×${number(threshold)}`;
  };
  return { number, fmtUsdc, timeAgo, fullTime, badgeText };
}

export function useFormat() {
  const { locale, t } = useI18n();
  return useMemo(() => createFormat(locale, t), [locale, t]);
}

export function avatarColor(id: number): string {
  const h = Math.round((id * 137.508) % 360);
  return `hsl(${h} 65% 52%)`;
}
