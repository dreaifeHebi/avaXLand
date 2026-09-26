import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { postsAbi } from "@avaxland/protocol";
import { BadgeWall } from "../components/BadgeWall";
import { Avatar } from "../components/NodeCard";
import { TxLink } from "../components/TxLink";
import { api } from "../lib/api";
import { badgeText, fmtUsdc, shortAddr, timeAgo } from "../lib/format";
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
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      pushToast({ kind: "info", title: "已提现到钱包", sub: "USDC 已到账" });
      qc.invalidateQueries({ queryKey: ["account", id] });
    }
  }, [receipt.isSuccess, id, qc]);

  if (q.isLoading) return <div className="card muted small">加载中…</div>;
  if (q.isError || !q.data) return <div className="card error small">账号 #{id} 不存在。</div>;
  const a = q.data;
  const mine = !!address && a.owner.toLowerCase() === address.toLowerCase();
  const received = Number(a.stats[4]) + Number(a.stats[5]) + Number(a.stats[6]);

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
      <div className="card profile">
        <Avatar id={a.id} name={a.name} />
        <div>
          <h2>
            {a.name ?? `账号 #${a.id}`} <span className="muted small">#{a.id}</span>
            {mine && <span className="pill small ok">我的账号</span>}
          </h2>
          <div className="small muted" title={a.owner}>
            持有者 {shortAddr(a.owner)} · 等级 {a.tier}
          </div>
        </div>
      </div>
      <div className="tiles">
        <div className="tile">
          <span className="small muted">投入（付过的费）</span>
          <b>{fmtUsdc(a.spent)} USDC</b>
        </div>
        <div className="tile">
          <span className="small muted">被互动（赞 / 回复 / 转发）</span>
          <b>
            {received} <span className="small muted">= {a.stats[4]} / {a.stats[5]} / {a.stats[6]}</span>
          </b>
        </div>
        <div className="tile">
          <span className="small muted">累计收益（传播树分回来的）</span>
          <b>{fmtUsdc(a.stats[7]!)} USDC</b>
        </div>
        <div className="tile highlight">
          <span className="small muted">待领</span>
          <b>{fmtUsdc(a.pending)} USDC</b>
          {mine && BigInt(a.pending) > 0n && (
            <button className="btn primary tiny" disabled={isPending || receipt.isLoading} onClick={claim}>
              {isPending ? "等待钱包…" : receipt.isLoading ? "上链中…" : "提现到钱包"}
            </button>
          )}
          {hash && (
            <div className="small">
              <TxLink hash={hash} /> {receipt.isSuccess ? "✓ 已到账" : receipt.isLoading ? "确认中" : ""}
            </div>
          )}
          {mine && BigInt(a.pending) === 0n && <span className="small muted">（提现需要钱包直接发一笔交易，付一点 AVAX）</span>}
        </div>
      </div>
      <div className="card">
        <h4>成就墙</h4>
        <p className="small muted">按付费动作的里程碑铸造，绑定账号、随 NFT 走、不单独转让；纯状态，不进奖励。</p>
        <BadgeWall bits={a.badges} />
        {a.badgeList.length > 0 && (
          <ul className="badge-log small">
            {a.badgeList
              .slice()
              .reverse()
              .map((b) => (
                <li key={`${b.metric}-${b.tier}`}>
                  🏅 {badgeText(b.metric, b.threshold)} · {timeAgo(b.created_at)} · <TxLink hash={b.txHash} />
                </li>
              ))}
          </ul>
        )}
      </div>
      <div className="small muted">
        <Link to="/">← 回时间线</Link>
      </div>
    </>
  );
}
