import { isAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { receiveWithAuthorizationTypedData, type PaymentPayload, type RejectReason } from "@avaxland/protocol";
import { getConfig } from "../config";
import type { PayerFacts } from "./chainreads";

export interface VerifiedAuth {
  from: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}

export type Verified = { ok: true; auth: VerifiedAuth } | { ok: false; reason: RejectReason; detail?: string };
export type Checked = { ok: true } | { ok: false; reason: RejectReason; detail?: string };

const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();
const bad = (reason: RejectReason, detail?: string) => ({ ok: false as const, reason, detail });

/**
 * 校验分两段。第一段不碰链（纯本地计算）：
 * 1 载荷形状 / 网络 / 币 / 收款方  2 金额  3 nonce == 服务端重算的意图哈希  4 有效期  5 签名恢复出的地址 == from
 */
export async function verifyStatic(p: { payload: PaymentPayload; expectedAmount: bigint; expectedNonce: Hex }): Promise<Verified> {
  const cfg = getConfig();
  const a = p.payload?.payload?.authorization;
  const sig = p.payload?.payload?.signature;
  if (!a || !sig || !isAddress(a.from ?? "")) return bad("BAD_REQUEST", "payload shape");
  if (p.payload.accepted?.network !== cfg.network) return bad("BAD_NETWORK", p.payload.accepted?.network);
  if (!same(p.payload.accepted?.asset, cfg.addresses.usdc)) return bad("BAD_ASSET");
  if (!same(a.to, cfg.addresses.posts)) return bad("BAD_PAYTO");

  let value: bigint;
  let validAfter: bigint;
  let validBefore: bigint;
  try {
    value = BigInt(a.value);
    validAfter = BigInt(a.validAfter);
    validBefore = BigInt(a.validBefore);
  } catch {
    return bad("BAD_REQUEST", "authorization numbers");
  }
  if (value !== p.expectedAmount) return bad("BAD_AMOUNT", `expected ${p.expectedAmount}`);
  if (!same(a.nonce, p.expectedNonce)) return bad("NONCE_MISMATCH");

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (validAfter > now) return bad("EXPIRED", "validAfter is in the future");
  if (validBefore <= now + 30n) return bad("EXPIRED", "validBefore too soon");
  if (validBefore > now + 360n) return bad("WINDOW_TOO_LONG", "validBefore beyond 5 minutes");

  const typedData = receiveWithAuthorizationTypedData(
    { name: cfg.usdc.name, version: cfg.usdc.version, chainId: cfg.chainId, verifyingContract: cfg.addresses.usdc },
    { from: a.from, to: cfg.addresses.posts, value, validAfter, validBefore, nonce: a.nonce },
  );
  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({ ...typedData, signature: sig });
  } catch {
    return bad("BAD_SIGNATURE");
  }
  if (!same(signer, a.from)) return bad("BAD_SIGNER", `recovered ${signer}`);
  return { ok: true, auth: { from: a.from, value, validAfter, validBefore, nonce: a.nonce, signature: sig } };
}

/**
 * 第二段用一次并发读回来的链上事实判断：
 * 6 from == 账号 NFT 持有人（开户时不查）  7 nonce 未用过 && 余额够
 */
export function verifyFacts(auth: VerifiedAuth, facts: PayerFacts, accountId?: bigint): Checked {
  if (accountId !== undefined) {
    if (facts.owner === null || facts.owner === undefined) return bad("ACCOUNT_NOT_FOUND", `#${accountId}`);
    if (!same(facts.owner, auth.from)) return bad("NOT_OWNER", `account #${accountId} is owned by ${facts.owner}`);
  }
  if (facts.nonceUsed) return bad("NONCE_USED");
  if (facts.balance < auth.value) return bad("INSUFFICIENT_BALANCE", `balance ${facts.balance}, need ${auth.value}`);
  return { ok: true };
}
