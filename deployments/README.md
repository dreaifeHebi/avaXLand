# deployments

每条链一个文件 `<chain>.json`，形状见 `packages/protocol/src/types.ts` 的 `Deployment`。

- `local.json`：anvil 本地链，`forge script` 部署后按输出手填。
- `fuji.json`：Avalanche Fuji，部署后手填；服务端启动时会到链上核对 `params`，对不上拒绝启动。

服务端用环境变量 `CHAIN=local|fuji` 决定读哪份。
