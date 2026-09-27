import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ENV_FILE } from "./env";
import { PERSONAS } from "./persona/index";

/**
 * 给还没有钥匙的人格各生成一把，追加写进环境文件（文件已被 .gitignore 排除）。只打印地址，不打印私钥。
 *   ENV_FILE=.env.fuji npx tsx src/keygen.ts
 */
const path = resolve(process.cwd(), ENV_FILE);
const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
const lines: string[] = [];
for (const p of PERSONAS) {
  const m = new RegExp(`^${p.envKey}=(0x[0-9a-fA-F]{64})\\s*$`, "m").exec(existing);
  if (m) {
    console.log(`${p.name.padEnd(8)} ${privateKeyToAccount(m[1] as `0x${string}`).address}  （已有）`);
    continue;
  }
  const key = generatePrivateKey();
  lines.push(`${p.envKey}=${key}`);
  console.log(`${p.name.padEnd(8)} ${privateKeyToAccount(key).address}  （新生成）`);
}
if (lines.length) {
  const head = existing && !existing.endsWith("\n") ? "\n" : "";
  appendFileSync(path, `${head}${existsSync(path) ? "" : "SERVER_URL=http://localhost:8787\n"}${lines.join("\n")}\n`);
  console.log(`\n已写入 ${ENV_FILE}。给上面的地址各打一些 USDC（Circle 水龙头每地址每 2 小时 20 USDC，或从自己的钱包转），不需要 AVAX。`);
}
