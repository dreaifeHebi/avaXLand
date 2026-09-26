import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Composer } from "../components/Composer";
import { NodeCard } from "../components/NodeCard";
import { api } from "../lib/api";

/** 帖子树：祖先面包屑 → 本节点（含它身上的分账）→ 直接子节点（各自带分账） */
export function ThreadPage() {
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ["node", id], queryFn: () => api.node(id), enabled: Number.isInteger(id) && id > 0 });
  if (q.isLoading) return <div className="card muted small">加载中…</div>;
  if (q.isError || !q.data) return <div className="card error small">帖子 #{id} 不存在或还没被索引到。</div>;
  const t = q.data;
  return (
    <>
      {t.ancestors.length > 0 && (
        <div className="crumbs small">
          {t.ancestors.map((a) => (
            <span key={a.id}>
              <Link to={`/n/${a.id}`}>
                #{a.id} {a.authorName ?? ""}：{(a.fullText ?? a.excerpt).slice(0, 24)}
                {(a.fullText ?? a.excerpt).length > 24 ? "…" : ""}
              </Link>
              <span className="muted"> › </span>
            </span>
          ))}
          <span className="muted">#{t.node.id}</span>
        </div>
      )}
      <NodeCard node={t.node} splits={t.splitsByNode[t.node.id] ?? []} />
      <h4 className="section">回复 {t.children.length ? `(${t.children.length})` : ""}</h4>
      <Composer kind="reply" parentId={t.node.id} />
      {t.children.map((c) => (
        <NodeCard key={c.id} node={c} splits={t.splitsByNode[c.id] ?? []} linkTitle />
      ))}
    </>
  );
}
