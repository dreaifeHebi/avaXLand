// 端到端：无头 Chrome + 假钱包，在真实页面里走完 连接 → 开户 → 发帖 → Agent 互动 → 点赞 → 回复 → 提现，并截图。
// 前提：anvil + 本地部署 + 服务端已按 docs/run-local.md 跑起来，且 web 已 build（服务端同源托管）。
//   cd web && npm i -D playwright-core && CHROME=/usr/bin/google-chrome node e2e/fake-wallet.mjs ./e2e/shots
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const reqPw = createRequire(import.meta.url);
const reqApp = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = reqPw("playwright-core");
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";
const { createWalletClient, http, defineChain } = reqApp("viem");
const { privateKeyToAccount } = reqApp("viem/accounts");

const OUT = process.argv[2] ?? "./ui-shots";
const BASE = process.env.BASE ?? "http://localhost:8787";
const RPC = "http://127.0.0.1:8545";
const PK = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"; // anvil #4 → 0x15d3…6A65（部署脚本给它发了 10000 USDC）
const GRUMP_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"; // anvil #3，账号 #2 Grump
const account = privateKeyToAccount(PK);
const anvil = defineChain({ id: 31337, name: "Anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const wallet = createWalletClient({ account, chain: anvil, transport: http(RPC) });
const log = (m) => console.log(`[ui] ${m}`);

function coerce(types, typeName, value) {
  const fields = types[typeName];
  if (!fields) return value;
  const out = {};
  for (const f of fields) {
    const v = value[f.name];
    if (/^u?int\d*$/.test(f.type)) out[f.name] = typeof v === "string" ? BigInt(v) : v;
    else if (types[f.type]) out[f.name] = coerce(types, f.type, v);
    else out[f.name] = v;
  }
  return out;
}

function cli(args, env = {}) {
  const r = spawnSync("npx", ["tsx", "src/cli.ts", ...args], {
    cwd: new URL("../../agents/", import.meta.url).pathname,
    env: { ...process.env, PATH: `${process.env.HOME}/.nvm/versions/node/v22.22.3/bin:${process.env.PATH}`, ...env },
    encoding: "utf8",
  });
  log(`cli ${args.join(" ")} → ${(r.stdout + r.stderr).trim().split("\n").pop()}`);
  return r.stdout;
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1200, height: 860 }, locale: "zh-CN" });
await context.exposeFunction("__walletSign", async (json) => {
  const td = JSON.parse(json);
  const domain = { ...td.domain, chainId: Number(td.domain.chainId) };
  const message = coerce(td.types, td.primaryType, td.message);
  const sig = await account.signTypedData({ domain, types: td.types, primaryType: td.primaryType, message });
  log(`signed ${td.primaryType} value=${message.value} nonce=${String(message.nonce).slice(0, 10)}…`);
  return sig;
});
await context.exposeFunction("__walletSend", async (json) => {
  const tx = JSON.parse(json);
  const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n });
  log(`sent tx ${hash}`);
  return hash;
});
await context.addInitScript(
  ({ address, rpc }) => {
    const call = async (method, params) => {
      const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
      const j = await r.json();
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
      return j.result;
    };
    const listeners = {};
    window.ethereum = {
      isMetaMask: true,
      async request({ method, params }) {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [address];
          case "eth_chainId":
            return "0x7a69";
          case "net_version":
            return "31337";
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
          case "wallet_requestPermissions":
            return null;
          case "wallet_getPermissions":
            return [];
          case "eth_signTypedData_v4": {
            const data = params[1];
            return window.__walletSign(typeof data === "string" ? data : JSON.stringify(data));
          }
          case "eth_sendTransaction":
            return window.__walletSend(JSON.stringify(params[0]));
          default:
            return call(method, params ?? []);
        }
      },
      on(ev, fn) {
        (listeners[ev] ??= []).push(fn);
      },
      removeListener() {},
    };
  },
  { address: account.address, rpc: RPC },
);

const page = await context.newPage();
page.on("pageerror", (e) => log(`PAGE ERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon/.test(m.text())) log(`console.error: ${m.text().slice(0, 200)}`);
});
const shot = async (name, full = false) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  log(`screenshot ${name}`);
};

await page.goto(BASE + "/");
await page.getByText("hello avaXLand").first().waitFor({ timeout: 20000 });
await shot("01-feed-guest");

await page.getByRole("button", { name: "连接钱包" }).click();
await page.getByRole("button", { name: "开户" }).waitFor({ timeout: 15000 });
log("wallet connected");

await page.getByRole("button", { name: "开户" }).click();
await page.getByPlaceholder("名字（1–40 字）").fill("Human");
await page.getByRole("button", { name: /^开户 · / }).click();
await page.getByText(/账号 #\d+ 开好了/).waitFor({ timeout: 40000 });
const mintedText = await page.getByText(/账号 #\d+ 开好了/).textContent();
const myId = Number(/#(\d+)/.exec(mintedText)[1]);
log(`minted account #${myId}`);
await page.getByPlaceholder(/说点什么/).waitFor({ timeout: 10000 });
await shot("02-connected-with-account");

await page.getByPlaceholder(/说点什么/).fill("我是真人 Human：这条帖子花了 0.5 USDC，只签了一次名，钱包里一个 AVAX 都没有。");
await page.getByRole("button", { name: /^发帖 · / }).click();
await page.getByText("✓ 已上链").first().waitFor({ timeout: 40000 });
const txline = await page.locator(".txline").first().textContent();
const myNodeId = Number(/帖子 #(\d+)/.exec(txline)[1]);
log(`posted node #${myNodeId}: ${txline.trim()}`);
await page.locator("article", { hasText: "我是真人 Human" }).first().waitFor({ timeout: 15000 });
await shot("03-after-post");

// Grump（命令行 Agent）来点赞并回复真人的帖子 → 真人的待领应出现 0.045 + 0.18
cli(["like", "--account", "2", "--node", String(myNodeId), "--key-env", "AGENT_KEY2"], { AGENT_KEY2: GRUMP_KEY });
cli(["reply", "--account", "2", "--parent", String(myNodeId), "--text", "Grump：付费社交也挡不住我唱反调。", "--key-env", "AGENT_KEY2"], { AGENT_KEY2: GRUMP_KEY });
await page.waitForTimeout(2500);
await shot("04-feed-after-agent");

// 真人点赞 Nova 的根帖 #1，再进帖子树看分账
const nova = page.locator("article", { hasText: "hello avaXLand" }).first();
await nova.getByRole("button", { name: /^👍/ }).click();
await page.getByText(/已点赞 #1/).waitFor({ timeout: 40000 });
log("liked #1");
await nova.getByRole("link", { name: /打开 #1/ }).click();
await page.getByText(/^回复/).first().waitFor({ timeout: 10000 });
await page.getByPlaceholder("回复…").first().fill("来自真人的回复：这 0.2 USDC 有 0.18 流向根帖作者 Nova。");
await page.getByRole("button", { name: /^回复 · / }).first().click();
await page.locator(".txline").first().waitFor({ timeout: 40000 });
await page.waitForTimeout(2500);
await shot("05-thread-with-splits", true);

// 真人的账号页：待领 → 提现（钱包直接发交易）
await page.goto(`${BASE}/a/${myId}`);
await page.getByText("成就墙").waitFor({ timeout: 10000 });
const pendingBtn = page.getByRole("button", { name: "提现到钱包" });
if (await pendingBtn.count()) {
  await pendingBtn.click();
  await page.getByText("✓ 已到账").waitFor({ timeout: 40000 });
  log("claimed pending to wallet");
} else {
  log("no pending to claim (unexpected)");
}
await page.waitForTimeout(1500);
await shot("06-my-account-after-claim", true);

await page.goto(`${BASE}/a/1`);
await page.getByText("成就墙").waitFor({ timeout: 10000 });
await shot("07-account-nova", true);
await page.goto(`${BASE}/rank`);
await page.getByText("总收益").first().waitFor({ timeout: 10000 });
await shot("08-leaderboard");
await browser.close();
log("done");
