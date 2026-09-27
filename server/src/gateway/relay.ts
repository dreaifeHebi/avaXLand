import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionReceiptNotFoundError,
  decodeEventLog,
  encodeFunctionData,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { postsAbi } from "@avaxland/protocol";
import { deployment, publicClient, relayer } from "../config";
import { noteNodeCount } from "./chainreads";

export type RelayFn = "mintWithAuth" | "createWithAuth" | "likeWithAuth";

export type Estimated = { ok: true; gas: bigint } | { ok: false; reason: string };
export type Sent =
  | { ok: true; txHash: Hex; receipt: TransactionReceipt; nodeId?: number; accountId?: number; sendMs: number; confirmMs: number }
  | { ok: false; stage: "send" | "receipt"; reason: string; txHash?: Hex };

/**
 * gas 上限 = 估算值 × 1.3。不能图省事给一个很宽的固定上限：
 * Avalanche 对每笔交易至少按 gas 上限的一半计费（实测上限 80 万的点赞被记成正好用了 40 万），
 * 上限超过真实用量的两倍就是白白多付。1.3 倍的余量用来覆盖估算之后状态变化带来的差异（比如正好跨过一个成就阈值）。
 */
const GAS_MARGIN_NUM = 13n;
const GAS_MARGIN_DEN = 10n;

function reasonOf(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r) return r.data?.errorName ?? r.reason ?? r.shortMessage;
    return e.shortMessage;
  }
  return String((e as Error)?.message ?? e);
}

/**
 * 估算 gas。它同时起到「模拟执行」的作用：会失败的调用在这里就拿到合约给出的明确原因（例如 AlreadyLiked），不花钱。
 */
export async function estimate(functionName: RelayFn, args: readonly unknown[]): Promise<Estimated> {
  try {
    // account 只传地址：传本地钥匙对象的话，库会为它额外去取编号和手续费，多出三次往返
    const gas = await publicClient.estimateContractGas({ address: deployment.posts, abi: postsAbi, functionName, args, account: relayer.address } as never);
    return { ok: true, gas };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

// ---------------------------------------------------------------- 发交易：自己管编号与手续费，只剩一次往返

let nextNonce: number | null = null;
async function syncNonce() {
  nextNonce = await publicClient.getTransactionCount({ address: relayer.address, blockTag: "pending" });
}

let fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; at: number } | null = null;
async function refreshFees() {
  const f = await publicClient.estimateFeesPerGas();
  const tip = f.maxPriorityFeePerGas ?? 0n;
  // 上限给两倍余量，实际只按当时的 base fee 收
  const cap = (f.maxFeePerGas ?? tip) * 2n;
  fees = { maxFeePerGas: cap > tip ? cap : tip, maxPriorityFeePerGas: tip, at: Date.now() };
  return fees;
}
async function currentFees() {
  // 后台每 10 秒刷新一次；这里只在从没取到过、或者后台刷新连续失败超过一分钟时才现取
  if (fees && Date.now() - fees.at < 60_000) return fees;
  return refreshFees();
}

/** 启动时先把编号和手续费取好，并在后台定时刷新手续费，请求路径上就不用为它多等一次往返 */
export async function warmupRelayer() {
  await Promise.all([syncNonce(), refreshFees()]);
  setInterval(() => void refreshFees().catch(() => undefined), 10_000).unref();
}

/** 同一把钥匙的交易必须按编号顺序发出，所以发送排队；等回执不占队列 */
let sendQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = sendQueue.then(fn, fn);
  sendQueue = p.catch(() => undefined);
  return p;
}

async function sendRaw(functionName: RelayFn, args: readonly unknown[], gas: bigint): Promise<Hex> {
  const data = encodeFunctionData({ abi: postsAbi, functionName, args } as never);
  const attempt = async () => {
    if (nextNonce === null) await syncNonce();
    const f = await currentFees();
    const serializedTransaction = await relayer.signTransaction({
      chainId: deployment.chainId,
      type: "eip1559",
      to: deployment.posts,
      data,
      value: 0n,
      gas,
      nonce: nextNonce!,
      maxFeePerGas: f.maxFeePerGas,
      maxPriorityFeePerGas: f.maxPriorityFeePerGas,
    });
    const hash = await publicClient.sendRawTransaction({ serializedTransaction });
    nextNonce = nextNonce! + 1;
    return hash;
  };
  try {
    return await attempt();
  } catch (e) {
    // 编号对不上（例如进程重启、别处用了这把钥匙）或手续费过期：重新取一次再试
    await syncNonce();
    fees = null;
    return await attempt();
  }
}

/**
 * 等回执：每 120 毫秒发起一次查询，不等上一次返回（到公共节点一次往返约 0.3 秒，串行轮询的分辨率太粗）。
 * 谁先查到算谁的。
 */
function waitReceipt(hash: Hex, timeoutMs = 60_000, everyMs = 120): Promise<TransactionReceipt> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      fn();
    };
    const tick = async () => {
      if (done) return;
      if (Date.now() - t0 > timeoutMs) return finish(() => reject(new Error("等回执超时")));
      try {
        const r = await publicClient.getTransactionReceipt({ hash });
        finish(() => resolve(r));
      } catch (e) {
        if (!(e instanceof TransactionReceiptNotFoundError) && Date.now() - t0 > timeoutMs) finish(() => reject(e));
      }
    };
    const timer = setInterval(() => void tick(), everyMs);
    void tick();
  });
}

export async function sendAndConfirm(functionName: RelayFn, args: readonly unknown[], estimatedGas: bigint): Promise<Sent> {
  const gas = (estimatedGas * GAS_MARGIN_NUM) / GAS_MARGIN_DEN;
  const t0 = Date.now();
  let txHash: Hex;
  try {
    txHash = await enqueue(() => sendRaw(functionName, args, gas));
  } catch (e) {
    return { ok: false, stage: "send", reason: reasonOf(e) };
  }
  const t1 = Date.now();
  let receipt: TransactionReceipt;
  try {
    receipt = await waitReceipt(txHash);
  } catch (e) {
    nextNonce = null; // 下次发送前重新对编号
    return { ok: false, stage: "receipt", reason: reasonOf(e), txHash };
  }
  if (receipt.status !== "success") return { ok: false, stage: "receipt", reason: "transaction reverted", txHash };

  const out: Sent = { ok: true, txHash, receipt, sendMs: t1 - t0, confirmMs: Date.now() - t1 };
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== deployment.posts.toLowerCase()) continue;
    try {
      const d = decodeEventLog({ abi: postsAbi, data: log.data, topics: log.topics });
      if (d.eventName === "NodeCreated") {
        out.nodeId = Number((d.args as { id: bigint }).id);
        noteNodeCount(out.nodeId);
      }
      if (d.eventName === "AccountMinted") out.accountId = Number((d.args as { accountId: bigint }).accountId);
    } catch {
      /* 不是我们关心的事件 */
    }
  }
  return out;
}
