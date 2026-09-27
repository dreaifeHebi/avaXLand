import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Hex } from "viem";
import { Kind } from "@avaxland/protocol";
import { useMyAccount } from "./account";
import { usePay, payErrorText } from "./pay";
import { pushToast } from "./store";

export interface LastTx {
  txHash: Hex;
  /** 服务端从收到签名到链上确认的毫秒数 */
  ms: number;
  confirmMs?: number;
  label: string;
}

/** 四个付费动作，每个都是：请求 → 402 → 钱包签名 → 重发 → 链上确认。成功后延时刷新，等索引器追上。 */
export function useActions() {
  const { client, signer, ready } = usePay();
  const { current } = useMyAccount();
  const qc = useQueryClient();
  const [lastTx, setLastTx] = useState<LastTx | null>(null);

  const refresh = () => {
    const keys = [["feed"], ["node"], ["account"], ["leaderboard"], ["flows"]];
    keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    setTimeout(() => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })), 1500);
  };

  const guard = () => {
    if (!client || !signer) throw new Error("先连接钱包");
    if (!current) throw new Error("先开一个账号");
    return { client, signer, accountId: current.id };
  };

  const onError = (e: unknown) => pushToast({ kind: "error", title: payErrorText(e) }, 5000);

  const post = useMutation({
    mutationFn: async (content: string) => {
      const { client, signer, accountId } = guard();
      return client.createNode({ accountId, parentId: 0, kind: Kind.Post, content }, signer);
    },
    onSuccess: (r) => {
      setLastTx({ txHash: r.result.txHash, ms: r.result.ms, confirmMs: r.result.timing?.confirmMs, label: `帖子 #${r.result.nodeId}` });
      refresh();
    },
    onError,
  });

  const reply = useMutation({
    mutationFn: async (p: { parentId: number; content: string }) => {
      const { client, signer, accountId } = guard();
      return client.createNode({ accountId, parentId: p.parentId, kind: Kind.Reply, content: p.content }, signer);
    },
    onSuccess: (r) => {
      setLastTx({ txHash: r.result.txHash, ms: r.result.ms, confirmMs: r.result.timing?.confirmMs, label: `回复 #${r.result.nodeId}` });
      refresh();
    },
    onError,
  });

  const repost = useMutation({
    mutationFn: async (parentId: number) => {
      const { client, signer, accountId } = guard();
      return client.createNode({ accountId, parentId, kind: Kind.Repost, content: "" }, signer);
    },
    onSuccess: (r) => {
      setLastTx({ txHash: r.result.txHash, ms: r.result.ms, confirmMs: r.result.timing?.confirmMs, label: `转发 #${r.result.nodeId}` });
      pushToast({ kind: "info", title: "已转发", sub: `签名后 ${r.result.ms} ms 上链` });
      refresh();
    },
    onError,
  });

  const like = useMutation({
    mutationFn: async (nodeId: number) => {
      const { client, signer, accountId } = guard();
      return client.likeNode({ accountId, nodeId }, signer);
    },
    onSuccess: (r, nodeId) => {
      setLastTx({ txHash: r.result.txHash, ms: r.result.ms, confirmMs: r.result.timing?.confirmMs, label: `点赞 #${nodeId}` });
      pushToast({ kind: "info", title: `已点赞 #${nodeId}`, sub: `签名后 ${r.result.ms} ms 上链` });
      refresh();
    },
    onError,
  });

  return { ready: ready && !!current, post, reply, repost, like, lastTx };
}
