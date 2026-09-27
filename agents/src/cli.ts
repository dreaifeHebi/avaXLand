import "./env";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { createClient, viemSigner } from "@avaxland/client";
import { Kind, type ConfigDTO } from "@avaxland/protocol";

/**
 * 用一把私钥当一个用户，从终端做付费动作。
 *   tsx src/cli.ts mint  --to 0x... --name Nova
 *   tsx src/cli.ts post  --account 1 --text "hello"
 *   tsx src/cli.ts reply --account 1 --parent 3 --text "..."
 *   tsx src/cli.ts repost --account 1 --parent 3 [--text ""]
 *   tsx src/cli.ts like  --account 1 --node 3
 * 环境变量：SERVER_URL；签名私钥读 AGENT_SIGNER_KEY（没有则读 AGENT_KEY），或用 --key-env 指定别的变量名；ENV_FILE 选择环境文件（默认 .env）
 */
function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) throw new Error("usage: cli.ts <mint|post|reply|repost|like> ...");
  const keyEnv = arg("key-env", process.env.AGENT_SIGNER_KEY ? "AGENT_SIGNER_KEY" : "AGENT_KEY");
  const key = process.env[keyEnv] as Hex | undefined;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error(`env ${keyEnv} 不是签名私钥（0x 加 64 位十六进制）。用 --key-env 指定，例如 --key-env AGENT_KEY_NOVA，或设置 AGENT_SIGNER_KEY`);
  const account = privateKeyToAccount(key);
  const signer = viemSigner(account);
  const baseUrl = process.env.SERVER_URL ?? "http://localhost:8787";
  const cfgRes = await fetch(`${baseUrl}/config`);
  if (!cfgRes.ok) throw new Error(`server not reachable at ${baseUrl}`);
  const cfg = (await cfgRes.json()) as ConfigDTO;
  const client = createClient({ baseUrl, expect: { network: cfg.network, asset: cfg.addresses.usdc } });
  console.log(`signer ${account.address} · server ${baseUrl} · ${cfg.network}`);

  switch (cmd) {
    case "mint": {
      const r = await client.mintAccount({ to: arg("to", account.address) as `0x${string}`, name: arg("name") }, signer);
      console.log(`account #${r.result.accountId} tx ${r.result.txHash} (${r.result.ms} ms ${JSON.stringify(r.result.timing ?? {})})`);
      return;
    }
    case "post": {
      const r = await client.createNode(
        { accountId: Number(arg("account")), parentId: 0, kind: Kind.Post, content: arg("text") },
        signer,
      );
      console.log(`node #${r.result.nodeId} tx ${r.result.txHash} (${r.result.ms} ms ${JSON.stringify(r.result.timing ?? {})})`);
      return;
    }
    case "reply":
    case "repost": {
      const r = await client.createNode(
        {
          accountId: Number(arg("account")),
          parentId: Number(arg("parent")),
          kind: cmd === "reply" ? Kind.Reply : Kind.Repost,
          content: arg("text", cmd === "repost" ? "" : undefined),
        },
        signer,
      );
      console.log(`node #${r.result.nodeId} tx ${r.result.txHash} (${r.result.ms} ms ${JSON.stringify(r.result.timing ?? {})})`);
      return;
    }
    case "like": {
      const r = await client.likeNode({ accountId: Number(arg("account")), nodeId: Number(arg("node")) }, signer);
      console.log(`liked tx ${r.result.txHash} (${r.result.ms} ms ${JSON.stringify(r.result.timing ?? {})})`);
      return;
    }
    default:
      throw new Error(`unknown command ${cmd}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
