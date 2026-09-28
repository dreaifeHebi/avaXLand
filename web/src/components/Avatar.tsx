import { art } from "../lib/art";
import { avatarColor } from "../lib/format";

/** 头像：有 avatar-<账号编号> 这张图就用图，否则用名字首字母加一个按编号算出来的底色 */
export function Avatar({ id, name, size }: { id: number; name: string | null; size?: "sm" | "md" | "xl" }) {
  const img = art(`avatar-${id}`);
  return (
    <span className={`avatar ${size ?? ""}`} style={{ background: avatarColor(id) }}>
      {img ? <img src={img} alt="" /> : (name ?? "#").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function BrandMark() {
  const img = art("logo");
  return <img className="brand-mark" src={img ?? "/favicon.svg"} alt="" />;
}
