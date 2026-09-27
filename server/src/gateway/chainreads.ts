import { accountAbi, postsAbi, usdcAbi } from "@avaxland/protocol";
import type { Address, Hex } from "viem";
import { deployment, publicClient } from "../config";

/**
 * 网关需要的链上读取。原则：回 402 之前尽量用缓存（0 次往返），付款时的事实一次并发读完（1 次往返）。
 */

const excerptLimits = new Map<number, number>();
/** 摘要字节上限是合约里的纯函数，按等级缓存 */
export async function excerptLimit(tier: number): Promise<number> {
  const hit = excerptLimits.get(tier);
  if (hit !== undefined) return hit;
  const v = Number(await publicClient.readContract({ address: deployment.posts, abi: postsAbi, functionName: "maxExcerptBytes", args: [tier] }));
  excerptLimits.set(tier, v);
  return v;
}

let knownNodeCount = 0n;
/** 节点编号只增不减：已知的最大编号以内直接判定存在，超出才去链上问 */
export async function nodeExists(id: number): Promise<boolean> {
  if (BigInt(id) <= knownNodeCount) return true;
  knownNodeCount = await publicClient.readContract({ address: deployment.posts, abi: postsAbi, functionName: "nodeCount" });
  return BigInt(id) <= knownNodeCount;
}
export function noteNodeCount(n: bigint | number) {
  const v = BigInt(n);
  if (v > knownNodeCount) knownNodeCount = v;
}

const tiers = new Map<number, { tier: number; at: number }>();
/** 账号等级（决定摘要上限），缓存 60 秒；账号不存在返回 null */
export async function accountTier(accountId: number): Promise<number | null> {
  const hit = tiers.get(accountId);
  if (hit && Date.now() - hit.at < 60_000) return hit.tier;
  try {
    const [, tier] = await Promise.all([
      publicClient.readContract({ address: deployment.account, abi: accountAbi, functionName: "ownerOf", args: [BigInt(accountId)] }),
      publicClient.readContract({ address: deployment.account, abi: accountAbi, functionName: "tierOf", args: [BigInt(accountId)] }),
    ]);
    tiers.set(accountId, { tier, at: Date.now() });
    return tier;
  } catch {
    return null;
  }
}

export interface PayerFacts {
  /** 账号 NFT 当前持有人；不查账号时为 undefined；账号不存在为 null */
  owner: Address | null | undefined;
  nonceUsed: boolean;
  balance: bigint;
}

/** 付款时要核对的三件事，一次并发读完（合并成一次 Multicall） */
export async function payerFacts(p: { from: Address; nonce: Hex; accountId?: bigint }): Promise<PayerFacts> {
  const [owner, nonceUsed, balance] = await Promise.all([
    p.accountId === undefined
      ? Promise.resolve(undefined)
      : publicClient
          .readContract({ address: deployment.account, abi: accountAbi, functionName: "ownerOf", args: [p.accountId] })
          .catch(() => null),
    publicClient.readContract({ address: deployment.usdc, abi: usdcAbi, functionName: "authorizationState", args: [p.from, p.nonce] }),
    publicClient.readContract({ address: deployment.usdc, abi: usdcAbi, functionName: "balanceOf", args: [p.from] }),
  ]);
  return { owner, nonceUsed, balance };
}
