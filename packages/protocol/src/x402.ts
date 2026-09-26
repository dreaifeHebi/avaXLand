import type { Address, Hex } from "viem";

/** x402 v2 的三个 HTTP 头 */
export const HEADERS = {
  required: "PAYMENT-REQUIRED",
  signature: "PAYMENT-SIGNATURE",
  response: "PAYMENT-RESPONSE",
} as const;

/** 服务端在 402 里附带的「意图绑定」：客户端必须用这个 nonce 签，合约会重算比对 */
export interface Binding {
  nonce: Hex;
  /** 开户与发帖有 salt；点赞没有 */
  salt?: Hex;
  /** 发帖类：合约将校验的字段，客户端可自行重算核对 */
  accountId?: number;
  parentId?: number;
  kind?: number;
  contentHash?: Hex;
  excerpt?: string;
  excerptHash?: Hex;
  /** 点赞 */
  nodeId?: number;
  /** 开户 */
  to?: Address;
}

export interface PaymentRequirements {
  scheme: "exact";
  /** CAIP-2，例如 eip155:43113 */
  network: string;
  /** USDC 最小单位的十进制字符串 */
  amount: string;
  asset: Address;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: {
    name: string;
    version: string;
    assetTransferMethod: "eip3009";
    authorizationType: "ReceiveWithAuthorization";
    binding: Binding;
  };
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export interface PaymentPayload {
  x402Version: 2;
  resource?: PaymentRequired["resource"];
  accepted: PaymentRequirements;
  payload: { signature: Hex; authorization: Authorization };
}

export interface SettlementResponse {
  success: boolean;
  errorReason?: string;
  payer?: Address;
  transaction: Hex | "";
  network: string;
  amount?: string;
}

export const REJECT_REASONS = [
  "NONCE_MISMATCH",
  "BAD_PAYTO",
  "BAD_AMOUNT",
  "BAD_ASSET",
  "BAD_NETWORK",
  "EXPIRED",
  "WINDOW_TOO_LONG",
  "BAD_SIGNATURE",
  "BAD_SIGNER",
  "NOT_OWNER",
  "NONCE_USED",
  "INSUFFICIENT_BALANCE",
  "SIMULATION_FAILED",
  "EXCERPT_TOO_LONG",
  "PARENT_NOT_FOUND",
  "NODE_NOT_FOUND",
  "ACCOUNT_NOT_FOUND",
  "BAD_REQUEST",
  "RATE_LIMITED",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export function chainIdFromNetwork(network: string): number {
  const m = /^eip155:(\d+)$/.exec(network);
  if (!m) throw new Error(`unsupported network: ${network}`);
  return Number(m[1]);
}

export function networkFromChainId(chainId: number): string {
  return `eip155:${chainId}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 头里放 base64(JSON)，浏览器与 Node 通用 */
export function encodeHeader(obj: unknown): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(obj)));
}

export function decodeHeader<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64ToBytes(value))) as T;
}
