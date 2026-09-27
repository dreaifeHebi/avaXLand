import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, viemSigner, type Client, type Signer } from "@avaxland/client";
import { usdcAbi, type ConfigDTO } from "@avaxland/protocol";
import { SERVER_URL, envKey } from "./env";
import { PERSONAS, type Persona } from "./persona/index";

export interface AgentWallet {
  persona: Persona;
  key: Hex;
  address: Address;
  signer: Signer;
}

export interface AgentState {
  chainId: number;
  posts: Address;
  personas: Record<string, { address: Address; accountIds: number[] }>;
  lastSeenId: number;
}

export async function loadConfig(): Promise<ConfigDTO> {
  const r = await fetch(`${SERVER_URL}/config`).catch(() => null);
  if (!r?.ok) throw new Error(`连不上服务端 ${SERVER_URL}（先把 server 跑起来）`);
  return (await r.json()) as ConfigDTO;
}

export function makeClient(cfg: ConfigDTO): Client {
  return createClient({ baseUrl: SERVER_URL, expect: { network: cfg.network, asset: cfg.addresses.usdc } });
}

export function wallets(): AgentWallet[] {
  const out: AgentWallet[] = [];
  for (const persona of PERSONAS) {
    const key = envKey(persona.envKey);
    if (!key) continue;
    const account = privateKeyToAccount(key);
    out.push({ persona, key, address: account.address, signer: viemSigner(account) });
  }
  return out;
}

export function rpcUrl(cfg: ConfigDTO): string {
  return process.env.RPC_URL ?? (cfg.chainId === avalancheFuji.id ? "https://api.avax-test.network/ext/bc/C/rpc" : "http://127.0.0.1:8545");
}

function chainOf(cfg: ConfigDTO) {
  return cfg.chainId === avalancheFuji.id
    ? avalancheFuji
    : defineChain({ id: cfg.chainId, name: "local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl(cfg)] } } });
}

export function publicClientFor(cfg: ConfigDTO) {
  return createPublicClient({ chain: chainOf(cfg), transport: http(rpcUrl(cfg)) });
}

export function walletClientFor(cfg: ConfigDTO, key: Hex) {
  return createWalletClient({ account: privateKeyToAccount(key), chain: chainOf(cfg), transport: http(rpcUrl(cfg)) });
}

export async function usdcBalance(cfg: ConfigDTO, address: Address): Promise<bigint> {
  return publicClientFor(cfg).readContract({ address: cfg.addresses.usdc, abi: usdcAbi, functionName: "balanceOf", args: [address] });
}

const statePath = (cfg: ConfigDTO) => resolve(process.cwd(), `state.${cfg.chainId}.json`);

export function loadState(cfg: ConfigDTO): AgentState {
  const p = statePath(cfg);
  if (existsSync(p)) {
    const s = JSON.parse(readFileSync(p, "utf8")) as AgentState;
    // 换了一份部署（合约地址变了）就从头来
    if (s.posts?.toLowerCase() === cfg.addresses.posts.toLowerCase()) return s;
  }
  return { chainId: cfg.chainId, posts: cfg.addresses.posts, personas: {}, lastSeenId: 0 };
}

export function saveState(cfg: ConfigDTO, s: AgentState) {
  writeFileSync(statePath(cfg), JSON.stringify(s, null, 2) + "\n");
}

export const usdc = (x: bigint | string) => (Number(BigInt(x)) / 1e6).toFixed(4).replace(/\.?0+$/, "");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const short = (h: string) => `${h.slice(0, 10)}…`;
