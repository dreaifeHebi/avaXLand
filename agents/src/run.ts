import { PaymentRejected } from "@avaxland/client";
import { Kind, type NodeDTO } from "@avaxland/protocol";
import { addSpend, canSpend, dayOf, nextDayStart } from "./budget";
import { DAILY_BUDGET, POST_EN_RATIO, POST_EVERY_MIN, POST_FIRST_DELAY_SEC, SELF_BUDGET } from "./env";
import { POST_MAX_CHARS, generate, pickProvider, postRules } from "./llm";
import { plan, type Action } from "./policy";
import { nextPostDelay, pickTopic, postPrompt } from "./posting";
import { loadConfig, loadState, makeClient, saveState, short, sleep, usdc, wallets, type AgentWallet } from "./shared";

/**
 * 演示 Agent 主循环：
 *   - 每 4 秒拉一次新节点 → 每个人格按规则决定动作 → 各自排队执行（每个 Agent 两次动作至少间隔 8 秒）
 *   - 每个人格隔一段时间主动发一条根帖（POST_EVERY_MIN，0 表示关掉），没有人发帖时时间线也不会静止
 *   - 花费按天记账，见 budget.ts
 *   ENV_FILE=.env.local npx tsx src/run.ts            从现在开始只对新内容反应
 *   ENV_FILE=.env.local REPLAY=1 npx tsx src/run.ts   连历史内容一起反应
 */
const POLL_MS = Number(process.env.POLL_MS ?? 4000);
const MIN_GAP_MS = Number(process.env.MIN_GAP_MS ?? 8000);
/** 余额不够时歇多久再试：补了钱之后不用重启 */
const PAUSE_MS = 10 * 60_000;
/** 发帖没成（大模型和备用帖子都用不上、或者上链失败）时多久后再试 */
const RETRY_POST_MS = 30 * 60_000;
/** 写帖子时给大模型看最近几条根帖，让它别重复 */
const RECENT_POSTS = 8;

/** self：这个动作是不是 Agent 自发的（主动发帖、或者对别的 Agent 的内容做反应），记账时用 */
type Job = (Action & { self: boolean }) | { kind: "post"; self: true };

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
  const price = { post: BigInt(cfg.prices.post), reply: BigInt(cfg.prices.reply), like: BigInt(cfg.prices.like), repost: BigInt(cfg.prices.repost) };
  const caps = { daily: DAILY_BUDGET, self: SELF_BUDGET };
  const queues = new Map<string, Job[]>(ws.map((w) => [w.persona.id, []]));
  const pausedUntil = new Map<string, number>();
  const paused = (id: string) => (pausedUntil.get(id) ?? 0) > Date.now();
  const capLogged = new Map<string, string>();
  /** 哪些人格的队列里已经有一条待发的帖子 */
  const postQueued = new Set<string>();
  const spend = (state.spend ??= {});
  const posting = (state.posting ??= {});

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

  // 主动发帖的排期：状态文件里没有就从现在起依次错开；有就沿用，重启不会连发
  const authors = POST_EVERY_MIN > 0 ? ws.filter((w) => w.persona.postPace > 0) : [];
  authors.forEach((w, i) => {
    posting[w.persona.id] ??= { nextAt: Date.now() + POST_FIRST_DELAY_SEC * 1000 * (1 + 2 * i), used: [] };
  });
  if (authors.length) saveState(cfg, state);

  console.log(`[agents] ${cfg.network} · 文案来源 ${pickProvider()} · ${ws.map((w) => `${w.persona.name}#${state.personas[w.persona.id]!.accountIds[0]}`).join(" ")} · 从节点 #${cursor} 之后开始`);
  console.log(
    `[agents] 每天上限 ${usdc(caps.daily)} USDC，其中自发 ${usdc(caps.self)} USDC · ` +
      (authors.length
        ? `主动发帖约每 ${POST_EVERY_MIN} 分钟一条，下一条：${authors.map((w) => `${w.persona.name} ${new Date(posting[w.persona.id]!.nextAt).toISOString().slice(5, 16).replace("T", " ")}`).join("、")}（UTC）`
        : "不主动发帖"),
  );

  const say = (w: AgentWallet, msg: string) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${w.persona.name.padEnd(8)} ${msg}`);

  /** 写一条根帖并发出去。成功返回 true；没发成返回 false，由调用方决定多久后再试 */
  async function publish(w: AgentWallet, accountId: number): Promise<boolean> {
    const sched = posting[w.persona.id]!;
    const topic = pickTopic(w.persona, sched.used);
    const recent = [...nodes.values()]
      .filter((n) => n.kind === Kind.Post)
      .sort((a, b) => b.id - a.id)
      .slice(0, RECENT_POSTS)
      .map((n) => n.fullText ?? n.excerpt);
    const lang = Math.random() < POST_EN_RATIO ? "en" : "zh";
    const g = await generate(w.persona, postPrompt(w.persona.topics[topic.index]!, recent, lang), {
      rules: postRules(usdc(cfg.prices.post)),
      fallback: w.persona.posts,
      maxChars: POST_MAX_CHARS,
    });
    if (recent.includes(g.text)) {
      say(w, `这条和最近的帖子重复了，这次不发${g.fellBack ? `（大模型失败：${g.fellBack}）` : ""}`);
      return false;
    }
    const r = await client.createNode({ accountId, parentId: 0, kind: Kind.Post, content: g.text }, w.signer);
    sched.used = topic.used;
    say(w, `📝 #${r.result.nodeId} 「${g.text}」 文案 ${g.provider} ${g.ms} ms${g.fellBack ? `（${g.fellBack}）` : ""} · tx ${short(r.result.txHash)} ${r.result.ms} ms`);
    return true;
  }

  async function perform(w: AgentWallet, job: Job) {
    const id = w.persona.id;
    const accountId = state.personas[id]!.accountIds[0]!;
    const cost = price[job.kind];
    try {
      const now = Date.now();
      if (!canSpend(spend[id], now, cost, job.self, caps)) {
        const mark = `${dayOf(now)}:${job.self ? "self" : "daily"}`;
        if (capLogged.get(id) !== mark) {
          capLogged.set(id, mark);
          say(w, `今天${job.self ? "自发的" : ""}额度用完了（已花 ${usdc(spend[id]?.total ?? "0")} USDC），到明天（UTC）再继续`);
        }
        // 发帖挪到明天，零点之后随机错开一两个小时
        if (job.kind === "post") posting[id]!.nextAt = nextDayStart(now) + Math.round(Math.random() * 2 * 3_600_000);
        return;
      }
      if (job.kind === "post") {
        const ok = await publish(w, accountId);
        posting[id]!.nextAt = Date.now() + (ok ? nextPostDelay(w.persona, POST_EVERY_MIN * 60_000) : RETRY_POST_MS);
        if (!ok) return;
      } else if (job.kind === "like") {
        const r = await client.likeNode({ accountId, nodeId: job.node.id }, w.signer);
        say(w, `👍 #${job.node.id}  tx ${short(r.result.txHash)}  ${r.result.ms} ms`);
      } else if (job.kind === "repost") {
        const r = await client.createNode({ accountId, parentId: job.node.id, kind: Kind.Repost, content: "" }, w.signer);
        say(w, `↻ #${job.node.id} → #${r.result.nodeId}  tx ${short(r.result.txHash)}  ${r.result.ms} ms`);
      } else {
        const root = nodes.get(job.node.rootId);
        const prompt = [
          root && root.id !== job.node.id ? `这棵讨论树的根帖（${root.authorName ?? `#${root.authorId}`}）：${root.fullText ?? root.excerpt}` : "",
          `你要回复的这条（${job.node.authorName ?? `#${job.node.authorId}`}）：${job.node.fullText ?? job.node.excerpt}`,
          "写出你的回复。",
        ]
          .filter(Boolean)
          .join("\n");
        const g = await generate(w.persona, prompt);
        const r = await client.createNode({ accountId, parentId: job.node.id, kind: Kind.Reply, content: g.text }, w.signer);
        say(w, `💬 #${job.node.id} → #${r.result.nodeId} 「${g.text}」 文案 ${g.provider} ${g.ms} ms${g.fellBack ? `（${g.fellBack}）` : ""} · tx ${short(r.result.txHash)} ${r.result.ms} ms`);
      }
      spend[id] = addSpend(spend[id], Date.now(), cost, job.self);
    } catch (e) {
      if (job.kind === "post") posting[id]!.nextAt = Date.now() + RETRY_POST_MS;
      if (e instanceof PaymentRejected && e.reason === "NONCE_USED") return; // 已经赞过
      if (e instanceof PaymentRejected && e.reason === "INSUFFICIENT_BALANCE") {
        say(w, `USDC 余额不够，歇 ${PAUSE_MS / 60_000} 分钟再试（给 ${w.address} 补钱之后不用重启）`);
        pausedUntil.set(id, Date.now() + PAUSE_MS);
        return;
      }
      say(w, `失败：${(e as Error).message}`);
    } finally {
      if (job.kind === "post") postQueued.delete(id);
      saveState(cfg, state);
    }
  }

  // 每个人格一个执行循环
  for (const w of ws) {
    (async () => {
      const q = queues.get(w.persona.id)!;
      for (;;) {
        if (paused(w.persona.id)) {
          // 歇着的时候攒下的动作都作废；该发的帖子等歇完了会重新排进来
          q.length = 0;
          postQueued.delete(w.persona.id);
        }
        const job = q.shift();
        if (!job) {
          await sleep(500);
          continue;
        }
        await perform(w, job);
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
        const self = agentIds.has(n.authorId);
        for (const w of ws) {
          const ownIds = new Set(state.personas[w.persona.id]!.accountIds);
          const actions = plan(w.persona, n, { ownIds, agentIds, depth: depthOf(n) });
          queues.get(w.persona.id)!.push(...actions.map((a) => ({ ...a, self })));
        }
      }
      if (page.items.length) {
        state.lastSeenId = cursor;
        saveState(cfg, state);
      }
    } catch (e) {
      console.log(`[agents] 拉取失败：${(e as Error).message}`);
    }
    // 到点了就把「发帖」排进队列；执行完会重新排期
    for (const w of authors) {
      const id = w.persona.id;
      if (Date.now() >= posting[id]!.nextAt && !postQueued.has(id) && !paused(id)) {
        postQueued.add(id);
        queues.get(id)!.push({ kind: "post", self: true });
      }
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
