import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { postsAbi, usdcAbi, networkFromChainId, type ConfigDTO, type Deployment } from "@avaxland/protocol";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../..");

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}（看 server/.env.example）`);
  return v;
}

export const env = {
  chain: process.env.CHAIN ?? "local",
  rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8545",
  relayerKey: required("RELAYER_PRIVATE_KEY") as Hex,
  dbPath: resolve(process.cwd(), process.env.DB_PATH ?? `./data/${process.env.CHAIN ?? "local"}.db`),
  port: Number(process.env.PORT ?? 8787),
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 1000),
  webDist: resolve(here, "../../web/dist"),
};

export const deployment: Deployment = JSON.parse(
  readFileSync(resolve(repoRoot, "deployments", `${env.chain}.json`), "utf8"),
);

const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [env.rpcUrl] } },
});

export const chain: Chain =
  deployment.chainId === avalancheFuji.id
    ? avalancheFuji
    : deployment.chainId === 31337
      ? anvil
      : defineChain({ ...anvil, id: deployment.chainId, name: `chain-${deployment.chainId}` });

export const explorer = deployment.chainId === avalancheFuji.id ? "https://testnet.snowtrace.io" : "";

export const publicClient = createPublicClient({ chain, transport: http(env.rpcUrl) });
export const relayer = privateKeyToAccount(env.relayerKey);
export const walletClient = createWalletClient({ account: relayer, chain, transport: http(env.rpcUrl) });

let configDto: ConfigDTO | null = null;

/** 启动时从链上读常量，并与 deployments/<chain>.json 里的参数复核；对不上就拒绝启动。 */
export async function loadChainConfig(): Promise<ConfigDTO> {
  const posts = deployment.posts;
  const rc = <const F extends string>(functionName: F, args: readonly unknown[] = []) =>
    publicClient.readContract({ address: posts, abi: postsAbi, functionName, args } as never) as Promise<unknown>;
  const [mintFee, pricePost, priceReply, priceRepost, priceLike, treasuryBps, maxDepth, thCount, thEarned, excerptMax] =
    (await Promise.all([
      rc("mintFee"),
      rc("pricePost"),
      rc("priceReply"),
      rc("priceRepost"),
      rc("priceLike"),
      rc("treasuryBps"),
      rc("maxDepth"),
      rc("thresholds", [0]),
      rc("thresholds", [7]),
      rc("maxExcerptBytes", [0]),
    ])) as [bigint, bigint, bigint, bigint, bigint, bigint, number, readonly bigint[], readonly bigint[], bigint];
  const usdc = deployment.usdc;
  const [name, version, decimals] = await Promise.all([
    publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "name" }),
    publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "version" }),
    publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "decimals" }),
  ]);
  const p = deployment.params;
  const mismatches: string[] = [];
  const check = (label: string, onChain: bigint | number, file: string | number) => {
    if (String(onChain) !== String(file)) mismatches.push(`${label}: 链上 ${onChain} / 文件 ${file}`);
  };
  check("mintFee", mintFee, p.mintFee);
  check("post", pricePost, p.post);
  check("reply", priceReply, p.reply);
  check("repost", priceRepost, p.repost);
  check("like", priceLike, p.like);
  check("treasuryBps", treasuryBps, p.treasuryBps);
  check("maxDepth", maxDepth, p.maxDepth);
  if (mismatches.length) throw new Error(`deployments/${env.chain}.json 与链上参数不一致：\n${mismatches.join("\n")}`);

  configDto = {
    chainId: deployment.chainId,
    network: networkFromChainId(deployment.chainId),
    addresses: { usdc, account: deployment.account, posts, voucher: deployment.voucher },
    deployBlock: deployment.deployBlock,
    prices: {
      mint: mintFee.toString(),
      post: pricePost.toString(),
      reply: priceReply.toString(),
      repost: priceRepost.toString(),
      like: priceLike.toString(),
    },
    treasuryBps: Number(treasuryBps),
    maxDepth: Number(maxDepth),
    usdc: { name, version, decimals: Number(decimals) },
    thresholds: { count: thCount.map(String), earned: thEarned.map(String) },
    excerptMaxBytes: Number(excerptMax),
    explorer,
  };
  return configDto;
}

export function getConfig(): ConfigDTO {
  if (!configDto) throw new Error("config not loaded");
  return configDto;
}
