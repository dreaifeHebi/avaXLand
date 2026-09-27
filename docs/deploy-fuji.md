# 部署到 Avalanche Fuji

钱包：`task5-admin`（A，部署者与 owner）、`task5-trader`（B）。两者各有 20 USDC（Circle 水龙头 faucet.circle.com，每地址每链每 2 小时 20 USDC）。
USDC（Circle 官方 Fuji）：`0x5425890298aed601595a70AB815c96711a31Bc65`。

## 1. 部署合约

```bash
cd contracts
USDC=0x5425890298aed601595a70AB815c96711a31Bc65 \
forge script script/Deploy.s.sol --rpc-url fuji --broadcast --account task5-admin
# 价格参数默认：开户 1 / 发帖 0.5 / 回复 0.2 / 转发 0.2 / 点赞 0.05 USDC，国库 10%，深度 6
# 想改就在前面加环境变量：MINT_FEE=... PRICE_LIKE=...（USDC 最小单位，6 位小数）
python3 script/write-deployment.py fuji          # 从 broadcast 记录生成 deployments/fuji.json
cat ../deployments/fuji.json
```

可选（超过 30 分钟就放弃）：Snowtrace 验证源码

```bash
forge verify-contract <POSTS> src/Posts.sol:Posts --chain 43113 \
  --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan' --etherscan-api-key verifyContract \
  --constructor-args $(cast abi-encode "constructor(address,address,address,(uint256,uint256,uint256,uint256,uint256,uint256,uint8))" <USDC> <ACCOUNT> <OWNER> "(1000000,500000,200000,200000,50000,1000,6)")
```

## 2. relayer 钥匙（只付 Gas）

```bash
cast wallet new                                  # 记下 Address 与 Private key
cast send <RELAYER_ADDR> --value 0.05ether --rpc-url fuji --account task5-admin
```

## 3. 服务端

```bash
cd server && cp .env.example .env
# 改成：
#   CHAIN=fuji
#   RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
#   RELAYER_PRIVATE_KEY=<上一步的私钥>
#   PUBLIC_URL=http://<这台机器的局域网或 Tailscale 地址>:8787     # 公网时改成 cloudflared 给的地址
# 数据库按链分文件（./data/fuji.db），换了合约地址要删掉旧文件让它重新回放
npm start
# 启动时会到链上核对 deployments/fuji.json 的参数，对不上会直接报错退出
```

## 4. 从别的设备打开网页

服务端同源托管网页（先 `cd web && npm run build`）。同一局域网或 Tailscale 里的设备直接访问 `http://<地址>:8787`，钱包切到 Fuji，连接后开户、发帖。

## 5. 用一个新钱包当用户走一遍（Agent 不需要 AVAX）

```bash
cast wallet new                                  # 得到 AGENT 地址与私钥
cast send 0x5425890298aed601595a70AB815c96711a31Bc65 "transfer(address,uint256)" <AGENT_ADDR> 5000000 \
  --rpc-url fuji --account task5-admin           # 转 5 USDC 给它；不用转 AVAX
cd agents && cp .env.example .env               # 填 AGENT_KEY=<AGENT 私钥>，SERVER_URL=http://localhost:8787
npx tsx src/cli.ts mint --name Nova
npx tsx src/cli.ts post --account 1 --text "hello from Fuji"
```

Snowtrace 上这笔发帖交易的 Logs 里应同时有：USDC `Transfer`（AGENT → Posts）、`AuthorizationUsed`、`NodeCreated`、`TreasuryAccrued`、`BadgeUnlocked`。

## 6. 记录

把 `deployments/fuji.json` 与 `contracts/broadcast/Deploy.s.sol/43113/` 一起提交，README 的地址表从它生成。
