import { config } from "dotenv";
import { resolve } from "node:path";
import type { Hex } from "viem";

/** 环境文件：ENV_FILE=.env.fuji npx tsx src/run.ts；不指定则读 .env */
export const ENV_FILE = process.env.ENV_FILE ?? ".env";
config({ path: resolve(process.cwd(), ENV_FILE) });

export const SERVER_URL = (process.env.SERVER_URL ?? "http://localhost:8787").replace(/\/$/, "");
export const ACCOUNTS_PER_AGENT = Number(process.env.ACCOUNTS_PER_AGENT ?? 3);
export const AGENT_BUDGET = BigInt(Math.round(Number(process.env.AGENT_BUDGET_USDC ?? 6) * 1e6));

export function envKey(name: string): Hex | null {
  const v = process.env[name];
  return v && v.startsWith("0x") && v.length === 66 ? (v as Hex) : null;
}
