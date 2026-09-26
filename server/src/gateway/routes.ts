import { Hono, type Context } from "hono";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import {
  HEADERS,
  accountAbi,
  buildNodeIntent,
  decodeHeader,
  encodeHeader,
  nonceForLike,
  nonceForMint,
  postsAbi,
  randomSalt,
  type Kind,
  type PaymentPayload,
  type PaymentRequired,
  type RejectReason,
  type SettlementResponse,
} from "@avaxland/protocol";
import { deployment, getConfig, publicClient } from "../config";
import type { Queries } from "../db/queries";
import { paymentRequired } from "./intent";
import { RateLimiter } from "./ratelimit";
import { relay, type RelayOutcome } from "./relay";
import { verifyPayment } from "./verify";

const JSON_HEADERS = { "content-type": "application/json" };

function respond402(c: Context, pr: PaymentRequired) {
  return c.body(JSON.stringify(pr), 402, { ...JSON_HEADERS, [HEADERS.required]: encodeHeader(pr) });
}

function reject(c: Context, reason: RejectReason | string, detail?: string, status = 400) {
  return c.json({ error: reason, detail }, status as 400);
}

function relayError(c: Context, r: Extract<RelayOutcome, { ok: false }>) {
  if (r.stage === "simulate") return reject(c, "SIMULATION_FAILED", r.reason);
  return c.json({ error: "RELAY_FAILED", detail: r.reason, txHash: r.txHash }, 502);
}

function settled(c: Context, s: SettlementResponse, body: unknown) {
  return c.body(JSON.stringify(body), 200, { ...JSON_HEADERS, [HEADERS.response]: encodeHeader(s) });
}

/** 读 PAYMENT-SIGNATURE 头；没有 → null（表示第一次请求，应回 402）；坏的 → "bad" */
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

export function createGateway(q: Queries) {
  const g = new Hono();
  const limiter = new RateLimiter(60);

  g.use("*", async (c, next) => {
    if (!limiter.allow(clientIp(c))) return reject(c, "RATE_LIMITED", undefined, 429);
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
    const cfg = getConfig();
    const amount = BigInt(cfg.prices.mint);

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
    const v = await verifyPayment({ payload, expectedAmount: amount, expectedNonce: nonceForMint(toAddr, salt) });
    if (!v.ok) return reject(c, v.reason, v.detail);

    const r = await relay("mintWithAuth", [toAddr, salt, v.auth]);
    if (!r.ok) return relayError(c, r);
    if (r.accountId) q.setAccountName.run({ id: r.accountId, owner: toAddr, name });
    return settled(
      c,
      { success: true, transaction: r.txHash, network: cfg.network, payer: v.auth.from, amount: amount.toString() },
      { accountId: r.accountId, txHash: r.txHash, ms: Date.now() - t0 },
    );
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

    // 父节点是否存在：以链为准（索引器可能还没追上）
    if (parentId) {
      const count = await publicClient.readContract({ address: deployment.posts, abi: postsAbi, functionName: "nodeCount" });
      if (BigInt(parentId) > count) return reject(c, "PARENT_NOT_FOUND", `#${parentId}`);
    }
    // 账号存在？等级决定摘要上限
    let tier: number;
    try {
      await publicClient.readContract({ address: deployment.account, abi: accountAbi, functionName: "ownerOf", args: [BigInt(accountId)] });
      tier = await publicClient.readContract({ address: deployment.account, abi: accountAbi, functionName: "tierOf", args: [BigInt(accountId)] });
    } catch {
      return reject(c, "ACCOUNT_NOT_FOUND", `#${accountId}`);
    }
    const maxBytes = Number(await publicClient.readContract({ address: deployment.posts, abi: postsAbi, functionName: "maxExcerptBytes", args: [tier] }));

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
    const v = await verifyPayment({ payload, expectedAmount: amount, expectedNonce: intent.nonce, accountId: BigInt(accountId) });
    if (!v.ok) return reject(c, v.reason, v.detail);

    // 全文先落库（键 = 全文哈希），交易成功后索引器按哈希关联
    q.putPendingContent.run(intent.contentHash, content, Math.floor(Date.now() / 1000));
    const r = await relay("createWithAuth", [BigInt(accountId), BigInt(parentId), kind, intent.excerpt, intent.contentHash, salt, v.auth]);
    if (!r.ok) return relayError(c, r);
    return settled(
      c,
      { success: true, transaction: r.txHash, network: cfg.network, payer: v.auth.from, amount: amount.toString() },
      { nodeId: r.nodeId, txHash: r.txHash, ms: Date.now() - t0 },
    );
  });

  // ------------------------------------------------------------ 点赞
  g.post("/nodes/:id/like", async (c) => {
    const t0 = Date.now();
    const nodeId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => null);
    const accountId = Number(body?.accountId);
    if (!Number.isInteger(nodeId) || nodeId <= 0) return reject(c, "BAD_REQUEST", "node id");
    if (!Number.isInteger(accountId) || accountId <= 0) return reject(c, "BAD_REQUEST", "accountId");
    const cfg = getConfig();
    const amount = BigInt(cfg.prices.like);
    const count = await publicClient.readContract({ address: deployment.posts, abi: postsAbi, functionName: "nodeCount" });
    if (BigInt(nodeId) > count) return reject(c, "NODE_NOT_FOUND", `#${nodeId}`);
    const nonce = nonceForLike(BigInt(accountId), BigInt(nodeId));

    const payload = readPayload(c);
    if (payload === "bad") return reject(c, "BAD_REQUEST", "PAYMENT-SIGNATURE header is not base64 JSON");
    if (!payload) {
      return respond402(c, paymentRequired({ path: `/nodes/${nodeId}/like`, description: `like #${nodeId}`, amount, binding: { nonce, accountId, nodeId } }));
    }
    const v = await verifyPayment({ payload, expectedAmount: amount, expectedNonce: nonce, accountId: BigInt(accountId) });
    if (!v.ok) return reject(c, v.reason, v.detail);
    const r = await relay("likeWithAuth", [BigInt(accountId), BigInt(nodeId), v.auth]);
    if (!r.ok) return relayError(c, r);
    return settled(
      c,
      { success: true, transaction: r.txHash as Hex, network: cfg.network, payer: v.auth.from, amount: amount.toString() },
      { txHash: r.txHash, ms: Date.now() - t0 },
    );
  });

  return g;
}
