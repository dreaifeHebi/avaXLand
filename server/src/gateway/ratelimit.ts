/** 极简滑动窗口限流：每个 key 每分钟最多 n 次 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private perMinute: number) {}
  allow(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (arr.length >= this.perMinute) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}
