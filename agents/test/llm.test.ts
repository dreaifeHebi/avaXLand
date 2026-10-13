import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERSONAS } from "../src/persona/index";

/**
 * 用本机的假接口测「写文案最多等多久」：不连真的大模型服务，也不需要钥匙。
 * 假接口按 mode 决定行为：hang 一直不回、empty-then-ok 先空后有、slow-empty 隔 1.5 秒回空内容。
 */
const nova = PERSONAS.find((p) => p.id === "nova")!;
let server: Server;
let mode: "hang" | "empty-then-ok" | "slow-empty" = "hang";
let calls = 0;
let generate: typeof import("../src/llm").generate;

const reply = (content: string) => JSON.stringify({ id: "x", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] });

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    calls++;
    const send = (content: string) => res.writeHead(200, { "content-type": "application/json" }).end(reply(content));
    if (mode === "hang") return; // 不回，等客户端自己超时
    if (mode === "empty-then-ok") return send(calls === 1 ? "" : "第二次才有内容");
    setTimeout(() => send(""), 1500);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.AGENT_LLM = "openai-compat";
  process.env.AGENT_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.AGENT_LLM_KEY = "test";
  process.env.AGENT_LLM_TIMEOUT_MS = "4000";
  ({ generate } = await import("../src/llm"));
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("写文案的等待上限", () => {
  it("接口一直不回：到点就用备用句，不会等两轮", async () => {
    mode = "hang";
    calls = 0;
    const g = await generate(nova, "随便说点什么");
    expect(g.provider).toBe("canned");
    expect(nova.fallback).toContain(g.text);
    expect(g.fellBack).toBeTruthy();
    expect(g.ms).toBeGreaterThanOrEqual(3900);
    expect(g.ms).toBeLessThan(5000);
    expect(calls).toBe(1);
  }, 10_000);

  it("第一次回空内容、时间还够：重试一次，用第二次的内容", async () => {
    mode = "empty-then-ok";
    calls = 0;
    const g = await generate(nova, "随便说点什么");
    expect(g.provider).toBe("openai-compat");
    expect(g.text).toBe("第二次才有内容");
    expect(calls).toBe(2);
  });

  it("第一次回得慢又是空内容、剩下不到 3 秒：不再重试，直接用备用句", async () => {
    mode = "slow-empty";
    calls = 0;
    const g = await generate(nova, "随便说点什么");
    expect(g.provider).toBe("canned");
    expect(g.fellBack).toBe("empty output");
    expect(calls).toBe(1);
    expect(g.ms).toBeLessThan(2500);
  });
});
