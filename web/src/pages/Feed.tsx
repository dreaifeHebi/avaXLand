import { useInfiniteQuery } from "@tanstack/react-query";
import { Composer } from "../components/Composer";
import { NodeCard } from "../components/NodeCard";
import { PageHead } from "../components/PageHead";
import { api } from "../lib/api";
import { art } from "../lib/art";

export function FeedPage() {
  const q = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const empty = art("empty");
  return (
    <>
      <PageHead title="时间线" />
      <Composer kind="post" />
      {q.isLoading && <div className="note small">加载中…</div>}
      {q.isError && <div className="note error small">拿不到时间线：{(q.error as Error).message}。服务端起了吗？</div>}
      {items.length === 0 && q.isSuccess && (
        <div className="empty">
          {empty && <img src={empty} alt="" />}
          <b>还没有帖子</b>
          第一条由你来发。
        </div>
      )}
      {items.map((n) => (
        <NodeCard key={n.id} node={n} />
      ))}
      {q.hasNextPage && (
        <div className="note">
          <button className="btn wide" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage ? "加载中…" : "加载更多"}
          </button>
        </div>
      )}
    </>
  );
}
