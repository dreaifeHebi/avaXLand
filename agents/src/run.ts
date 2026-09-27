import { PaymentRejected } from "@avaxland/client";
import { Kind, type NodeDTO } from "@avaxland/protocol";
import { AGENT_BUDGET } from "./env";
import { generate, pickProvider } from "./llm";
import { plan, type Action } from "./policy";
import { loadConfig, loadState, makeClient, saveState, short, sleep, usdc, wallets, type AgentWallet } from "./shared";

/**
 * 演示 Agent 主循环：每 4 秒拉一次新节点 → 每个人格按规则决定动作 → 各自排队执行（每个 Agent 两次动作至少间隔 8 秒）。
 *   ENV_FILE=.env.local npx tsx src/run.ts            从现在开始只对新内容反应
 *   ENV_FILE=.env.local REPLAY=1 npx tsx src/run.ts   连历史内容一起反应
 */
const POLL_MS = Number(process.env.POLL_MS ?? 4000);
const MIN_GAP_MS = Number(process.env.MIN_GAP_MS ?? 8000);

async function main() {
  const cfg = await loadConfig();
  const client = makeClient(cfg);
  const state = loadState(cfg);
  const ws = wallets().filter((w) => (state.personas[w.persona.id]?.accountIds.length ?? 0) > 0);
  if (!ws.length) throw new Error("还没有任何 Agent 账号，先跑 setup.ts");

  const agentIds = new Set<number>(Object.values(state.personas).flatMap((p) => p.accountIds));
  const nodes = new Map<number, NodeDTO>();
  const depthOf = (n: NodeDTO): number => {
    let d = 0;
    let cur: NodeDTO | undefined = n;
    while (cur && cur.parentId !== 0 && d < 50) {
      cur = nodes.get(cur.parentId);
      d++;
    }
    return d;
  };
  const price = { reply: BigInt(cfg.prices.reply), like: BigInt(cfg.prices.like), repost: BigInt(cfg.prices.repost) };
  const spent = new Map<string, bigint>();
  const queues = new Map<string, Action[]>(ws.map((w) => [w.persona.id, []]));
  const disabled = new Set<string>();

  // 先把已有节点读进来，只为了知道层数与上下文
  let last = 0;
  for (;;) {
    const page = await client.get<{ items: NodeDTO[] }>(`/feed/since/${last}`);
    for (const n of page.items) {
      nodes.set(n.id, n);
      last = n.id;
    }
    if (page.items.length < 200) break;
  }
  let cursor = process.env.REPLAY ? 0 : last;
  console.log(`[agents] ${cfg.network} · 文案来源 ${pickProvider()} · ${ws.map((w) => `${w.persona.name}#${state.personas[w.persona.id]!.accountIds[0]}`).join(" ")} · 从节点 #${cursor} 之后开始`);

  const say = (w: AgentWallet, msg: string) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${w.persona.name.padEnd(8)} ${msg}`);

  async function perform(w: AgentWallet, a: Action) {
    const accountId = state.personas[w.persona.id]!.accountIds[0]!;
    const cost = price[a.kind];
    const used = spent.get(w.persona.id) ?? 0n;
    if (used + cost > AGENT_BUDGET) {
      say(w, `预算用完（已花 ${usdc(used)} USDC），停手`);
      disabled.add(w.persona.id);
      return;
    }
    try {
      if (a.kind === "like") {
        const r = await client.likeNode({ accountId, nodeId: a.node.id }, w.signer);
        say(w, `👍 #${a.node.id}  tx ${short(r.result.txHash)}  ${r.result.ms} ms`);
      } else if (a.kind === "repost") {
        const r = await client.createNode({ accountId, parentId: a.node.id, kind: Kind.Repost, content: "" }, w.signer);
        say(w, `↻ #${a.node.id} → #${r.result.nodeId}  tx ${short(r.result.txHash)}  ${r.result.ms} ms`);
      } else {
        const root = nodes.get(a.node.rootId);
        const prompt = [
          root && root.id !== a.node.id ? `这棵讨论树的根帖（${root.authorName ?? `#${root.authorId}`}）：${root.fullText ?? root.excerpt}` : "",
          `你要回复的这条（${a.node.authorName ?? `#${a.node.authorId}`}）：${a.node.fullText ?? a.node.excerpt}`,
          "写出你的回复。",
        ]
          .filter(Boolean)
          .join("\n");
        const g = await generate(w.persona, prompt);
        const r = await client.createNode({ accountId, parentId: a.node.id, kind: Kind.Reply, content: g.text }, w.signer);
        say(w, `💬 #${a.node.id} → #${r.result.nodeId} 「${g.text}」 文案 ${g.provider} ${g.ms} ms${g.fellBack ? `（${g.fellBack}）` : ""} · tx ${short(r.result.txHash)} ${r.result.ms} ms`);
      }
      spent.set(w.persona.id, used + cost);
    } catch (e) {
      if (e instanceof PaymentRejected && e.reason === "NONCE_USED") return; // 已经赞过
      if (e instanceof PaymentRejected && e.reason === "INSUFFICIENT_BALANCE") {
        say(w, "USDC 余额不够，停手");
        disabled.add(w.persona.id);
        return;
      }
      say(w, `失败：${(e as Error).message}`);
    }
  }

  // 每个人格一个执行循环
  for (const w of ws) {
    (async () => {
      const q = queues.get(w.persona.id)!;
      for (;;) {
        const a = q.shift();
        if (!a || disabled.has(w.persona.id)) {
          await sleep(500);
          continue;
        }
        await perform(w, a);
        await sleep(MIN_GAP_MS);
      }
    })();
  }

  for (;;) {
    try {
      const page = await client.get<{ items: NodeDTO[] }>(`/feed/since/${cursor}`);
      for (const n of page.items) {
        nodes.set(n.id, n);
        cursor = n.id;
        for (const w of ws) {
          if (disabled.has(w.persona.id)) continue;
          const ownIds = new Set(state.personas[w.persona.id]!.accountIds);
          const actions = plan(w.persona, n, { ownIds, agentIds, depth: depthOf(n) });
          queues.get(w.persona.id)!.push(...actions);
        }
      }
      if (page.items.length) {
        state.lastSeenId = cursor;
        saveState(cfg, state);
      }
    } catch (e) {
      console.log(`[agents] 拉取失败：${(e as Error).message}`);
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
