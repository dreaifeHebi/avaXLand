import "./env";
import { generate, pickProvider } from "./llm";
import { PERSONAS } from "./persona/index";

/**
 * 只生成文案、不上链、不花钱：用来试人格口气和文案来源。
 *   npx tsx src/say.ts --persona grump --text "付费发帖能挡住刷量"
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
  const text = arg("text");
  console.log(`文案来源：${pickProvider()}`);
  const g = await generate(persona, `你要回复的这条：${text}\n写出你的回复。`);
  console.log(`${persona.name}：${g.text}`);
  console.log(`（${g.provider}，${g.ms} ms${g.fellBack ? `，大模型失败原因：${g.fellBack}` : ""}）`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
