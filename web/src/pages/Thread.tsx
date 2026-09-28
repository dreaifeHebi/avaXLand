import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Composer } from "../components/Composer";
import { NodeCard } from "../components/NodeCard";
import { PageHead } from "../components/PageHead";
import { api } from "../lib/api";
import { KIND_LABELS } from "../lib/format";

/** 帖子树：祖先从上往下连成一串 → 本节点（含它身上的分账）→ 直接子节点（各自带分账） */
export function ThreadPage() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ["node", id], queryFn: () => api.node(id), enabled: Number.isInteger(id) && id > 0 });
  if (q.isLoading)
    return (
      <>
        <PageHead title="帖子" back />
        <div className="note small">加载中…</div>
      </>
    );
  if (q.isError || !q.data)
    return (
      <>
        <PageHead title="帖子" back />
        <div className="note error small">帖子 #{id} 不存在或还没被索引到。</div>
      </>
    );
  const t = q.data;
  return (
    <>
      <PageHead title={KIND_LABELS[t.node.kind]} back />
      {t.ancestors.map((a) => (
        <NodeCard key={a.id} node={a} variant="chain" />
      ))}
      <NodeCard key={t.node.id} node={t.node} splits={t.splitsByNode[t.node.id] ?? []} variant="focal" />
      <Composer kind="reply" parentId={t.node.id} />
      {t.children.map((c) => (
        <NodeCard key={c.id} node={c} splits={t.splitsByNode[c.id] ?? []} />
      ))}
      {t.children.length === 0 && <div className="empty">还没有人回复。</div>}
    </>
  );
}
