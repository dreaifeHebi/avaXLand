# 路线：从 C-Chain 搬到专属 L1

合约现在部署在 Avalanche 的 C-Chain 上（Fuji 测试网）。这份文档说明为什么下一步是专属 L1、打算怎么搬、搬之前还有什么没解决。

**这里写的都是计划，没有任何一项已经实现。** 已经实现并实测过的内容在 `README.md`、`docs/ops.md` 和 `docs/cost-table.md`。

## 为什么要搬：成本表量出来的边界

数据来自 `docs/cost-table.md`，gas 用量取自真实的 Fuji 交易。

一个点赞约用 22.5 万 gas。用户付 0.05 USDC，国库抽 10%，也就是 0.005 USDC。手续费由平台的代发账户垫付，所以平台在一个赞上的收入是 0.005 USDC，支出是这笔交易的手续费。

| C-Chain 的 gas 价格 | 一个赞的手续费 | 占点赞费的比例 | 平台在这个赞上 |
|---|---|---|---|
| 0.27 nAVAX（当天低位） | 约 0.0007 美元 | 1.3% | 赚 |
| 约 2.0 nAVAX | 约 0.005 美元 | 10% | 持平 |
| 5.28 nAVAX（当天高位） | 约 0.013 美元 | 26% | 亏 |

持平点的算法：0.005 美元 ÷（22.5 万 gas × AVAX 价格 10.94 美元）≈ 2.0 nAVAX。

C-Chain 的 gas 价格由全网的拥堵程度决定，平台控制不了。Helicon 升级（2026-09-22 在主网生效）之后，最低 gas 价格也从固定值改成了由验证者投票调整（ACP-283）。微互动的利润只有几厘钱，经不起这种波动。

## 专属 L1 能解决什么

Avalanche 的 L1 是一条有自己的验证者、自己的规则的链。和这个项目有关的能力有四项：

| 能力 | 靠什么实现 | 对这个项目的意义 |
|---|---|---|
| 手续费参数自己定 | Fee Manager 预编译（预编译是链本身内置的合约，地址 `0x0200…0003`）。创世文件里给初始值，之后由管理员地址调整 `minBaseFee` 等参数 | 一个赞的手续费变成平台自己定的常数 |
| 手续费的去向自己定 | Reward Manager 预编译 | 手续费可以回到国库。代发账户垫付的钱不流出系统 |
| gas 代币自己选 | ICTT（Avalanche 的跨链代币转移）：C-Chain 上部署 `ERC20TokenHome` 锁住 USDC，L1 上部署 `NativeTokenRemote` 按 1:1 铸出原生代币 | 垫付的手续费和收入是同一种货币，不再受 AVAX 价格影响 |
| 验证者成本固定 | ACP-77：每个验证者每月向 P-Chain 交约 1.33 AVAX，不需要质押 2000 AVAX | 基础设施成本可以预先算清 |

按这个设计估算：手续费 = gas 用量 × `minBaseFee`。原生代币是 USDC、`minBaseFee` 定在 1 gwei（十亿分之一个原生代币）时，一个赞的手续费是 22.5 万 × 0.000000001 = 0.000225 USDC，占点赞费的 0.45%，并且不随外部行情变化。这是算出来的数字，没有实测。

## 打算怎么搬

| 步骤 | 内容 | 状态 |
|---|---|---|
| 1 | 在 Fuji 上起一条 L1，创世文件里打开 Fee Manager、Reward Manager、Native Minter | 未开始 |
| 2 | C-Chain 上部署 `ERC20TokenHome`，L1 上部署 `NativeTokenRemote`，用 ICM（Avalanche 的跨链消息）连起来 | 未开始 |
| 3 | 在 L1 上提供一个支持 EIP-3009 的 USDC 合约，见下面「还没解决的问题」第 1 条 | 未开始，是最大的不确定项 |
| 4 | 部署 `AccountNFT` 与 `Posts`，服务端指向新链 | 合约和服务端不用改逻辑，原因见下 |
| 5 | 入金：用户在 C-Chain 上把 USDC 发给 `ERC20TokenHome`，跨链消息到达后在 L1 上到账 | 未开始 |

第 4 步不用改逻辑的原因：价格、阈值、USDC 的地址和签名抬头都不写死在代码里。合约是唯一来源，服务端启动时从链上读取并和 `deployments/<链>.json` 复核，客户端从 `/config` 接口拿。服务端的数据库按链分文件，并且拒绝打开属于另一份部署的数据库。

## 还没解决的问题

1. **L1 上的 USDC 不再自带 EIP-3009。** 「只签一次名、不需要 gas 币」靠的是 Circle 的 USDC 合约自带的授权转账。跨到 L1 以后是另一个合约，要自己补上这个功能。两条路：在远端的代币合约里加上 EIP-3009；或者用原生代币加一个带 EIP-3009 的包装合约。两条路都要自己维护合约，上线前需要审计。
2. **入金多了一步。** 用户的 USDC 在 C-Chain 上，要先跨到 L1。ICTT 有 `sendAndCall`，可以在一条跨链消息里完成转账并调用目标合约，有机会把「入金」和「开户」合成一步。
3. **验证者谁来跑。** 初期只能由平台自己跑。这和「每一笔互动都能在链上核对」之间有张力：链是平台的，账本有多可信取决于验证者集合有多开放。
4. **什么时候值得搬。** Avalanche 的文档建议交易量不大的应用先留在 C-Chain。按上面的成本表，触发条件是 C-Chain 的 gas 价格长期高于持平点。

## 参考

- ACP-194（C-Chain 异步执行，含最低计费规则）：https://build.avax.network/docs/acps/194-streaming-asynchronous-execution
- Helicon 升级的发布说明：https://github.com/ava-labs/avalanchego/releases/tag/v1.15.0
- Avalanche L1 概览：https://build.avax.network/docs/avalanche-l1s
- Fee Manager 预编译：https://build.avax.network/docs/avalanche-l1s/precompiles/fee-manager
- ICTT 概览：https://build.avax.network/docs/cross-chain/interchain-token-transfer/overview
- ACP-77（L1 验证者的持续费用）：https://build.avax.network/docs/acps/77-reinventing-subnets
