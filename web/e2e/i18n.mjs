// Run against Vite and a local gateway with seeded posts:
// BASE=http://127.0.0.1:5173 CHROME=/usr/bin/google-chrome node e2e/i18n.mjs /tmp/avaxland-i18n
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
    await context.route("**/api/nodes/1", async (route) => {
      const response = await route.fetch();
      const thread = await response.json();
      await route.fulfill({ response, json: { ...thread, node: { ...thread.node, replies: 1, reposts: 0, likes: 2 } } });
    });
    await page.goto(`${base}/n/1`);
    await page.locator(".tweet.focal .content").waitFor();
    assert.equal(await page.locator(".tweet.focal .content").textContent(), "hello avaXLand", "user content must stay unchanged");
    if (locale === "en") {
      const counts = await page.locator(".focal-stats").innerText();
      for (const expected of ["1 Reply", "0 Reposts", "2 Likes"]) assert(counts.includes(expected));
      assert(!counts.includes("1 Replies"));
    }
    await page.screenshot({ path: `${out}/${browserLanguage}-thread.png`, fullPage: true });
    for (const width of [1021, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `${out}/${browserLanguage}-thread-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await context.route("**/api/accounts/1", async (route) => {
      const response = await route.fetch();
      const account = await response.json();
      account.stats[4] = "1"; account.stats[5] = "2"; account.stats[6] = "0";
      await route.fulfill({ response, json: account });
    });
    await page.goto(`${base}/a/1`);
    const achievements = { en: "Achievements", "zh-CN": "成就墙", "zh-TW": "成就牆", ja: "実績" };
    await page.getByRole("button", { name: achievements[locale], exact: true }).click();
    assert.equal(await page.locator(".badge-row").count(), 8);
    if (locale === "en") {
      const counts = await page.locator(".profile-counts").innerText();
      for (const expected of ["1 Like received", "2 Replies received", "0 Reposts received"]) assert(counts.includes(expected));
      assert(!counts.includes("1 Likes received"));
    }
    await page.screenshot({ path: `${out}/${browserLanguage}-achievements.png`, fullPage: true });
    await page.setViewportSize({ width: 360, height: 812 });
    const amountTops = await page.locator(".wallet-card > div:not(.claim) > b").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    assert.equal(new Set(amountTops).size, 1, `${locale}: amount baselines`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}: profile overflow`);
    await page.screenshot({ path: `${out}/${browserLanguage}-profile-360.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/rank`);
    const rankings = { en: "Leaderboard", "zh-CN": "排行榜", "zh-TW": "排行榜", ja: "ランキング" };
    await page.getByRole("heading", { name: rankings[locale], exact: true }).waitFor();
    // Render the testnet guide from a local config fixture, without connecting to Fuji.
    await context.route("**/api/config", async (route) => {
      const response = await route.fetch();
      const config = await response.json();
      await route.fulfill({ response, json: { ...config, chainId: 43113 } });
    });
    await page.goto(base);
    await page.locator(".guide").waitFor();
    await page.locator(".hero-try a").waitFor();
    assert(!((await page.locator(".hero-try").innerText()).includes("{link}")));
    const linkSentence = await page.locator(".hero-try a").evaluate((link) => ({
      before: link.previousSibling.textContent, after: link.nextSibling.textContent,
    }));
    assert(linkSentence.before.length > 0 && linkSentence.after.length > 0, `${locale}: inline faucet link`);
    const withdrawal = page.locator(".guide > p");
    const withdrawalText = await withdrawal.textContent();
    assert(!withdrawalText.includes("{link}") && !withdrawalText.includes("undefined"));
    const withdrawalLink = await withdrawal.locator("a").evaluate((link) => ({ before: link.previousSibling.textContent, after: link.nextSibling.textContent }));
    assert(withdrawalLink.before.length > 0 && withdrawalLink.after.length > 0, `${locale}: withdrawal link inside sentence`);
    if (locale !== "en") {
      assert(!/[。．]\s/.test(withdrawalText), `${locale}: spaces between withdrawal sentences`);
      assert(!/[。．]\s/.test(await page.locator(".guide li:nth-child(2) .small").textContent()), `${locale}: spaces between faucet sentences`);
    }
    await page.screenshot({ path: `${out}/${browserLanguage}-guide.png`, fullPage: true });
    await page.setViewportSize({ width: 360, height: 900 });
    await page.screenshot({ path: `${out}/${browserLanguage}-guide-360.png`, fullPage: true });
    for (const width of [641, 700, 1021, 1060]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.locator(".rail select").evaluate((select) => ({
        left: select.getBoundingClientRect().left, right: select.getBoundingClientRect().right,
        width: innerWidth, scroll: document.documentElement.scrollWidth,
      }));
      assert.equal(await page.locator(".rail select option:checked").textContent(), { en: "EN", "zh-CN": "简中", "zh-TW": "繁中", ja: "日本語" }[locale]);
      const fits = await page.locator(".rail select").evaluate((select) => {
        const style = getComputedStyle(select);
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.font = `${style.fontSize} ${style.fontFamily}`;
        return ctx.measureText(select.selectedOptions[0].text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 20 <= select.clientWidth;
      });
      assert(fits, `${locale}: complete narrow label`);
      assert(geometry.left >= 0 && geometry.right <= width && geometry.scroll <= width, `${locale}: overflow at ${width}: ${JSON.stringify(geometry)}`);
      await page.screenshot({ path: `${out}/${browserLanguage}-width-${width}.png`, fullPage: true });
    }
    console.log(`PASS ${browserLanguage}: locale/persistence, inline link, stats spacing, profile alignment and 641/700/1021/1060 layouts`);
    await context.close();
  }

  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const results = await page.evaluate(async (clientModule) => {
    const { browserLocale, translator } = await import("/src/lib/i18n/index.tsx");
    const { createFormat } = await import("/src/lib/format.ts");
    const { createClient, RelayFailed, PaymentRejected } = await import(clientModule);
    const { payErrorText } = await import("/src/lib/pay.ts");
    const errorCases = [
      { status: 502, body: { error: "RECEIPT_TIMEOUT", detail: "RECEIPT_TIMEOUT", txHash: "0x123" } },
      { status: 502, body: { error: "RELAY_FAILED", detail: "AlreadyLiked" } },
      { status: 400, body: { error: "SIMULATION_FAILED", detail: "AlreadyLiked" } },
    ];
    const paymentErrors = [];
    for (const { status, body } of errorCases) {
      const client = createClient({ baseUrl: "", expect: {}, fetch: async () => new Response(JSON.stringify(body), { status }) });
      try { await client.get("/test"); } catch (error) {
        paymentErrors.push({
          code: error.code ?? error.reason,
          typed: status === 502 ? error instanceof RelayFailed : error instanceof PaymentRejected,
          text: ["en", "zh-CN", "zh-TW", "ja"].map((locale) => payErrorText(error, translator(locale))),
        });
      }
    }
    const cases = [
      [["fr-FR", "zh-HK", "en"], "zh-TW"], [["zh-MO"], "zh-TW"], [["zh-Hant-HK"], "zh-TW"],
      [["ZH-hant"], "zh-TW"], [["zh-SG"], "zh-CN"], [["zh-Hans"], "zh-CN"], [["zh"], "zh-CN"],
      [["fr", "ja-JP", "en"], "ja"], [["en-GB", "ja"], "en"], [["de", "fr"], "en"], [[], "en"],
    ];
    const dictionaries = await Promise.all(["en", "zh-CN", "zh-TW", "ja"].map(async (locale) => ({
      locale, dictionary: (await import(`/src/lib/i18n/${locale}.ts`)).default,
    })));
    const variants = (message) => typeof message === "string" ? [message] : Object.values(message);
    const placeholders = (message) => [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const reference = dictionaries[0].dictionary;
    const mismatches = dictionaries.flatMap(({ locale, dictionary }) => Object.keys(reference).filter((key) =>
      !dictionary[key] || variants(dictionary[key]).some((text) => placeholders(text) !== placeholders(variants(reference[key])[0])),
    ).map((key) => `${locale}:${key}`));
    return {
      paymentErrors,
      plurals: ["en", "zh-CN", "zh-TW", "ja"].map((locale) => ({
        locale,
        labels: ["stats.replies", "stats.likes", "stats.reposts", "metric.liked", "metric.replied", "metric.reposted"].map((key) => [0, 1, 2].map((count) => translator(locale)(key, { count }))),
        faucet: translator(locale)("faucet.balance", { amount: "0" }) + translator(locale)("faucet.short") + translator(locale)("faucet.hint", { link: "LINK" }),
      })),
      matches: cases.map(([languages, expected]) => [languages, browserLocale(languages), expected]),
      mismatches,
      formats: dictionaries.map(({ locale }) => {
        const f = createFormat(locale, translator(locale));
        return [locale, f.fmtUsdc("12345678901"), f.fmtUsdc("999999", 2), f.fmtUsdc("9007199254740993123456"), f.number(12345)];
      }),
      relative: createFormat("ja", translator("ja")).timeAgo(Math.floor(Date.now() / 1000) - 120),
      date: createFormat("ja", translator("ja")).fullTime(1700000000),
    };
  }, "/@fs" + fileURLToPath(new URL("../../packages/client/src/index.ts", import.meta.url)));
  assert.deepEqual(results.paymentErrors.map((e) => e.code), ["RECEIPT_TIMEOUT", "RELAY_FAILED", "SIMULATION_FAILED"]);
  assert(results.paymentErrors.every((e) => e.typed));
  assert(results.paymentErrors[0].text.every((text) => !text.includes("RECEIPT_TIMEOUT")));
  assert(results.paymentErrors.slice(1).every((e) => e.text.every((text) => text.includes("AlreadyLiked"))));
  assert.equal(results.paymentErrors[1].text[0], "Transaction failed: AlreadyLiked");
  for (const [languages, actual, expected] of results.matches) assert.equal(actual, expected, languages.join(","));
  assert.deepEqual(results.mismatches, [], "dictionary placeholders must match English");
  assert.deepEqual(results.plurals[0].labels, [
    ["Replies", "Reply", "Replies"], ["Likes", "Like", "Likes"], ["Reposts", "Repost", "Reposts"],
    ["Likes received", "Like received", "Likes received"], ["Replies received", "Reply received", "Replies received"], ["Reposts received", "Repost received", "Reposts received"],
  ]);
  for (const { labels, faucet } of results.plurals.slice(1)) {
    assert(labels.every((row) => new Set(row).size === 1));
    assert(!/[。．]\s/.test(faucet), "no spaces between CJK faucet sentences");
  }
  assert(results.plurals[0].faucet.includes("USDC. Not enough"));
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
