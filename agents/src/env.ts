import { config } from "dotenv";
import { resolve } from "node:path";
import type { Hex } from "viem";

/** 环境文件：ENV_FILE=.env.fuji npx tsx src/run.ts；不指定则读 .env */
export const ENV_FILE = process.env.ENV_FILE ?? ".env";
config({ path: resolve(process.cwd(), ENV_FILE) });

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name] ?? fallback);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
const usdcAmount = (name: string, fallback: number) => BigInt(Math.round(num(name, fallback) * 1e6));

export const SERVER_URL = (process.env.SERVER_URL ?? "http://localhost:8787").replace(/\/$/, "");
export const ACCOUNTS_PER_AGENT = Number(process.env.ACCOUNTS_PER_AGENT ?? 3);

/** 每个 Agent 一天最多花多少 USDC，以及其中「自发」的部分最多花多少（见 budget.ts） */
export const DAILY_BUDGET = usdcAmount("AGENT_DAILY_BUDGET_USDC", 3);
export const SELF_BUDGET = usdcAmount("AGENT_SELF_BUDGET_USDC", 1.4);

/** 主动发帖的基准间隔（分钟）；0 表示不主动发帖，只对别人的内容做反应 */
export const POST_EVERY_MIN = num("POST_EVERY_MIN", 960);
/** 状态文件里还没有排期时，启动后多久发第一条（秒）；几个 Agent 依次错开 */
export const POST_FIRST_DELAY_SEC = num("POST_FIRST_DELAY_SEC", 120);
/** 主动发帖用英文写的比例，其余用中文 */
export const POST_EN_RATIO = num("POST_EN_RATIO", 0.25);

export function envKey(name: string): Hex | null {
  const v = process.env[name];
  return v && v.startsWith("0x") && v.length === 66 ? (v as Hex) : null;
}
