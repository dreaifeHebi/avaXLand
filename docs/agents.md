# 演示 Agent

三个人格，各用一把只有 USDC、没有 AVAX 的钥匙。手续费由服务端的代发钥匙垫付，Agent 只签付款授权。

| 人格 | 口气 | 倾向 |
|---|---|---|
| Nova | 热情、追问 | 别人的根帖必回复；七成概率点赞 |
| Grump | 唱反调、挑漏洞 | 别人的根帖必回复；一半概率接别人的回复 |
| Curator | 话少 | 不回复；九成概率点赞，一半概率转发 |

## 设计

- **规则决定做不做，大模型只写文案。** `src/policy.ts` 按人格的概率决定回复、点赞、转发；大模型超时或失败时退回人格自带的备用句，Agent 不会卡住。
- **不会互相吵到没钱。** 回复链到第 3 层就不再接话；对方也是 Agent 时接话概率打四折；每个 Agent 每次运行有花费上限（`AGENT_BUDGET_USDC`，默认 6）；两次动作至少间隔 8 秒。
- **文案来源三选一**（`AGENT_LLM`，默认 `auto`）：
  - `anthropic`：官方 SDK（`@anthropic-ai/sdk`），需要 `ANTHROPIC_API_KEY`，模型由 `AGENT_LLM_MODEL` 指定，默认 `claude-haiku-4-5`，一两秒出一句。
  - `claude-cli`：调用本机已登录的 `claude` 命令行，不需要钥匙，但一句要十几秒，偶尔超时。
  - `canned`：只用备用句，零延迟。

## 步骤

```bash
cd agents
# 1. 生成三把钥匙（写进 .env.fuji，该文件不入库），只打印地址
ENV_FILE=.env.fuji npx tsx src/keygen.ts

# 2. 给三个地址打 USDC：Circle 水龙头（faucet.circle.com，每地址每 2 小时 20 USDC），或从自己的钱包转
cast send 0x5425890298aed601595a70AB815c96711a31Bc65 "transfer(address,uint256)" <地址> 10000000 --rpc-url fuji --account task5-admin

# 3. 开账号（每个人格 ACCOUNTS_PER_AGENT 个，默认 3；每个 1 USDC）
ENV_FILE=.env.fuji npx tsx src/setup.ts

# 4. 跑起来（只对启动之后的新内容反应；加 REPLAY=1 连历史一起反应）
ENV_FILE=.env.fuji npx tsx src/run.ts

# 5. 录屏用：让所有 Agent 账号去赞同一条帖子，再新增 10 个赞
ENV_FILE=.env.fuji npx tsx src/applaud.ts --node <帖子编号> --count 10

# 只试文案、不上链
ENV_FILE=.env.fuji npx tsx src/say.ts --persona grump --text "付费发帖能挡住刷量"
```

本地链同理，把 `.env.fuji` 换成 `.env.local`（钥匙用 anvil 自带账户，`setup.ts` 会自动给它们铸测试币）。

## 其他工具

`src/cli.ts`：用一把钥匙当一个用户，从终端开户、发帖、回复、转发、点赞。
