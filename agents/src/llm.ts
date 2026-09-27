import Anthropic from "@anthropic-ai/sdk";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import type { Persona } from "./persona/index";

export type Provider = "anthropic" | "claude-cli" | "canned";

const MODEL = process.env.AGENT_LLM_MODEL ?? "claude-haiku-4-5";
const CLI_MODEL = process.env.AGENT_CLI_MODEL ?? "haiku";
const RULES =
  "你在一个每次发言都要付费的社交平台上发言。只输出发言正文本身：不超过 80 个字，使用原帖的语言，不加引号，不加话题标签，不提自己是 AI 或机器人，不复述原帖。";

let cliChecked: boolean | null = null;
function hasClaudeCli(): boolean {
  if (cliChecked === null) cliChecked = spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;
  return cliChecked;
}

/** auto：有 API 凭据用官方 SDK；否则本机有 claude 命令行就用它；都没有就用备用句 */
export function pickProvider(): Provider {
  const forced = process.env.AGENT_LLM;
  if (forced === "anthropic" || forced === "claude-cli" || forced === "canned") return forced;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (hasClaudeCli()) return "claude-cli";
  return "canned";
}

let client: Anthropic | null = null;

async function viaAnthropic(system: string, prompt: string, timeoutMs: number): Promise<string> {
  client ??= new Anthropic();
  const res = await client.messages.create(
    { model: MODEL, max_tokens: 300, system, messages: [{ role: "user", content: prompt }] },
    { timeout: timeoutMs, maxRetries: 0 },
  );
  if (res.stop_reason === "refusal") throw new Error("model refused");
  let text = "";
  for (const block of res.content) if (block.type === "text") text += block.text;
  return text;
}

/** 用本机已登录的 claude 命令行生成文案：不需要 API 钥匙，但每次要十秒左右 */
function viaClaudeCli(system: string, prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", "--model", CLI_MODEL, "--system-prompt", system, "--no-session-persistence", "--strict-mcp-config", "--disable-slash-commands", "--tools", ""],
      { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude cli timeout"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`claude cli exit ${code}: ${(err || out).slice(0, 160)}`));
    });
    child.stdin.end(prompt);
  });
}

function clean(text: string): string {
  let t = text.trim().replace(/\s*\n+\s*/g, " ");
  t = t.replace(/^["'「『“`]+|["'」』”`]+$/g, "").trim();
  return [...t].slice(0, 200).join("");
}

function describe(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) return "rate limited (429)";
  if (e instanceof Anthropic.AuthenticationError) return "authentication failed (401)";
  if (e instanceof Anthropic.APIConnectionError) return "connection error";
  if (e instanceof Anthropic.APIError) return `api error ${e.status}`;
  return (e as Error)?.message ?? String(e);
}

export interface Generated {
  text: string;
  provider: Provider;
  ms: number;
  /** 大模型失败后退回备用句时，记录失败原因 */
  fellBack?: string;
}

export function canned(persona: Persona): string {
  return persona.fallback[Math.floor(Math.random() * persona.fallback.length)]!;
}

/** 生成一条发言。任何失败都退回人格自带的备用句，保证 Agent 不会卡住。 */
export async function generate(persona: Persona, prompt: string): Promise<Generated> {
  const provider = pickProvider();
  const t0 = Date.now();
  if (provider === "canned") return { text: canned(persona), provider, ms: 0 };
  const system = `${persona.system}\n${RULES}`;
  try {
    const raw = provider === "anthropic" ? await viaAnthropic(system, prompt, 8_000) : await viaClaudeCli(system, prompt, 40_000);
    const text = clean(raw);
    if (!text) throw new Error("empty output");
    return { text, provider, ms: Date.now() - t0 };
  } catch (e) {
    return { text: canned(persona), provider: "canned", ms: Date.now() - t0, fellBack: describe(e) };
  }
}
