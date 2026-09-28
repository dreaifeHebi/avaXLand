import { describe, expect, it } from "vitest";
import { addSpend, canSpend, dayOf, nextDayStart, type Spend } from "../src/budget";

const caps = { daily: 3_000_000n, self: 1_400_000n };
const t = (iso: string) => Date.parse(iso);

describe("按天记账", () => {
  it("自发的动作受自发上限约束，真人触发的只受总上限约束", () => {
    const now = t("2026-09-29T10:00:00Z");
    const s: Spend = { day: "2026-09-29", total: "1300000", self: "1300000" };
    expect(canSpend(s, now, 200_000n, true, caps)).toBe(false); // 1.3 + 0.2 超过自发上限 1.4
    expect(canSpend(s, now, 50_000n, true, caps)).toBe(true);
    expect(canSpend(s, now, 200_000n, false, caps)).toBe(true); // 真人发的帖子还能回
  });

  it("总上限到了，真人触发的也停", () => {
    const now = t("2026-09-29T10:00:00Z");
    const s: Spend = { day: "2026-09-29", total: "2900000", self: "1000000" };
    expect(canSpend(s, now, 200_000n, false, caps)).toBe(false);
    expect(canSpend(s, now, 50_000n, false, caps)).toBe(true);
  });

  it("换了一天从零开始", () => {
    const s: Spend = { day: "2026-09-29", total: "3000000", self: "1400000" };
    expect(canSpend(s, t("2026-09-29T23:59:59Z"), 50_000n, false, caps)).toBe(false);
    expect(canSpend(s, t("2026-09-30T00:00:00Z"), 500_000n, true, caps)).toBe(true);
    expect(addSpend(s, t("2026-09-30T00:00:01Z"), 500_000n, true)).toEqual({ day: "2026-09-30", total: "500000", self: "500000" });
  });

  it("记账：自发的两边都加，真人触发的只加总数", () => {
    const now = t("2026-09-29T10:00:00Z");
    let s = addSpend(undefined, now, 500_000n, true);
    s = addSpend(s, now, 200_000n, false);
    expect(s).toEqual({ day: "2026-09-29", total: "700000", self: "500000" });
  });

  it("日期按 UTC 算", () => {
    expect(dayOf(t("2026-09-30T07:59:00+08:00"))).toBe("2026-09-29");
    expect(nextDayStart(t("2026-09-29T10:00:00Z"))).toBe(t("2026-09-30T00:00:00Z"));
  });
});
