import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { postsAbi } from "@avaxland/protocol";
import { BadgeWall } from "../components/BadgeWall";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icons";
import { NodeCard } from "../components/NodeCard";
import { PageHead } from "../components/PageHead";
import { TxLink } from "../components/TxLink";
import { api } from "../lib/api";
import { art } from "../lib/art";
import { avatarColor, badgeText, fmtUsdc, shortAddr, timeAgo } from "../lib/format";
import { payErrorText } from "../lib/pay";
import { pushToast } from "../lib/store";
import { useConfig } from "../lib/useConfig";

export function AccountPage() {
  const id = Number(useParams().id);
  const cfg = useConfig();
  const qc = useQueryClient();
  const { address } = useAccount();
  const q = useQuery({ queryKey: ["account", id], queryFn: () => api.account(id), enabled: id > 0, refetchInterval: 8000 });
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<Hex | undefined>();
  const [tab, setTab] = useState<"posts" | "badges">("posts");
  const feed = useInfiniteQuery({
    queryKey: ["account", id, "nodes"],
    queryFn: ({ pageParam }) => api.accountNodes(id, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: id > 0,
  });
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      pushToast({ kind: "info", title: "已提现到钱包", sub: "USDC 已到账" });
      qc.invalidateQueries({ queryKey: ["account", id] });
    }
  }, [receipt.isSuccess, id, qc]);

  if (q.isLoading)
    return (
      <>
        <PageHead title="账号" back />
        <div className="note small">加载中…</div>
      </>
    );
  if (q.isError || !q.data)
    return (
      <>
        <PageHead title="账号" back />
        <div className="note error small">账号 #{id} 不存在。</div>
      </>
    );
  const a = q.data;
  const mine = !!address && a.owner.toLowerCase() === address.toLowerCase();
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const litCount = a.badges.toString(2).replace(/0/g, "").length;
  const cover = art(`cover-${id}`, "cover");
  const color = avatarColor(id);

  const claim = async () => {
    if (!cfg.data || !address) return;
    try {
      const h = await writeContractAsync({
        address: cfg.data.addresses.posts,
        abi: postsAbi,
        functionName: "claimAndRedeem",
        args: [BigInt(id), BigInt(a.pending), address],
      });
      setHash(h);
    } catch (e) {
      pushToast({ kind: "error", title: payErrorText(e) });
    }
  };

  return (
    <>
      <PageHead title={a.name ?? `账号 #${a.id}`} sub={`账号 #${a.id}`} back />
      <div
        className={`cover ${cover ? "has-art" : ""}`}
        style={cover ? { backgroundImage: `url(${cover})` } : { background: `linear-gradient(120deg, ${color}, #e84142 60%, #3b0a16)` }}
      />
      <div className="profile">
        <div className="profile-top">
          <Avatar id={a.id} name={a.name} size="xl" />
          {mine && <span className="pill ok">我的账号</span>}
        </div>
        <h2>
          {a.name ?? `账号 #${a.id}`}
          {litCount > 0 && (
            <span className="pill" title="已解锁的徽章数">
              🏅 {litCount}
            </span>
          )}
        </h2>
        <div className="muted">账号 #{a.id}</div>
        <div className="profile-facts">
          <span title={a.owner}>
            <Icon name="wallet" /> 持有者 <span className="mono">{shortAddr(a.owner)}</span>
          </span>
          <span>
            <Icon name="layers" /> 等级 {a.tier}
          </span>
          {a.rank.earned && (
            <span>
              <Icon name="trophy" /> 收益榜第 {a.rank.earned} 名
            </span>
          )}
        </div>
        <div className="profile-counts">
          <span>
            <b>{a.stats[4]}</b> 被赞
          </span>
          <span>
            <b>{a.stats[5]}</b> 被回复
          </span>
          <span>
            <b>{a.stats[6]}</b> 被转发
          </span>
        </div>
      </div>
      <div className="wallet-card">
        <div>
          <span className="small muted">投入（付过的费）</span>
          <b>{fmtUsdc(a.spent)}</b>
        </div>
        <div>
          <span className="small muted">累计收益</span>
          <b>{fmtUsdc(a.stats[7]!)}</b>
        </div>
        <div className="pending">
          <span className="small muted">待领 USDC</span>
          <b>{fmtUsdc(a.pending)}</b>
        </div>
        {mine && (
          <div className="claim">
            {BigInt(a.pending) > 0n ? (
              <button className="btn dark tiny" disabled={isPending || receipt.isLoading} onClick={claim}>
                {isPending ? "等待钱包…" : receipt.isLoading ? "上链中…" : "提现到钱包"}
              </button>
            ) : (
              <span className="small muted">现在没有可提的收益。</span>
            )}
            <span className="small muted">提现需要钱包直接发一笔交易，付一点 AVAX。</span>
            {hash && (
              <span className="small">
                <TxLink hash={hash} /> {receipt.isSuccess ? "✓ 已到账" : receipt.isLoading ? "确认中" : ""}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="tabs">
        <button className={`tab ${tab === "posts" ? "active" : ""}`} onClick={() => setTab("posts")}>
          发言
        </button>
        <button className={`tab ${tab === "badges" ? "active" : ""}`} onClick={() => setTab("badges")}>
          成就墙
        </button>
      </div>
      {tab === "posts" && (
        <>
          {posts.map((n) => (
            <NodeCard key={n.id} node={n} />
          ))}
          {feed.isSuccess && posts.length === 0 && <div className="empty">这个账号还没有发言。</div>}
          {feed.hasNextPage && (
            <div className="note">
              <button className="btn wide" disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                {feed.isFetchingNextPage ? "加载中…" : "加载更多"}
              </button>
            </div>
          )}
        </>
      )}
      {tab === "badges" && (
        <>
          <p className="note small">按付费动作的里程碑铸造，绑定账号、随账号 NFT 走、不单独转让；纯状态，不进奖励。</p>
          <BadgeWall bits={a.badges} />
          {a.badgeList.length > 0 && (
            <ul className="badge-log small">
              {a.badgeList
                .slice()
                .reverse()
                .map((b) => (
                  <li key={`${b.metric}-${b.tier}`}>
                    🏅 <b>{badgeText(b.metric, b.threshold)}</b>
                    <span className="muted">{timeAgo(b.created_at)}</span>
                    <span className="spacer" />
                    <TxLink hash={b.txHash} />
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
