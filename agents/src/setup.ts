import { usdcAbi } from "@avaxland/protocol";
import { ACCOUNTS_PER_AGENT } from "./env";
import { loadConfig, loadState, makeClient, publicClientFor, saveState, usdc, usdcBalance, walletClientFor, wallets } from "./shared";

/**
 * 为每个人格准备好账号：查余额 →（本地链自动铸测试币）→ 开到 ACCOUNTS_PER_AGENT 个账号 → 写 state.<chainId>.json
 *   ENV_FILE=.env.local npx tsx src/setup.ts
 */
async function main() {
  const cfg = await loadConfig();
  const client = makeClient(cfg);
  const state = loadState(cfg);
  const ws = wallets();
  if (!ws.length) throw new Error("环境文件里没有任何 AGENT_KEY_*，先跑 keygen.ts");
  const mintFee = BigInt(cfg.prices.mint);

  for (const w of ws) {
    let bal = await usdcBalance(cfg, w.address);
    if (cfg.chainId === 31337 && bal < 50_000_000n) {
      // 本地链的 MockUSDC 任何人都能铸
      const wc = walletClientFor(cfg, w.key);
      const hash = await wc.writeContract({ address: cfg.addresses.usdc, abi: usdcAbi, functionName: "mint", args: [w.address, 1_000_000_000n] });
      await publicClientFor(cfg).waitForTransactionReceipt({ hash });
      bal = await usdcBalance(cfg, w.address);
    }
    const owned = (await client.get<{ items: { id: number; name: string | null }[] }>(`/accounts/by-owner/${w.address}`)).items;
    const ids = owned.map((a) => a.id);
    const missing = Math.max(0, ACCOUNTS_PER_AGENT - ids.length);
    if (missing > 0 && bal < mintFee * BigInt(missing)) {
      console.log(`${w.persona.name.padEnd(8)} ${w.address}  USDC ${usdc(bal)}  账号 ${ids.length}/${ACCOUNTS_PER_AGENT}  ← 余额不够开户，先给这个地址打 USDC`);
      state.personas[w.persona.id] = { address: w.address, accountIds: ids };
      continue;
    }
    for (let i = 0; i < missing; i++) {
      const n = ids.length + 1;
      const name = n === 1 ? w.persona.name : `${w.persona.name}·${n}`;
      const r = await client.mintAccount({ to: w.address, name }, w.signer);
      ids.push(r.result.accountId);
      console.log(`  开户 #${r.result.accountId} ${name}  tx ${r.result.txHash}  ${r.ms} ms`);
    }
    bal = await usdcBalance(cfg, w.address);
    state.personas[w.persona.id] = { address: w.address, accountIds: ids };
    console.log(`${w.persona.name.padEnd(8)} ${w.address}  USDC ${usdc(bal)}  账号 [${ids.join(", ")}]`);
  }
  saveState(cfg, state);
  console.log(`\n状态已写入 state.${cfg.chainId}.json`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
