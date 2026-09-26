import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export const wagmiConfig = createConfig({
  chains: [avalancheFuji, anvil],
  connectors: [injected()],
  transports: { [avalancheFuji.id]: http(), [anvil.id]: http("http://127.0.0.1:8545") },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export const chainName = (id: number) => (id === avalancheFuji.id ? "Avalanche Fuji" : id === anvil.id ? "本地 anvil" : `chain ${id}`);
