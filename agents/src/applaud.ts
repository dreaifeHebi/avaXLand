import { PaymentRejected } from "@avaxland/client";
import { loadConfig, loadState, makeClient, saveState, short, sleep, wallets } from "./shared";

/**
 * 集体点赞：让所有 Agent 名下的账号去赞同一条帖子，用来演示「第 10 个赞落下，徽章弹出」。
 * --count 是「再新增多少个赞」：已经赞过的账号不算；账号不够时轮流给各个 Agent 再开新账号（每个 1 USDC）。
 *   ENV_FILE=.env.local npx tsx src/applaud.ts --node 3 --count 10
 */
function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main() {
  const nodeId = Number(arg("node"));
  const count = Number(arg("count", "10"));
  const gap = Number(arg("gap", "400"));
  const cfg = await loadConfig();
  const client = makeClient(cfg);
  const state = loadState(cfg);
  const ws = wallets().filter((w) => state.personas[w.persona.id]);
  if (!ws.length) throw new Error("先跑 setup.ts");
  const node = (await client.get<{ node: { authorId: number; likes: number } }>(`/nodes/${nodeId}`)).node;

  // 还没赞过这条、且不是作者本人的账号
  const liked = new Set<number>();
  const pool = () =>
    ws.flatMap((w) => state.personas[w.persona.id]!.accountIds.filter((id) => id !== node.authorId && !liked.has(id)).map((id) => ({ w, id })));
  const mintOne = async (i: number) => {
    const w = ws[i % ws.length]!;
    const n = state.personas[w.persona.id]!.accountIds.length + 1;
    const r = await client.mintAccount({ to: w.address, name: `${w.persona.name}·${n}` }, w.signer);
    state.personas[w.persona.id]!.accountIds.push(r.result.accountId);
    saveState(cfg, state);
    console.log(`开户 #${r.result.accountId} ${w.persona.name}·${n}  ${r.ms} ms`);
  };

  console.log(`帖子 #${nodeId} 现在 ${node.likes} 个赞；目标：再新增 ${count} 个赞`);
  let done = 0;
  let minted = 0;
  while (done < count) {
    const next = pool()[0];
    if (!next) {
      await mintOne(minted++); // 账号不够了，轮流给各个 Agent 再开一个
      continue;
    }
    liked.add(next.id);
    try {
      const r = await client.likeNode({ accountId: next.id, nodeId }, next.w.signer);
      console.log(`👍 第 ${++done} 个  账号 #${next.id} (${next.w.persona.name})  tx ${short(r.result.txHash)}  ${r.ms} ms`);
      await sleep(gap);
    } catch (e) {
      if (e instanceof PaymentRejected && e.reason === "NONCE_USED") continue; // 以前赞过，不算数
      console.log(`   账号 #${next.id} 失败：${(e as Error).message}`);
      if (e instanceof PaymentRejected && e.reason === "INSUFFICIENT_BALANCE") break;
    }
  }
  console.log(`完成：新增 ${done} 个赞`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
