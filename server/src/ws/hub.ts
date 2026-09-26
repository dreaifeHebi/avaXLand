import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { WsMessage } from "@avaxland/protocol";

/** 极简推送：所有连上 /ws 的客户端收到同样的消息。只有索引器会调用 publish。 */
export interface Hub {
  publish(msg: WsMessage): void;
  size(): number;
}

export function createHub(server: Server): Hub {
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "hello", at: Date.now() }));
    ws.on("error", () => ws.close());
  });
  const ping = setInterval(() => {
    for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.ping();
  }, 25_000);
  wss.on("close", () => clearInterval(ping));
  return {
    publish(msg) {
      const data = JSON.stringify(msg);
      for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
    },
    size: () => wss.clients.size,
  };
}
