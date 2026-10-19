import { useFormat, avatarColor, shortAddr } from "../lib/format";
import { useI18n } from "../lib/i18n";
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
import { pushToast } from "../lib/store";
import { useConfig } from "../lib/useConfig";

export function AccountPage() {
  const { t } = useI18n();
  const { fmtUsdc, timeAgo, badgeText, number } = useFormat();
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
      pushToast({ kind: "info", title: { key: "withdraw.success" }, sub: { key: "withdraw.usdcReceived" } });
      qc.invalidateQueries({ queryKey: ["account", id] });
    }
  }, [receipt.isSuccess, id, qc]);

  if (q.isLoading)
    return (
      <>
        <PageHead title={t("account.label")} back />
        <div className="note small">{t("common.loading")}</div>
      </>
    );
  if (q.isError || !q.data)
    return (
      <>
        <PageHead title={t("account.label")} back />
        <div className="note error small">{t("account.missing", { id: String(id) })}</div>
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
      pushToast({ kind: "error", error: e });
    }
  };

  return (
    <>
      <PageHead title={a.name ?? t("account.id", { id: String(a.id) })} sub={t("account.id", { id: String(a.id) })} back />
      <div
        className={`cover ${cover ? "has-art" : ""}`}
        style={cover ? { backgroundImage: `url(${cover})` } : { background: `linear-gradient(120deg, ${color}, #e84142 60%, #3b0a16)` }}
      />
      <div className="profile">
        <div className="profile-top">
          <Avatar id={a.id} name={a.name} size="xl" />
          {mine && <span className="pill ok">{t("nav.mine")}</span>}
        </div>
        <h2>
          {a.name ?? t("account.id", { id: String(a.id) })}
          {litCount > 0 && (
            <span className="pill" title={t("account.badgeCount")}>
              🏅 {number(litCount)}
            </span>
          )}
        </h2>
        <div className="muted">{t("account.id", { id: String(a.id) })}</div>
        <div className="profile-facts">
          <span title={a.owner}>
            <Icon name="wallet" /> {t("account.owner")} <span className="mono">{shortAddr(a.owner)}</span>
          </span>
          <span>
            <Icon name="layers" /> {t("account.tier", { tier: a.tier })}
          </span>
          {a.rank.earned && (
            <span>
              <Icon name="trophy" /> {t("account.rank", { rank: a.rank.earned })}
            </span>
          )}
        </div>
        <div className="profile-counts">
          <span>
            <b>{number(a.stats[4]!)}</b>{" "}{t("metric.liked", { count: Number(a.stats[4]) })}</span>
          <span>
            <b>{number(a.stats[5]!)}</b>{" "}{t("metric.replied", { count: Number(a.stats[5]) })}</span>
          <span>
            <b>{number(a.stats[6]!)}</b>{" "}{t("metric.reposted", { count: Number(a.stats[6]) })}</span>
        </div>
      </div>
      <div className="wallet-card">
        <div>
          <span className="small muted">{t("account.spent")}</span>
          <b>{fmtUsdc(a.spent)}</b>
        </div>
        <div>
          <span className="small muted">{t("account.earned")}</span>
          <b>{fmtUsdc(a.stats[7]!)}</b>
        </div>
        <div className="pending">
          <span className="small muted">{t("account.pending")}</span>
          <b>{fmtUsdc(a.pending)}</b>
        </div>
        {mine && (
          <div className="claim">
            {BigInt(a.pending) > 0n ? (
              <button className="btn dark tiny" disabled={isPending || receipt.isLoading} onClick={claim}>
                {isPending ? t("withdraw.waitWallet") : receipt.isLoading ? t("withdraw.pending") : t("withdraw.action")}
              </button>
            ) : (
              <span className="small muted">{t("withdraw.none")}</span>
            )}
            <span className="small muted">{t("withdraw.fee")}</span>
            {hash && (
              <span className="small">
                <TxLink hash={hash} /> {receipt.isSuccess ? t("withdraw.received") : receipt.isLoading ? t("withdraw.confirming") : ""}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="tabs">
        <button className={`tab ${tab === "posts" ? "active" : ""}`} onClick={() => setTab("posts")}>{t("account.posts")}</button>
        <button className={`tab ${tab === "badges" ? "active" : ""}`} onClick={() => setTab("badges")}>{t("account.badges")}</button>
      </div>
      {tab === "posts" && (
        <>
          {posts.map((n) => (
            <NodeCard key={n.id} node={n} />
          ))}
          {feed.isSuccess && posts.length === 0 && <div className="empty">{t("account.empty")}</div>}
          {feed.hasNextPage && (
            <div className="note">
              <button className="btn wide" disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                {feed.isFetchingNextPage ? t("common.loading") : t("common.more")}
              </button>
            </div>
          )}
        </>
      )}
      {tab === "badges" && (
        <>
          <p className="note small">{t("account.badgeInfo")}</p>
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
