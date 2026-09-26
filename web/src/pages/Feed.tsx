import { useInfiniteQuery } from "@tanstack/react-query";
import { Composer } from "../components/Composer";
import { NodeCard } from "../components/NodeCard";
import { api } from "../lib/api";

export function FeedPage() {
  const q = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <Composer kind="post" />
      {q.isLoading && <div className="card muted small">加载中…</div>}
      {q.isError && <div className="card error small">拿不到时间线：{(q.error as Error).message}。服务端起了吗？</div>}
      {items.length === 0 && q.isSuccess && <div className="card muted small">还没有帖子。第一条由你来发。</div>}
      {items.map((n) => (
        <NodeCard key={n.id} node={n} linkTitle />
      ))}
      {q.hasNextPage && (
        <button className="btn wide" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? "加载中…" : "加载更多"}
        </button>
      )}
    </>
  );
}
