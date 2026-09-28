import { art } from "../lib/art";
import { avatarColor } from "../lib/format";

/** 头像：先找 avatar-<账号编号>，再找 avatar-<名字>（小写，「·」之后的序号不算），都没有就用名字首字母加一个按编号算出来的底色 */
export function Avatar({ id, name, size }: { id: number; name: string | null; size?: "sm" | "md" | "xl" }) {
  const slug = (name ?? "").split("·")[0]!.trim().toLowerCase();
  const img = art(`avatar-${id}`, ...(slug ? [`avatar-${slug}`] : []));
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
