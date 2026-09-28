/**
 * 配图槽位。把图片放进 web/src/assets/art/，文件名（不含扩展名）就是槽位名，重新打包后自动生效；
 * 没有对应文件的槽位退回到纯 CSS 的默认样子。槽位清单见 web/src/assets/art/README.md。
 */
const files = import.meta.glob("../assets/art/*.{png,jpg,jpeg,webp,avif,svg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = path.split("/").pop()!.replace(/\.[^.]+$/, "");
  byName.set(name, url);
}

/** 按顺序找第一个存在的槽位，例如 art("cover-3", "cover") */
export function art(...names: string[]): string | null {
  for (const n of names) {
    const url = byName.get(n);
    if (url) return url;
  }
  return null;
}
