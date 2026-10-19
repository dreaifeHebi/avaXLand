import type { Translate } from "./i18n";
import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const localRpc = import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [localRpc] } },
});

export const wagmiConfig = createConfig({
  chains: [avalancheFuji, anvil],
  connectors: [injected()],
  transports: { [avalancheFuji.id]: http(), [anvil.id]: http(localRpc) },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export const chainName = (id: number, t: Translate) => (id === avalancheFuji.id ? "Avalanche Fuji" : id === anvil.id ? t("network.local") : t("network.chain", { id: String(id) }));
