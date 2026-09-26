import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsMessage } from "@avaxland/protocol";
import { WS_URL } from "./api";
import { badgeText } from "./format";
import { pushFlow, pushToast, wsStore } from "./store";

/** 一条长连接：服务端每落库一条链上事件就推过来；这里把它翻译成「刷新哪些查询」与「弹什么提示」 */
export function useSocket(myAccountIds: number[]) {
  const qc = useQueryClient();
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 1000;
    const mine = new Set(myAccountIds);

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        delay = 1000;
        wsStore.set(() => ({ connected: true }));
      };
      ws.onclose = () => {
        wsStore.set(() => ({ connected: false }));
        if (!closed) setTimeout(connect, (delay = Math.min(delay * 2, 10_000)));
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (ev) => {
        let msg: WsMessage & { type: string };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "node":
            qc.invalidateQueries({ queryKey: ["feed"] });
            qc.invalidateQueries({ queryKey: ["node"] });
            qc.invalidateQueries({ queryKey: ["account", msg.node.authorId] });
            break;
          case "like":
            qc.invalidateQueries({ queryKey: ["feed"] });
            qc.invalidateQueries({ queryKey: ["node", msg.nodeId] });
            break;
          case "split":
            pushFlow(msg.split);
            qc.invalidateQueries({ queryKey: ["node", msg.split.nodeId] });
            qc.invalidateQueries({ queryKey: ["account", msg.split.toAccountId] });
            qc.invalidateQueries({ queryKey: ["leaderboard"] });
            break;
          case "badge":
            qc.invalidateQueries({ queryKey: ["account", msg.accountId] });
            pushToast(
              {
                kind: "badge",
                title: mine.has(msg.accountId) ? "你解锁了新徽章" : `#${msg.accountId} 解锁了新徽章`,
                sub: badgeText(msg.metric, msg.threshold),
              },
              mine.has(msg.accountId) ? 6000 : 3500,
            );
            break;
          case "claim":
            qc.invalidateQueries({ queryKey: ["account", msg.accountId] });
            break;
          case "account":
            qc.invalidateQueries({ queryKey: ["myAccounts"] });
            break;
        }
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, myAccountIds.join(",")]);
}
