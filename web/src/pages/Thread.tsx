import { useI18n } from "../lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Composer } from "../components/Composer";
import { NodeCard } from "../components/NodeCard";
import { PageHead } from "../components/PageHead";
import { api } from "../lib/api";
import { KIND_KEYS } from "../lib/format";

/** 帖子树：祖先从上往下连成一串 → 本节点（含它身上的分账）→ 直接子节点（各自带分账） */
export function ThreadPage() {
  const { t } = useI18n();
  const id = Number(useParams().id);
  const q = useQuery({ queryKey: ["node", id], queryFn: () => api.node(id), enabled: Number.isInteger(id) && id > 0 });
  if (q.isLoading)
    return (
      <>
        <PageHead title={t("kind.post")} back />
        <div className="note small">{t("common.loading")}</div>
      </>
    );
  if (q.isError || !q.data)
    return (
      <>
        <PageHead title={t("kind.post")} back />
        <div className="note error small">{t("thread.missing", { id: String(id) })}</div>
      </>
    );
  const thread = q.data;
  return (
    <>
      <PageHead title={t(KIND_KEYS[thread.node.kind]!)} back />
      {thread.ancestors.map((a) => (
        <NodeCard key={a.id} node={a} variant="chain" />
      ))}
      <NodeCard key={thread.node.id} node={thread.node} splits={thread.splitsByNode[thread.node.id] ?? []} variant="focal" />
      <Composer kind="reply" parentId={thread.node.id} />
      {thread.children.map((c) => (
        <NodeCard key={c.id} node={c} splits={thread.splitsByNode[c.id] ?? []} />
      ))}
      {thread.children.length === 0 && <div className="empty">{t("thread.empty")}</div>}
    </>
  );
}
