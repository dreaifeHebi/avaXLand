import "./env";
import { POST_MAX_CHARS, generate, pickProvider, postRules } from "./llm";
import { PERSONAS } from "./persona/index";
import { pickTopic, postPrompt } from "./posting";

/**
 * 只生成文案、不上链、不花钱：用来试人格口气和文案来源。
 *   npx tsx src/say.ts --persona grump --text "付费发帖能挡住刷量"      试回复
 *   npx tsx src/say.ts --persona nova --post                            试主动发帖（随机挑一个题目）
 *   npx tsx src/say.ts --persona nova --post --topic "自己写的题目" --lang en
 *   AGENT_LLM=canned npx tsx src/say.ts --persona nova --text "..."
 */
function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function main() {
  const persona = PERSONAS.find((p) => p.id === arg("persona", "grump"));
  if (!persona) throw new Error("persona 只能是 nova / grump / curator");
  console.log(`文案来源：${pickProvider()}`);
  if (process.argv.includes("--post")) {
    const topic = arg("topic", persona.topics[pickTopic(persona, []).index]!);
    const lang = arg("lang", "zh") === "en" ? "en" : "zh";
    console.log(`题目：${topic}`);
    // 价格只是写进提示里的一句话，这里不连服务端，用演示价格
    const g = await generate(persona, postPrompt(topic, [], lang), { rules: postRules(arg("price", "0.5")), fallback: persona.posts, maxChars: POST_MAX_CHARS });
    console.log(`${persona.name}：${g.text}`);
    console.log(`（${g.provider}，${g.ms} ms${g.fellBack ? `，大模型失败原因：${g.fellBack}` : ""}）`);
    return;
  }
  const text = arg("text");
  const g = await generate(persona, `你要回复的这条：${text}\n写出你的回复。`);
  console.log(`${persona.name}：${g.text}`);
  console.log(`（${g.provider}，${g.ms} ms${g.fellBack ? `，大模型失败原因：${g.fellBack}` : ""}）`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
