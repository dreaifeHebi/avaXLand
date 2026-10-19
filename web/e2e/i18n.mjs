// Run against Vite and a local gateway with seeded posts:
// BASE=http://127.0.0.1:5173 CHROME=/usr/bin/google-chrome node e2e/i18n.mjs /tmp/avaxland-i18n
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.BASE ?? "http://127.0.0.1:5173";
const out = process.argv[2] ?? "/tmp/avaxland-i18n";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome" });
const errors = [];
try {
  for (const [browserLanguage, locale, heading] of [
    ["en-US", "en", "Home"], ["zh-TW", "zh-TW", "首頁"], ["ja-JP", "ja", "ホーム"], ["zh-CN", "zh-CN", "时间线"],
  ]) {
    const context = await browser.newContext({ locale: browserLanguage, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    await page.locator(".stats .ok").filter({ hasText: /\d/ }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), locale);
    assert.equal(await page.locator(".rail select").inputValue(), locale);
    assert.equal(await page.evaluate(() => localStorage.getItem("avaxland:language")), null);
    await page.screenshot({ path: `${out}/${browserLanguage}-desktop.png`, fullPage: true });
    // Both UI text and the document language change immediately, then survive reload.
    const next = locale === "ja" ? "en" : "ja";
    await page.locator(".rail select").selectOption(next);
    await page.waitForFunction((lang) => document.documentElement.lang === lang, next);
    await page.reload();
    await page.waitForFunction((lang) => document.documentElement.lang === lang, next);
    assert.equal(await page.locator(".rail select").inputValue(), next);
    assert.equal(await page.evaluate(() => localStorage.getItem("avaxland:language")), next);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator(".topbar select").selectOption(locale);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}: mobile overflow`);
    await page.screenshot({ path: `${out}/${browserLanguage}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/n/1`);
    await page.locator(".tweet.focal .content").waitFor();
    assert.equal(await page.locator(".tweet.focal .content").textContent(), "hello avaXLand", "user content must stay unchanged");
    await page.screenshot({ path: `${out}/${browserLanguage}-thread.png`, fullPage: true });
    await page.goto(`${base}/a/1`);
    const achievements = { en: "Achievements", "zh-CN": "成就墙", "zh-TW": "成就牆", ja: "実績" };
    await page.getByRole("button", { name: achievements[locale], exact: true }).click();
    assert.equal(await page.locator(".badge-row").count(), 8);
    await page.screenshot({ path: `${out}/${browserLanguage}-achievements.png`, fullPage: true });
    await page.goto(`${base}/rank`);
    const rankings = { en: "Leaderboard", "zh-CN": "排行榜", "zh-TW": "排行榜", ja: "ランキング" };
    await page.getByRole("heading", { name: rankings[locale], exact: true }).waitFor();
    console.log(`PASS ${browserLanguage}: detected ${locale}, persisted ${next}, mobile switch, thread, achievements, leaderboard`);
    await context.close();
  }

  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const results = await page.evaluate(async () => {
    const { browserLocale, translator } = await import("/src/lib/i18n/index.tsx");
    const { createFormat } = await import("/src/lib/format.ts");
    const cases = [
      [["fr-FR", "zh-HK", "en"], "zh-TW"], [["zh-MO"], "zh-TW"], [["zh-Hant-HK"], "zh-TW"],
      [["ZH-hant"], "zh-TW"], [["zh-SG"], "zh-CN"], [["zh-Hans"], "zh-CN"], [["zh"], "zh-CN"],
      [["fr", "ja-JP", "en"], "ja"], [["en-GB", "ja"], "en"], [["de", "fr"], "en"], [[], "en"],
    ];
    const dictionaries = await Promise.all(["en", "zh-CN", "zh-TW", "ja"].map(async (locale) => ({
      locale, dictionary: (await import(`/src/lib/i18n/${locale}.ts`)).default,
    })));
    const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const reference = dictionaries[0].dictionary;
    const mismatches = dictionaries.flatMap(({ locale, dictionary }) => Object.keys(reference).filter((key) =>
      !dictionary[key] || placeholders(dictionary[key]) !== placeholders(reference[key]),
    ).map((key) => `${locale}:${key}`));
    return {
      matches: cases.map(([languages, expected]) => [languages, browserLocale(languages), expected]),
      mismatches,
      formats: dictionaries.map(({ locale }) => {
        const f = createFormat(locale, translator(locale));
        return [locale, f.fmtUsdc("12345678901"), f.fmtUsdc("999999", 2), f.fmtUsdc("9007199254740993123456"), f.number(12345)];
      }),
      relative: createFormat("ja", translator("ja")).timeAgo(Math.floor(Date.now() / 1000) - 120),
      date: createFormat("ja", translator("ja")).fullTime(1700000000),
    };
  });
  for (const [languages, actual, expected] of results.matches) assert.equal(actual, expected, languages.join(","));
  assert.deepEqual(results.mismatches, [], "dictionary placeholders must match English");
  for (const [locale, usdc, truncated, precise, count] of results.formats) {
    assert.equal(usdc, "12,345.6789", locale);
    assert.equal(truncated, "0.99", locale);
    assert.equal(precise, "9,007,199,254,740,993.1234", locale);
    assert.equal(count, "12,345", locale);
  }
  assert.equal(results.relative, "2 分前");
  assert.match(results.date, /2023年11月/);
  // Traverse navigator.languages in the actual application initializer.
  await context.addInitScript(() => Object.defineProperty(navigator, "languages", { value: ["fr-FR", "zh-HK", "en-US"] }));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.lang === "zh-TW");
  await page.locator(".rail select").selectOption("ja");
  await page.reload();
  await page.waitForFunction(() => document.documentElement.lang === "ja");
  // Messages stay translatable while visible, including asynchronous notifications.
  await page.locator(".rail select").selectOption("en");
  await page.evaluate(async () => {
    const { pushToast } = await import("/src/lib/store.ts");
    pushToast({ kind: "info", title: { key: "tx.liked", params: { id: "1" } } }, 30000);
    pushToast({ kind: "error", error: new Error("CONNECT_WALLET") }, 30000);
  });
  await page.getByText("Liked #1", { exact: true }).waitFor();
  await page.getByText("Connect your wallet first.", { exact: false }).waitFor();
  await page.locator(".rail select").selectOption("ja");
  await page.getByText("#1 にいいねしました", { exact: true }).waitFor();
  await page.getByText("先にウォレットを接続してください。", { exact: false }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS language priority, fallback, dictionary placeholders, exact amounts, Intl dates/numbers, saved preference priority");
  await context.close();
} finally {
  await browser.close();
}
