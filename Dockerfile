# avaXLand：服务端（网关 + 索引器 + 接口 + 托管网页）与演示 Agent 共用这一个镜像
FROM node:22-bookworm-slim

# 全程用普通用户 node（uid 1000）。复制进来的文件都改成归它所有：
# 宿主机如果用了严格的 umask（文件 600、目录 700），归 root 的文件在运行时会读不到。
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
USER node

# 先只拷依赖清单，源码改动时这一层可以走缓存
COPY --chown=node:node package.json package-lock.json tsconfig.base.json ./
COPY --chown=node:node packages/protocol/package.json packages/protocol/
COPY --chown=node:node packages/client/package.json packages/client/
COPY --chown=node:node server/package.json server/
COPY --chown=node:node web/package.json web/
COPY --chown=node:node agents/package.json agents/
RUN npm ci --no-audit --no-fund

COPY --chown=node:node packages packages
COPY --chown=node:node server server
COPY --chown=node:node web web
COPY --chown=node:node agents agents
COPY --chown=node:node deployments deployments

# 打包网页；服务端同源托管 web/dist
RUN npm run build -w @avaxland/web && mkdir -p server/data agents/data

EXPOSE 8787
WORKDIR /app/server
CMD ["npx", "tsx", "src/index.ts"]
