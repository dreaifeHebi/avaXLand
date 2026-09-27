import type { Address, Hex } from "viem";
import {
  DEFAULT_AUTH_VALIDITY_SECONDS,
  HEADERS,
  X402_VERSION,
  buildNodeIntent,
  chainIdFromNetwork,
  contentHash,
  decodeHeader,
  encodeHeader,
  nonceForLike,
  nonceForMint,
  receiveWithAuthorizationTypedData,
  type Binding,
  type Kind,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type RejectReason,
  type SettlementResponse,
} from "@avaxland/protocol";

/** 能替某个地址签 EIP-712 的东西：浏览器里是钱包（wagmi 的 signTypedDataAsync），脚本里是 viem 的私钥账户 */
export interface Signer {
  address: Address;
  signTypedData(typedData: ReturnType<typeof receiveWithAuthorizationTypedData>): Promise<Hex>;
}

export interface ClientOptions {
  baseUrl: string;
  /** 服务端声明的网络与币必须和这里一致，防止签到别的链或别的币上 */
  expect: { network: string; asset: Address };
  fetch?: typeof fetch;
  validitySeconds?: number;
}

export class PaymentRejected extends Error {
  constructor(
    public reason: RejectReason | string,
    public detail?: string,
    public status?: number,
  ) {
    super(`payment rejected: ${reason}${detail ? ` (${detail})` : ""}`);
  }
}

export class RelayFailed extends Error {
  constructor(
    message: string,
    public txHash?: Hex,
  ) {
    super(message);
  }
}

export interface PayResult<T> {
  result: T;
  settlement: SettlementResponse | null;
  /** 从第一次请求到拿到 200 的毫秒数（含链上确认） */
  ms: number;
}

async function toError(r: Response): Promise<Error> {
  let body: any = null;
  try {
    body = await r.json();
  } catch {
    /* ignore */
  }
  if (r.status === 502) return new RelayFailed(body?.detail ?? "relay failed", body?.txHash);
  return new PaymentRejected(body?.error ?? `HTTP_${r.status}`, body?.detail, r.status);
}

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

/** 客户端自己核对服务端给的绑定，确认 nonce 确实代表「我这次要做的事」，再签名。 */
export function verifyBinding(path: string, body: any, b: Binding): void {
  if (path === "/accounts") {
    if (!b.salt || !sameAddress(b.to ?? "", body.to)) throw new PaymentRejected("BAD_REQUEST", "binding.to mismatch");
    if (nonceForMint(body.to, b.salt) !== b.nonce) throw new PaymentRejected("NONCE_MISMATCH", "mint nonce");
    return;
  }
  if (path === "/nodes") {
    if (!b.salt || b.excerpt === undefined) throw new PaymentRejected("BAD_REQUEST", "binding incomplete");
    if (contentHash(body.content) !== b.contentHash) throw new PaymentRejected("NONCE_MISMATCH", "contentHash");
    if (!body.content.startsWith(b.excerpt)) throw new PaymentRejected("NONCE_MISMATCH", "excerpt is not a prefix");
    const intent = buildNodeIntent({
      accountId: BigInt(body.accountId),
      parentId: BigInt(body.parentId),
      kind: body.kind as Kind,
      content: body.content,
      salt: b.salt,
      maxExcerptBytes: new TextEncoder().encode(b.excerpt).length,
    });
    // 服务端截断长度由账号等级决定；这里用它给的摘要重新算一遍 nonce
    if (intent.excerpt !== b.excerpt || intent.nonce !== b.nonce) throw new PaymentRejected("NONCE_MISMATCH", "node nonce");
    return;
  }
  if (/^\/nodes\/\d+\/like$/.test(path)) {
    const nodeId = BigInt(path.split("/")[2]!);
    if (nonceForLike(BigInt(body.accountId), nodeId) !== b.nonce) throw new PaymentRejected("NONCE_MISMATCH", "like nonce");
    return;
  }
}

/** 请求 → 402 → 核对绑定 → 签 EIP-3009 授权 → 带签名重发 → 结果 */
export async function payAndCall<T>(opts: ClientOptions, path: string, body: unknown, signer: Signer): Promise<PayResult<T>> {
  const t0 = Date.now();
  const f = opts.fetch ?? fetch;
  const url = opts.baseUrl.replace(/\/$/, "") + path;
  const json = JSON.stringify(body);
  const r1 = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: json });
  if (r1.status !== 402) {
    if (r1.ok) return { result: (await r1.json()) as T, settlement: null, ms: Date.now() - t0 };
    throw await toError(r1);
  }
  const header = r1.headers.get(HEADERS.required);
  const required: PaymentRequired = header ? decodeHeader<PaymentRequired>(header) : ((await r1.json()) as PaymentRequired);
  const accepted: PaymentRequirements | undefined = required.accepts?.[0];
  if (!accepted || accepted.scheme !== "exact") throw new PaymentRejected("BAD_REQUEST", "no exact requirement");
  if (accepted.network !== opts.expect.network) throw new PaymentRejected("BAD_NETWORK", accepted.network);
  if (!sameAddress(accepted.asset, opts.expect.asset)) throw new PaymentRejected("BAD_ASSET", accepted.asset);
  verifyBinding(path, body, accepted.extra.binding);

  const now = Math.floor(Date.now() / 1000);
  const validity = Math.min(opts.validitySeconds ?? DEFAULT_AUTH_VALIDITY_SECONDS, accepted.maxTimeoutSeconds);
  const validBefore = BigInt(now + validity);
  const message = {
    from: signer.address,
    to: accepted.payTo,
    value: BigInt(accepted.amount),
    validAfter: 0n,
    validBefore,
    nonce: accepted.extra.binding.nonce,
  };
  const typedData = receiveWithAuthorizationTypedData(
    {
      name: accepted.extra.name,
      version: accepted.extra.version,
      chainId: chainIdFromNetwork(accepted.network),
      verifyingContract: accepted.asset,
    },
    message,
  );
  const signature = await signer.signTypedData(typedData);
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource: required.resource,
    accepted,
    payload: {
      signature,
      authorization: {
        from: signer.address,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: "0",
        validBefore: validBefore.toString(),
        nonce: accepted.extra.binding.nonce,
      },
    },
  };
  const r2 = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json", [HEADERS.signature]: encodeHeader(payload) },
    body: json,
  });
  if (!r2.ok) throw await toError(r2);
  const sh = r2.headers.get(HEADERS.response);
  return { result: (await r2.json()) as T, settlement: sh ? decodeHeader<SettlementResponse>(sh) : null, ms: Date.now() - t0 };
}

/** 服务端从收到签名到链上确认的耗时：校验与模拟、发出交易、等待出块确认 */
export interface Timing {
  checkMs: number;
  sendMs: number;
  confirmMs: number;
}
interface Settled {
  txHash: Hex;
  /** 服务端总耗时（毫秒），不含用户在钱包里点签名的时间 */
  ms: number;
  timing?: Timing;
  block?: number;
  gasUsed?: string;
}
export interface MintResult extends Settled {
  accountId: number;
}
export interface NodeResult extends Settled {
  nodeId: number;
}
export type LikeResult = Settled;

/** 便捷封装：网页、Agent、MCP 都用这一个 */
export function createClient(opts: ClientOptions) {
  return {
    opts,
    mintAccount: (p: { to: Address; name: string }, signer: Signer) => payAndCall<MintResult>(opts, "/accounts", p, signer),
    createNode: (p: { accountId: number; parentId: number; kind: Kind; content: string }, signer: Signer) =>
      payAndCall<NodeResult>(opts, "/nodes", p, signer),
    likeNode: (p: { accountId: number; nodeId: number }, signer: Signer) =>
      payAndCall<LikeResult>(opts, `/nodes/${p.nodeId}/like`, { accountId: p.accountId }, signer),
    async get<T>(path: string): Promise<T> {
      const r = await (opts.fetch ?? fetch)(opts.baseUrl.replace(/\/$/, "") + path);
      if (!r.ok) throw await toError(r);
      return (await r.json()) as T;
    },
  };
}

export type Client = ReturnType<typeof createClient>;

/** viem 私钥账户 → Signer */
export function viemSigner(account: { address: Address; signTypedData: (td: any) => Promise<Hex> }): Signer {
  return { address: account.address, signTypedData: (td) => account.signTypedData(td) };
}
