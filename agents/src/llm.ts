import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import type { Persona } from "./persona/index";

export type Provider = "openai-compat" | "anthropic" | "claude-cli" | "canned";

// OpenAI 接口格式的服务（DeepSeek 等）：AGENT_BASE_URL + AGENT_MODEL + 钥匙
const OAI_BASE = process.env.AGENT_BASE_URL;
const OAI_MODEL = process.env.AGENT_MODEL ?? "deepseek-chat";
/** 接口钥匙放在 AGENT_LLM_KEY，或者 AGENT_KEY（只要它不是 0x 开头的签名私钥） */
function oaiKey(): string | undefined {
  const k = process.env.AGENT_LLM_KEY ?? process.env.AGENT_KEY;
  return k && !k.startsWith("0x") ? k : undefined;
}

const MODEL = process.env.AGENT_LLM_MODEL ?? "claude-haiku-4-5";
const CLI_MODEL = process.env.AGENT_CLI_MODEL ?? "haiku";
const REPLY_RULES =
  "你在一个每次发言都要付费的社交平台上发言。只输出发言正文本身：不超过 80 个字，使用原帖的语言，不加引号，不加话题标签，不提自己是 AI 或机器人，不复述原帖。";

/** 主动发帖用的规则。price 是发一条帖子的价格，从服务端的配置里来 */
export const postRules = (price: string) =>
  `你在一个每次发言都要付费的社交平台上发一条新帖子，发一条要花 ${price} USDC，所以只说值得说的话。` +
  "只输出帖子正文本身：中文不超过 100 个字，英文不超过 40 个词；只谈看法和问题，不编造数据、新闻和经历，不给投资建议，不加引号，不加话题标签，不加表情符号，不提自己是 AI 或机器人。";

/** 帖子比回复长一点，截断的上限也放宽 */
export const POST_MAX_CHARS = 280;

let cliChecked: boolean | null = null;
function hasClaudeCli(): boolean {
  if (cliChecked === null) cliChecked = spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;
  return cliChecked;
}

/** auto：配了 OpenAI 格式接口就用它；否则有 Anthropic 凭据用官方 SDK；否则本机有 claude 命令行就用它；都没有就用备用句 */
export function pickProvider(): Provider {
  const forced = process.env.AGENT_LLM;
  if (forced === "openai-compat" || forced === "anthropic" || forced === "claude-cli" || forced === "canned") return forced;
  if (OAI_BASE && oaiKey()) return "openai-compat";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (hasClaudeCli()) return "claude-cli";
  return "canned";
}

let oai: OpenAI | null = null;

async function viaOpenAICompat(system: string, prompt: string, timeoutMs: number): Promise<string> {
  const apiKey = oaiKey();
  if (!OAI_BASE || !apiKey) throw new Error("AGENT_BASE_URL 或接口钥匙未设置");
  oai ??= new OpenAI({ apiKey, baseURL: OAI_BASE });
  const res = await oai.chat.completions.create(
    {
      model: OAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      // 带推理的模型（如 deepseek-flash）推理用掉的字数也算在这个上限里，给足余量
      max_tokens: Number(process.env.AGENT_MAX_TOKENS ?? 2000),
      temperature: 0.9,
    },
    { timeout: timeoutMs, maxRetries: 0 },
  );
  return res.choices[0]?.message?.content ?? "";
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

function clean(text: string, maxChars: number): string {
  let t = text.trim().replace(/\s*\n+\s*/g, " ");
  t = t.replace(/^["'「『“`]+|["'」』”`]+$/g, "").trim();
  return [...t].slice(0, maxChars).join("");
}

function describe(e: unknown): string {
  if (e instanceof OpenAI.APIError) return `api error ${e.status ?? ""} ${e.message}`.trim().slice(0, 160);
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

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)]!;

/**
 * 生成一条发言。任何失败都退回备用句，保证 Agent 不会卡住。
 * 默认写的是回复；主动发帖时传 rules（postRules）和 fallback（人格的备用帖子）。
 */
export async function generate(
  persona: Persona,
  prompt: string,
  opts: { rules?: string; fallback?: string[]; maxChars?: number } = {},
): Promise<Generated> {
  const provider = pickProvider();
  const t0 = Date.now();
  const canned = () => pick(opts.fallback ?? persona.fallback);
  const tidy = (t: string) => clean(t, opts.maxChars ?? 200);
  if (provider === "canned") return { text: canned(), provider, ms: 0 };
  const system = `${persona.system}\n${opts.rules ?? REPLY_RULES}`;
  const once = () =>
    provider === "openai-compat"
      ? viaOpenAICompat(system, prompt, 15_000)
      : provider === "anthropic"
        ? viaAnthropic(system, prompt, 8_000)
        : viaClaudeCli(system, prompt, 40_000);
  try {
    let text = tidy(await once());
    if (!text && provider !== "claude-cli") text = tidy(await once()); // 空内容再试一次
    if (!text) throw new Error("empty output");
    return { text, provider, ms: Date.now() - t0 };
  } catch (e) {
    return { text: canned(), provider: "canned", ms: Date.now() - t0, fellBack: describe(e) };
  }
}
