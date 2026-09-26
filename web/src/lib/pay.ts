import { useMemo } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { PaymentRejected, RelayFailed, createClient, type Client, type Signer } from "@avaxland/client";
import { API_BASE } from "./api";
import { useConfig } from "./useConfig";

const REASON_TEXT: Record<string, string> = {
  INSUFFICIENT_BALANCE: "USDC 余额不够",
  NOT_OWNER: "这个账号不属于当前钱包",
  NONCE_USED: "这个动作已经付过费了（同一账号对同一帖只能赞一次）",
  ACCOUNT_NOT_FOUND: "账号不存在",
  NODE_NOT_FOUND: "帖子不存在",
  PARENT_NOT_FOUND: "被回复的帖子不存在",
  RATE_LIMITED: "操作太频繁，稍等一下",
  SIMULATION_FAILED: "链上模拟执行失败",
  EXPIRED: "授权已过期，请重试",
  BAD_NETWORK: "钱包所在的链和服务端不一致",
};

/** 把 @avaxland/client 接到 wagmi：签名用钱包，其他不变 */
export function usePay(): { client: Client | null; signer: Signer | null; ready: boolean } {
  const cfg = useConfig();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const client = useMemo(
    () => (cfg.data ? createClient({ baseUrl: API_BASE, expect: { network: cfg.data.network, asset: cfg.data.addresses.usdc } }) : null),
    [cfg.data],
  );
  const signer = useMemo<Signer | null>(
    () => (address ? { address, signTypedData: (td) => signTypedDataAsync(td as never) } : null),
    [address, signTypedDataAsync],
  );
  return { client, signer, ready: !!client && !!signer };
}

export function payErrorText(e: unknown): string {
  if (e instanceof PaymentRejected) return REASON_TEXT[e.reason] ?? `${e.reason}${e.detail ? `：${e.detail}` : ""}`;
  if (e instanceof RelayFailed) return `上链失败：${e.message}`;
  const m = (e as Error)?.message ?? String(e);
  if (/rejected|denied|user refused/i.test(m)) return "你取消了签名";
  return m.split("\n")[0]!;
}
