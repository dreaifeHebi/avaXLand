import { X402_VERSION, type Binding, type PaymentRequired } from "@avaxland/protocol";
import { env, getConfig } from "../config";

/** 组 x402 v2 的 PaymentRequired：付多少、付到哪、用什么币，以及我们要求的 nonce 绑定 */
export function paymentRequired(p: { path: string; description: string; amount: bigint; binding: Binding }): PaymentRequired {
  const cfg = getConfig();
  return {
    x402Version: X402_VERSION,
    error: "payment required",
    resource: { url: `${env.publicUrl}${p.path}`, description: p.description, mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: cfg.network,
        amount: p.amount.toString(),
        asset: cfg.addresses.usdc,
        payTo: cfg.addresses.posts,
        maxTimeoutSeconds: 300,
        extra: {
          name: cfg.usdc.name,
          version: cfg.usdc.version,
          assetTransferMethod: "eip3009",
          authorizationType: "ReceiveWithAuthorization",
          binding: p.binding,
        },
      },
    ],
  };
}
