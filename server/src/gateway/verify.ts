import { isAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";
import {
  accountAbi,
  receiveWithAuthorizationTypedData,
  usdcAbi,
  type PaymentPayload,
  type RejectReason,
} from "@avaxland/protocol";
import { deployment, getConfig, publicClient } from "../config";

export interface VerifiedAuth {
  from: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}

export type Verified = { ok: true; auth: VerifiedAuth } | { ok: false; reason: RejectReason; detail?: string };

const same = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();
const bad = (reason: RejectReason, detail?: string): Verified => ({ ok: false, reason, detail });

/**
 * 七步校验（顺序即优先级）：
 * 1 载荷形状 / 网络 / 币 / 收款方  2 金额  3 nonce == 服务端重算的意图哈希  4 有效期
 * 5 签名恢复出的地址 == from  6 from == 账号 NFT 持有人（开户时跳过）  7 nonce 未用过 && 余额够
 */
export async function verifyPayment(p: {
  payload: PaymentPayload;
  expectedAmount: bigint;
  expectedNonce: Hex;
  accountId?: bigint;
}): Promise<Verified> {
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

  if (p.accountId !== undefined) {
    let owner: Address;
    try {
      owner = await publicClient.readContract({ address: deployment.account, abi: accountAbi, functionName: "ownerOf", args: [p.accountId] });
    } catch {
      return bad("ACCOUNT_NOT_FOUND", `#${p.accountId}`);
    }
    if (!same(owner, a.from)) return bad("NOT_OWNER", `account #${p.accountId} is owned by ${owner}`);
  }

  const [used, balance] = await Promise.all([
    publicClient.readContract({ address: cfg.addresses.usdc, abi: usdcAbi, functionName: "authorizationState", args: [a.from, a.nonce] }),
    publicClient.readContract({ address: cfg.addresses.usdc, abi: usdcAbi, functionName: "balanceOf", args: [a.from] }),
  ]);
  if (used) return bad("NONCE_USED");
  if (balance < value) return bad("INSUFFICIENT_BALANCE", `balance ${balance}, need ${value}`);

  return { ok: true, auth: { from: a.from, value, validAfter, validBefore, nonce: a.nonce, signature: sig } };
}
