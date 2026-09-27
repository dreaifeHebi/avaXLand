import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { formatEther } from "viem";
import { HEADERS } from "@avaxland/protocol";
import { createApi } from "./api/routes";
import { deployment, env, loadChainConfig, publicClient, relayer } from "./config";
import { openDb } from "./db/index";
import { makeQueries } from "./db/queries";
import { createGateway } from "./gateway/routes";
import { startIndexer } from "./indexer/index";
import { createHub } from "./ws/hub";

async function main() {
  const cfg = await loadChainConfig();
  const db = openDb(env.dbPath, `${deployment.chainId}:${deployment.posts.toLowerCase()}`);
  const q = makeQueries(db);

  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: (o) => o || "*",
      exposeHeaders: [HEADERS.required, HEADERS.response],
      allowHeaders: ["content-type", HEADERS.signature],
    }),
  );
  app.get("/health", (c) => c.json({ ok: true, chain: env.chain, relayer: relayer.address }));
  app.route("/", createApi(q));
  app.route("/", createGateway(q));

  // 生产：同源托管打包好的网页（web/dist），单页应用的其它路径回 index.html
  if (existsSync(env.webDist)) {
    const root = relative(process.cwd(), env.webDist) || ".";
    app.use("/*", serveStatic({ root }));
    app.get("*", serveStatic({ root, path: "index.html" }));
  }

  const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`[server] http://localhost:${info.port} · chain ${env.chain} (${cfg.network}) · posts ${deployment.posts}`);
  });
  const hub = createHub(server as never);
  startIndexer({ db, q, client: publicClient, deployment, hub, pollIntervalMs: env.pollIntervalMs });

  const bal = await publicClient.getBalance({ address: relayer.address });
  console.log(`[relayer] ${relayer.address} balance ${formatEther(bal)} (只付 Gas)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
