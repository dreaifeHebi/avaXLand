import Database from "better-sqlite3";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, formatUnits, http, type Hex } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";

/**
 * 成本表：从本地数据库拿到每种动作的真实交易号 → 到 Fuji 取回执里的 gasUsed
 * → 乘以主网此刻的 gas 价格与 AVAX 美元价 → 每个动作在主网上大约花多少钱。
 *   cd server && npx tsx scripts/cost-table.ts            打印并写入 docs/cost-table.md（英文）与 docs/cost-table.cn.md（中文）
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const db = new Database(resolve(root, "server/data/fuji.db"), { readonly: true });
const dep = JSON.parse(readFileSync(resolve(root, "deployments/fuji.json"), "utf8"));
const fuji = createPublicClient({ chain: avalancheFuji, transport: http(undefined, { batch: true }) });
const mainnet = createPublicClient({ chain: avalanche, transport: http() });

const groups: { en: string; cn: string; price: string; sql: string }[] = [
  { en: "Open account", cn: "开户", price: dep.params.mintFee, sql: "SELECT minted_tx AS h FROM accounts WHERE minted_tx IS NOT NULL" },
  { en: "Post", cn: "发帖", price: dep.params.post, sql: "SELECT tx_hash AS h FROM nodes WHERE kind = 0" },
  { en: "Reply", cn: "回复", price: dep.params.reply, sql: "SELECT tx_hash AS h FROM nodes WHERE kind = 1" },
  { en: "Repost", cn: "转发", price: dep.params.repost, sql: "SELECT tx_hash AS h FROM nodes WHERE kind = 2" },
  { en: "Like", cn: "点赞", price: dep.params.like, sql: "SELECT tx_hash AS h FROM likes" },
];

/** 一行的数字；两种语言共用，只在渲染时套不同的文字 */
type Row = { en: string; cn: string; paid: number; gas: { n: number; min: bigint; avg: bigint; max: bigint } | null };

async function avaxUsd(): Promise<number | null> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd");
    const j = (await r.json()) as { "avalanche-2"?: { usd?: number } };
    return j["avalanche-2"]?.usd ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const [block, tipRaw, price] = await Promise.all([mainnet.getBlock(), mainnet.estimateMaxPriorityFeePerGas().catch(() => 0n), avaxUsd()]);
  const baseFee = block.baseFeePerGas ?? 0n;
  const gasPrice = baseFee + tipRaw;
  // 主网 base fee 一天之内实测在 0.27 到 5 nAVAX 之间波动，所以给两列：低位与此刻
  const LOW = 270_000_000n;
  const rows: Row[] = [];
  for (const g of groups) {
    const paid = Number(formatUnits(BigInt(g.price), 6));
    const hashes = (db.prepare(g.sql).all() as { h: Hex }[]).map((x) => x.h).slice(-40);
    const pairs = await Promise.all(hashes.map(async (hash) => ({ r: await fuji.getTransactionReceipt({ hash }), t: await fuji.getTransaction({ hash }) })));
    // Avalanche 至少按 gas 上限的一半计费：上限给太宽的交易，回执里的数字不是真实用量，剔除
    const gas = pairs.filter((x) => x.r.gasUsed * 2n !== x.t.gas).map((x) => x.r.gasUsed);
    if (!gas.length) {
      rows.push({ en: g.en, cn: g.cn, paid, gas: null });
      continue;
    }
    const sum = gas.reduce((a, b) => a + b, 0n);
    rows.push({
      en: g.en,
      cn: g.cn,
      paid,
      gas: {
        n: gas.length,
        min: gas.reduce((a, b) => (a < b ? a : b), gas[0]!),
        avg: sum / BigInt(gas.length),
        max: gas.reduce((a, b) => (a > b ? a : b), 0n),
      },
    });
  }

  // 主网手续费一格：有 AVAX 价格时是「美元（占付费比例）」，取不到价格时退回 AVAX
  const fee = (r: Row, gp: bigint, lang: "en" | "cn") => {
    const avax = Number(formatUnits(r.gas!.avg * gp, 18));
    if (price === null) return `${avax.toFixed(7)} AVAX`;
    const usd = avax * price;
    const pct = ((usd / r.paid) * 100).toFixed(1);
    return lang === "en" ? `$${usd.toFixed(5)} (${pct}%)` : `$${usd.toFixed(5)}（${pct}%）`;
  };
  const table = (lang: "en" | "cn") =>
    rows
      .map((r) =>
        r.gas
          ? `| ${r[lang]} | ${r.paid} | ${r.gas.n} | ${r.gas.min} | ${r.gas.avg} | ${r.gas.max} | ${fee(r, LOW, lang)} | ${fee(r, gasPrice, lang)} |`
          : `| ${r[lang]} | ${r.paid} | 0 | – | – | – | – | – |`,
      )
      .join("\n");

  const now = new Date().toISOString();
  const en = `English | [中文](cost-table.cn.md)

# Cost table

Generated at ${now}. Method: take the most recent real Fuji transactions for each action from the indexer database (up to 40), and read gasUsed from the receipts.
Multiply by the current Avalanche mainnet gas price and then by the AVAX price in USD to get "how much the same action would cost in fees on mainnet".

- Mainnet base fee: ${formatUnits(baseFee, 9)} nAVAX; suggested tip: ${formatUnits(tipRaw, 9)} nAVAX; total used: ${formatUnits(gasPrice, 9)} nAVAX
- AVAX price: ${price === null ? "not available (CoinGecko)" : `$${price}`}
- Posts contract: ${dep.posts}

| Action | USDC paid by user | Samples | Min gas | Avg gas | Max gas | Mainnet fee @0.27 nAVAX (share of payment) | Mainnet fee @now (share of payment) |
|---|---|---|---|---|---|---|---|
${table("en")}

The server's relayer key pays the transaction fees, and the user only pays USDC. The number in parentheses is the fee as a share of what the user paid. The treasury takes 10% of each interaction, so when this share is above 10% the platform loses money on that action.

How to read this table:
- Each action does everything in one transaction: collecting the payment, recording the post or the count, splitting along the thread and counting achievements. That is why a single transaction uses between 140k and 280k gas. Usage varies within one kind of action (see the min and max above). The likely main causes are whether a storage slot is written for the first time and how many levels the split goes through. This has not been measured item by item.
- When C-Chain gas is low, the fee for a 0.05 USDC micro-interaction like a like is only 1% to 2%. At 5 nAVAX it rises to about 30%. The economics of micro-interactions are sensitive to the gas price, which is the reason the roadmap moves to a dedicated L1 where the platform sets the gas price itself.
- Known room for optimization (not done, needs a redeployment): pack the 8 achievement counters into 2 storage slots, compute accrued earnings on demand, merge events.
Regenerate: \`cd server && npx tsx scripts/cost-table.ts\`
`;
  const cn = `[English](cost-table.md) | 中文

# 成本表

生成时间 ${now}。方法：从索引数据库取每种动作最近的真实 Fuji 交易（最多 40 笔），读回执里的 gasUsed；
乘以 Avalanche 主网此刻的 gas 价格，再乘以 AVAX 美元价，得到「同样的动作放到主网要花多少手续费」。

- 主网 base fee：${formatUnits(baseFee, 9)} nAVAX；建议小费：${formatUnits(tipRaw, 9)} nAVAX；合计按 ${formatUnits(gasPrice, 9)} nAVAX 计
- AVAX 价格：${price === null ? "未取到（CoinGecko）" : `$${price}`}
- Posts 合约：${dep.posts}

| 动作 | 用户付的 USDC | 样本数 | gas 最小 | gas 平均 | gas 最大 | 主网手续费 @0.27 nAVAX（占付费比例） | 主网手续费 @此刻（占付费比例） |
|---|---|---|---|---|---|---|---|
${table("cn")}

手续费由服务端的代发钥匙垫付，用户只付 USDC。括号里是手续费占用户付费的比例：国库每笔互动抽 10%，这个比例超过 10% 时平台在这笔动作上是亏的。

怎么读这张表：
- 每个动作都在一笔交易里做完了收款、记帖或计数、沿传播链分账、成就计数，所以单笔用量在 14 万到 28 万之间。同一种动作的用量会浮动（看上表的最小与最大），推测主要差在是否第一次写入某个存储槽、以及分账走了几层；这一点没有逐项拆开实测。
- C-Chain 的 gas 价格低位时，点赞这种 0.05 USDC 的微互动手续费只占 1% 到 2%；价格涨到 5 nAVAX 时会占到三成。微互动的经济性对 gas 价格敏感，这正是路线图里「搬到专属 L1、由平台自己定 gas 价格」的理由。
- 已知的优化空间（未做，需要重新部署）：8 个成就计数压进 2 个存储槽、收益累计改为按需计算、合并事件。
重新生成：\`cd server && npx tsx scripts/cost-table.ts\`
`;
  writeFileSync(resolve(root, "docs/cost-table.md"), en);
  writeFileSync(resolve(root, "docs/cost-table.cn.md"), cn);
  console.log(en);
  console.log(cn);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
