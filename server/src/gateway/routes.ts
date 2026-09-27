import { Hono, type Context } from "hono";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import {
  HEADERS,
  buildNodeIntent,
  decodeHeader,
  encodeHeader,
  nonceForLike,
  nonceForMint,
  randomSalt,
  type Kind,
  type PaymentPayload,
  type PaymentRequired,
  type RejectReason,
  type SettlementResponse,
} from "@avaxland/protocol";
import { getConfig } from "../config";
import type { Queries } from "../db/queries";
import { accountTier, excerptLimit, nodeExists, payerFacts } from "./chainreads";
import { paymentRequired } from "./intent";
import { RateLimiter } from "./ratelimit";
import { estimate, sendAndConfirm, type RelayFn } from "./relay";
import { verifyFacts, verifyStatic } from "./verify";

const JSON_HEADERS = { "content-type": "application/json" };

function respond402(c: Context, pr: PaymentRequired) {
  return c.body(JSON.stringify(pr), 402, { ...JSON_HEADERS, [HEADERS.required]: encodeHeader(pr) });
}

function reject(c: Context, reason: RejectReason | string, detail?: string, status = 400) {
  return c.json({ error: reason, detail }, status as 400);
}

/** 读 PAYMENT-SIGNATURE 头；没有 → null（第一次请求，应回 402）；坏的 → "bad" */
function readPayload(c: Context): PaymentPayload | null | "bad" {
  const h = c.req.header(HEADERS.signature);
  if (!h) return null;
  try {
    return decodeHeader<PaymentPayload>(h);
  } catch {
    return "bad";
  }
}

const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("cf-connecting-ip") || "local";

/**
 * 付款到上链的共同流程：
 *   本地校验（不碰链）→ 并发：链上事实 + 估算 gas（兼作模拟执行，合并成一次往返）→ 发交易（一次往返）→ 轮询回执
 * 返回里带各阶段耗时，网页和 Agent 日志直接显示。
 */
async function settle(
  c: Context,
  p: {
    t0: number;
    payload: PaymentPayload;
    amount: bigint;
    nonce: Hex;
    accountId?: bigint;
    fn: RelayFn;
    args: (auth: { from: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex; signature: Hex }) => readonly unknown[];
    beforeSend?: () => void;
    body: (r: { nodeId?: number; accountId?: number }) => Record<string, unknown>;
    afterConfirm?: (r: { nodeId?: number; accountId?: number }) => void;
  },
) {
  const cfg = getConfig();
  const v = await verifyStatic({ payload: p.payload, expectedAmount: p.amount, expectedNonce: p.nonce });
  if (!v.ok) return reject(c, v.reason, v.detail);
  const args = p.args(v.auth);

  const [facts, est] = await Promise.all([payerFacts({ from: v.auth.from, nonce: v.auth.nonce, accountId: p.accountId }), estimate(p.fn, args)]);
  const checked = verifyFacts(v.auth, facts, p.accountId);
  if (!checked.ok) return reject(c, checked.reason, checked.detail);
  if (!est.ok) return reject(c, "SIMULATION_FAILED", est.reason);
  const checkMs = Date.now() - p.t0;

  p.beforeSend?.();
  const r = await sendAndConfirm(p.fn, args, est.gas);
  if (!r.ok) return c.json({ error: "RELAY_FAILED", detail: r.reason, txHash: r.txHash }, 502);
  p.afterConfirm?.(r);

  const settlement: SettlementResponse = { success: true, transaction: r.txHash, network: cfg.network, payer: v.auth.from, amount: p.amount.toString() };
  const body = {
    ...p.body(r),
    txHash: r.txHash,
    ms: Date.now() - p.t0,
    timing: { checkMs, sendMs: r.sendMs, confirmMs: r.confirmMs },
    block: Number(r.receipt.blockNumber),
    gasUsed: r.receipt.gasUsed.toString(),
  };
  return c.body(JSON.stringify(body), 200, { ...JSON_HEADERS, [HEADERS.response]: encodeHeader(settlement) });
}

export function createGateway(q: Queries) {
  const g = new Hono();
  const limiter = new RateLimiter(120);

  g.use("*", async (c, next) => {
    if (c.req.method === "POST" && !limiter.allow(clientIp(c))) return reject(c, "RATE_LIMITED", undefined, 429);
    await next();
  });

  // ------------------------------------------------------------ 开户
  g.post("/accounts", async (c) => {
    const t0 = Date.now();
    const body = await c.req.json().catch(() => null);
    const to = body?.to;
    const name = String(body?.name ?? "").trim();
    if (!isAddress(to ?? "") || name.length === 0 || name.length > 40) return reject(c, "BAD_REQUEST", "need to (address) and name (1-40 chars)");
    const toAddr = getAddress(to) as Address;
    const amount = BigInt(getConfig().prices.mint);

    const payload = readPayload(c);
    if (payload === "bad") return reject(c, "BAD_REQUEST", "PAYMENT-SIGNATURE header is not base64 JSON");
    if (!payload) {
      const salt = randomSalt();
      return respond402(
        c,
        paymentRequired({ path: "/accounts", description: `open account "${name}"`, amount, binding: { nonce: nonceForMint(toAddr, salt), salt, to: toAddr } }),
      );
    }
    const salt = payload.accepted?.extra?.binding?.salt;
    if (!salt) return reject(c, "BAD_REQUEST", "binding.salt missing");
    return settle(c, {
      t0,
      payload,
      amount,
      nonce: nonceForMint(toAddr, salt),
      fn: "mintWithAuth",
      args: (auth) => [toAddr, salt, auth],
      body: (r) => ({ accountId: r.accountId }),
      afterConfirm: (r) => {
        if (r.accountId) q.setAccountName.run({ id: r.accountId, owner: toAddr, name });
      },
    });
  });

  // ------------------------------------------------------------ 发帖 / 回复 / 转发
  g.post("/nodes", async (c) => {
    const t0 = Date.now();
    const body = await c.req.json().catch(() => null);
    const accountId = Number(body?.accountId);
    const parentId = Number(body?.parentId ?? 0);
    const kind = Number(body?.kind);
    const content: unknown = body?.content;
    if (!Number.isInteger(accountId) || accountId <= 0) return reject(c, "BAD_REQUEST", "accountId");
    if (!Number.isInteger(parentId) || parentId < 0) return reject(c, "BAD_REQUEST", "parentId");
    if (![0, 1, 2].includes(kind)) return reject(c, "BAD_REQUEST", "kind must be 0 post / 1 reply / 2 repost");
    if (typeof content !== "string") return reject(c, "BAD_REQUEST", "content must be a string");
    if (kind === 0 && parentId !== 0) return reject(c, "BAD_REQUEST", "a post has no parent");
    if (kind !== 0 && parentId === 0) return reject(c, "BAD_REQUEST", "reply/repost needs parentId");
    if (kind !== 2 && content.trim().length === 0) return reject(c, "BAD_REQUEST", "content is empty");
    if (content.length > 20_000) return reject(c, "BAD_REQUEST", "content too long (20000 chars max)");

    const cfg = getConfig();
    const amount = BigInt(kind === 0 ? cfg.prices.post : kind === 1 ? cfg.prices.reply : cfg.prices.repost);

    // 父节点存在吗、账号等级是多少：多数情况下命中缓存，不碰链
    const [parentOk, tier] = await Promise.all([parentId ? nodeExists(parentId) : Promise.resolve(true), accountTier(accountId)]);
    if (!parentOk) return reject(c, "PARENT_NOT_FOUND", `#${parentId}`);
    if (tier === null) return reject(c, "ACCOUNT_NOT_FOUND", `#${accountId}`);
    const maxBytes = await excerptLimit(tier);

    const payload = readPayload(c);
    if (payload === "bad") return reject(c, "BAD_REQUEST", "PAYMENT-SIGNATURE header is not base64 JSON");
    const salt = payload ? payload.accepted?.extra?.binding?.salt : randomSalt();
    if (!salt) return reject(c, "BAD_REQUEST", "binding.salt missing");
    const intent = buildNodeIntent({ accountId: BigInt(accountId), parentId: BigInt(parentId), kind: kind as Kind, content, salt, maxExcerptBytes: maxBytes });

    if (!payload) {
      return respond402(
        c,
        paymentRequired({
          path: "/nodes",
          description: kind === 0 ? "create post" : kind === 1 ? `reply to #${parentId}` : `repost #${parentId}`,
          amount,
          binding: {
            nonce: intent.nonce,
            salt,
            accountId,
            parentId,
            kind,
            contentHash: intent.contentHash,
            excerpt: intent.excerpt,
            excerptHash: intent.excerptHash,
          },
        }),
      );
    }
    return settle(c, {
      t0,
      payload,
      amount,
      nonce: intent.nonce,
      accountId: BigInt(accountId),
      fn: "createWithAuth",
      args: (auth) => [BigInt(accountId), BigInt(parentId), kind, intent.excerpt, intent.contentHash, salt, auth],
      // 全文先落库（键 = 全文哈希），交易成功后索引器按哈希关联
      beforeSend: () => q.putPendingContent.run(intent.contentHash, content, Math.floor(Date.now() / 1000)),
      body: (r) => ({ nodeId: r.nodeId }),
    });
  });

  // ------------------------------------------------------------ 点赞
  g.post("/nodes/:id/like", async (c) => {
    const t0 = Date.now();
    const nodeId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    const accountId = Number(body?.accountId);
    if (!Number.isInteger(nodeId) || nodeId <= 0) return reject(c, "BAD_REQUEST", "node id");
    if (!Number.isInteger(accountId) || accountId <= 0) return reject(c, "BAD_REQUEST", "accountId");
    const amount = BigInt(getConfig().prices.like);
    if (!(await nodeExists(nodeId))) return reject(c, "NODE_NOT_FOUND", `#${nodeId}`);
    const nonce = nonceForLike(BigInt(accountId), BigInt(nodeId));

    const payload = readPayload(c);
    if (payload === "bad") return reject(c, "BAD_REQUEST", "PAYMENT-SIGNATURE header is not base64 JSON");
    if (!payload) {
      return respond402(c, paymentRequired({ path: `/nodes/${nodeId}/like`, description: `like #${nodeId}`, amount, binding: { nonce, accountId, nodeId } }));
    }
    return settle(c, {
      t0,
      payload,
      amount,
      nonce,
      accountId: BigInt(accountId),
      fn: "likeWithAuth",
      args: (auth) => [BigInt(accountId), BigInt(nodeId), auth],
      body: () => ({}),
    });
  });

  return g;
}
