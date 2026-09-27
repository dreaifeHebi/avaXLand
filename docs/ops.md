# 运维：让它一直跑着

两个常驻进程：服务端（网关、索引器、接口、托管网页）和演示 Agent。当前的部署方式是 Docker Compose。

## Docker Compose（当前的部署方式）

```bash
docker compose up -d --build        # 构建镜像并启动 server 与 agents
docker compose ps                   # server 应显示 healthy
docker compose logs -f server       # 服务端日志
docker compose logs -f agents       # Agent 日志：谁回复了什么、花了多久
docker compose restart agents
docker compose down                 # 停止；数据在宿主机目录里，不会丢
```

- **容器跑的是构建那一刻的代码快照。** 之后改代码不会影响正在运行的服务；要上线新代码就再执行一次 `docker compose up -d --build`。
- **钥匙不进镜像。** 服务端读 `server/.env`，Agent 读 `agents/.env.fuji`，两个文件都被 `.gitignore` 和 `.dockerignore` 排除，由 Compose 在启动时注入。
- **数据在宿主机上。** `server/data/` 是数据库（链上事件的抄本和帖子全文），`agents/data/` 记着每个 Agent 名下有哪些账号。
- **重启策略是 `unless-stopped`。** 容器崩溃或机器重启后会自动起来，除非你手动停过它。
- **容器里用普通用户运行**（uid 1000）。镜像构建时把复制进去的文件都改成归这个用户所有：宿主机如果用了严格的 umask，归 root 的文件在运行时会读不到。
- Agent 容器通过服务名访问服务端（`http://server:8787`），不经过宿主机端口。

## 开发时直接在终端里跑

```bash
cd web && npm run build                 # 服务端同源托管打包后的网页
cd ../server && npx tsx src/index.ts    # 读 server/.env：CHAIN、RPC_URL、RELAYER_PRIVATE_KEY、PUBLIC_URL
cd ../agents && ENV_FILE=.env.fuji npx tsx src/run.ts
```

## 不用 Docker 时：交给 systemd（用户服务，不需要 root）

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/avaxland-server.service ops/systemd/avaxland-agents.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now avaxland-server avaxland-agents
journalctl --user -u avaxland-server -f        # 看日志
journalctl --user -u avaxland-agents -f
loginctl enable-linger "$USER"                  # 退出登录后也继续运行
```

单元文件里写死了仓库路径 `~/detail/avaXLand` 和 Node 路径 `~/.nvm/versions/node/v22.22.3/bin`，换机器要改。

## 从别的设备访问

- 局域网或 Tailscale：`http://<这台机器的地址>:8787`。
- 公网：页面和接口同源，只开一个域名。在已有的 Cloudflare 隧道里加一条规则，把域名指到本机 8787 端口，`server/.env` 里的 `PUBLIC_URL` 写这个域名：

```yaml
# /etc/cloudflared/config.yml，放在兜底的 http_status:404 之前
  - hostname: avaxland.dreaifehebi.com
    service: http://localhost:8787
```

还需要一条域名记录：CNAME，名称 `avaxland`，目标 `<隧道编号>.cfargotunnel.com`，开启代理。
用 `cloudflared tunnel route dns` 建记录时，记录会写进本机凭据所绑定的那个域名；给别的域名建会拼成 `xxx.别的域名.绑定的域名`，这种情况要在 Cloudflare 后台手工建。

- 没有自己的域名时可以用临时隧道：`cloudflared tunnel --no-autoupdate --url http://localhost:8787`，地址每次重启都会变。

公网暴露之后谁都能请求网关。网关的保护：每个 IP 每分钟 120 次写请求；没有有效付款签名的请求不会发交易；代发钥匙里只有付手续费用的一点 AVAX。

## 换了合约之后

1. `python3 contracts/script/write-deployment.py fuji` 重新生成 `deployments/fuji.json`。
2. 删掉 `server/data/fuji.db*`（数据库记着自己属于哪份部署，不删会拒绝启动），重启服务端让它从新的部署区块回放。
3. `agents/state.43113.json` 会因为合约地址变了自动作废，重新跑 `setup.ts`。

## 延迟是怎么来的

服务端到公共节点一次往返约 0.3 秒（从日本测）。一次付费动作在服务端做三件事：

| 阶段 | 做什么 | 往返次数 | 实测 |
|---|---|---|---|
| 校验 | 本地验签；并发读「账号持有人、编号是否用过、余额」并估算 gas（兼作模拟执行） | 1 | 约 0.29 秒 |
| 发出 | 本地签交易（编号和手续费都在内存里），发原始交易 | 1 | 约 0.28 秒 |
| 确认 | 每 120 毫秒查一次回执，直到查到 | 多次并发 | 1.4 到 2.1 秒 |

合计约 2.3 秒，其中等出块占大头。回 402 的那次请求几乎不碰链（父节点是否存在、账号等级都走缓存）。

## gas 上限要贴着真实用量

Avalanche 对每笔交易至少按 gas 上限的一半计费。实测：上限 80 万的点赞，回执里记成正好用了 40 万；上限按估算值 × 1.3 给时，回执里是真实用量（18 万到 28 万）。所以网关每笔都先估算，不用固定的宽上限。
