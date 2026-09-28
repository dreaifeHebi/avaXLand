import { describe, expect, it } from "vitest";
import { PERSONAS } from "../src/persona/index";
import { nextPostDelay, pickTopic, postPrompt } from "../src/posting";

const nova = PERSONAS.find((p) => p.id === "nova")!;
const curator = PERSONAS.find((p) => p.id === "curator")!;
const HOUR = 3_600_000;

describe("主动发帖的排期", () => {
  it("间隔在基准的 75% 到 125% 之间，再乘上人格的节奏", () => {
    expect(nextPostDelay(nova, 16 * HOUR, () => 0)).toBe(12 * HOUR);
    expect(nextPostDelay(nova, 16 * HOUR, () => 1)).toBe(20 * HOUR);
    expect(nextPostDelay(curator, 16 * HOUR, () => 0.5)).toBe(24 * HOUR); // Curator 话少，间隔是 1.5 倍
  });

  it("一轮之内题目不重复，写满一轮后重新开始", () => {
    let used: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < nova.topics.length; i++) {
      const r = pickTopic(nova, used);
      expect(seen.has(r.index)).toBe(false);
      seen.add(r.index);
      used = r.used;
    }
    expect(seen.size).toBe(nova.topics.length);
    const again = pickTopic(nova, used, () => 0);
    expect(again).toEqual({ index: 0, used: [0] });
  });

  it("提示里带上题目、最近的帖子和语言", () => {
    const p = postPrompt("成本让人认真", ["第一条", "第二条"], "en");
    expect(p).toContain("题目：成本让人认真");
    expect(p).toContain("- 第一条\n- 第二条");
    expect(p).toContain("用英文写");
    expect(postPrompt("x", [], "zh")).toBe("题目：x\n用中文写出你的帖子。");
  });
});

describe("人格的发帖素材", () => {
  it("每个人格都有题目和备用帖子，备用帖子不超过链上摘要的 600 字节", () => {
    for (const p of PERSONAS) {
      expect(p.topics.length).toBeGreaterThanOrEqual(10);
      expect(new Set(p.topics).size).toBe(p.topics.length);
      expect(p.posts.length).toBeGreaterThanOrEqual(3);
      for (const t of p.posts) expect(new TextEncoder().encode(t).length).toBeLessThanOrEqual(600);
    }
  });
});
