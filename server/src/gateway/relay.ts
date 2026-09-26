import { BaseError, ContractFunctionRevertedError, decodeEventLog, type Hex, type TransactionReceipt } from "viem";
import { postsAbi } from "@avaxland/protocol";
import { deployment, publicClient, relayer, walletClient } from "../config";

type Fn = "mintWithAuth" | "createWithAuth" | "likeWithAuth";

export type RelayOutcome =
  | { ok: true; txHash: Hex; receipt: TransactionReceipt; nodeId?: number; accountId?: number }
  | { ok: false; stage: "simulate" | "send" | "receipt"; reason: string; txHash?: Hex };

/** 串行发送，避免同一把 relayer 钥匙并发发交易时 nonce 撞车；等回执不占队列 */
let sendQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = sendQueue.then(fn, fn);
  sendQueue = p.catch(() => undefined);
  return p;
}

function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r) return r.data?.errorName ?? r.reason ?? r.shortMessage;
    return e.shortMessage;
  }
  return String((e as Error)?.message ?? e);
}

/** 先模拟（拿到明确的失败原因），再显式给 gas 发出去，等回执，最后从日志里读出新 id */
export async function relay(functionName: Fn, args: readonly unknown[]): Promise<RelayOutcome> {
  const call = { address: deployment.posts, abi: postsAbi, functionName, args, account: relayer } as const;
  let request: unknown;
  try {
    const sim = await publicClient.simulateContract(call as never);
    request = sim.request;
  } catch (e) {
    return { ok: false, stage: "simulate", reason: revertReason(e) };
  }
  let gas: bigint;
  try {
    gas = ((await publicClient.estimateContractGas(call as never)) * 13n) / 10n;
  } catch {
    gas = 600_000n; // Fuji 公共 RPC 偶尔估不出来，给个足够的上限
  }
  let txHash: Hex;
  try {
    txHash = await enqueue(() => walletClient.writeContract({ ...(request as object), gas } as never));
  } catch (e) {
    return { ok: false, stage: "send", reason: revertReason(e) };
  }
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, pollingInterval: 500, timeout: 90_000 });
  } catch (e) {
    return { ok: false, stage: "receipt", reason: revertReason(e), txHash };
  }
  if (receipt.status !== "success") return { ok: false, stage: "receipt", reason: "transaction reverted", txHash };

  const out: RelayOutcome = { ok: true, txHash, receipt };
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== deployment.posts.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: postsAbi, data: log.data, topics: log.topics });
      if (d.eventName === "NodeCreated") out.nodeId = Number((d.args as { id: bigint }).id);
      if (d.eventName === "AccountMinted") out.accountId = Number((d.args as { accountId: bigint }).accountId);
    } catch {
      /* 不是我们关心的事件 */
    }
  }
  return out;
}
