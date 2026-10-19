import type { RejectReason } from "@avaxland/protocol";
import type { MessageKey, Translate } from "./i18n";
import { useMemo } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { PaymentRejected, RelayFailed, createClient, type Client, type Signer } from "@avaxland/client";
import { API_BASE } from "./api";
import { useConfig } from "./useConfig";

const REASON_KEYS: Record<string, MessageKey | undefined> = {
  INSUFFICIENT_BALANCE: "error.balance", NOT_OWNER: "error.owner", NONCE_USED: "error.nonceUsed",
  ACCOUNT_NOT_FOUND: "error.account", NODE_NOT_FOUND: "error.node", PARENT_NOT_FOUND: "error.parent",
  RATE_LIMITED: "error.rate", SIMULATION_FAILED: "error.simulation", EXPIRED: "error.expired",
  BAD_NETWORK: "error.network", BAD_REQUEST: "error.request", BAD_ASSET: "error.asset",
  BAD_PAYTO: "error.payTo", BAD_AMOUNT: "error.amount", NONCE_MISMATCH: "error.nonce",
  WINDOW_TOO_LONG: "error.window", EXCERPT_TOO_LONG: "error.excerpt",
  BAD_SIGNATURE: "error.signature", BAD_SIGNER: "error.signer",
} satisfies Record<RejectReason, MessageKey>;

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

export function payErrorText(e: unknown, t: Translate): string {
  if (e instanceof PaymentRejected) {
    const message = REASON_KEYS[e.reason] ? t(REASON_KEYS[e.reason]!) : t("error.payment", { reason: e.reason });
    return e.detail ? t("error.detail", { message, reason: e.detail }) : message;
  }
  if (e instanceof RelayFailed) return e.code === "RECEIPT_TIMEOUT" ? t("error.timeout") : t("error.relay", { reason: e.message });
  const m = (e as Error)?.message ?? String(e);
  if (m === "CONNECT_WALLET") return t("wallet.connectFirst");
  if (m === "CREATE_ACCOUNT") return t("account.createFirst");
  if (/rejected|denied|user refused/i.test(m)) return t("error.cancelled");
  return m.split("\n")[0]!;
}
