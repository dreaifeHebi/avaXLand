English | [中文](l1-roadmap.cn.md)

# Plan: moving from C-Chain to a dedicated L1

The contracts are currently deployed on Avalanche's C-Chain (Fuji testnet). This document explains why the next step is a dedicated L1, how we plan to move, and what is still unsolved before moving.

The next stage first runs the experiment "does paid interaction rank good content higher" on C-Chain mainnet, see `docs/roadmap.md`. Moving to an L1 comes after the experiment and will be decided based on its results and gas prices.

**Everything here is a plan. None of it is implemented.** What has been implemented and measured is in `README.md`, `docs/ops.md` and `docs/cost-table.md`.

## Why move: the limit measured by the cost table

The data comes from `docs/cost-table.md`, with gas usage taken from real Fuji transactions.

A like uses about 225k gas. The user pays 0.05 USDC and the treasury takes 10%, which is 0.005 USDC. The platform's relayer account pays the transaction fee, so on one like the platform earns 0.005 USDC and spends the fee for that transaction.

| C-Chain gas price | Fee for one like | Share of the like price | Platform on this like |
|---|---|---|---|
| 0.27 nAVAX (low of the day) | about $0.0007 | 1.3% | Profit |
| about 2.0 nAVAX | about $0.005 | 10% | Break even |
| 5.28 nAVAX (high of the day) | about $0.013 | 26% | Loss |

How the break-even point is computed: $0.005 ÷ (225k gas × AVAX price $10.94) ≈ 2.0 nAVAX.

The C-Chain gas price is set by congestion across the whole network, and the platform cannot control it. Since the Helicon upgrade (live on mainnet 2026-09-22), the minimum gas price has also changed from a fixed value to one adjusted by validator vote (ACP-283). Micro-interactions earn fractions of a cent and cannot absorb this kind of swing.

## What a dedicated L1 solves

An Avalanche L1 is a chain with its own validators and its own rules. Four of its capabilities matter for this project:

| Capability | How | What it means for this project |
|---|---|---|
| Set the fee parameters ourselves | The Fee Manager precompile (a precompile is a contract built into the chain itself, at address `0x0200…0003`). The genesis file sets initial values, and an admin address can later adjust `minBaseFee` and other parameters | The fee for a like becomes a constant the platform sets |
| Decide where fees go | The Reward Manager precompile | Fees can go back to the treasury. What the relayer account pays does not leave the system |
| Choose the gas token | ICTT (Avalanche's Interchain Token Transfer): deploy `ERC20TokenHome` on C-Chain to lock USDC, and `NativeTokenRemote` on the L1 to mint the native token 1:1 | Fees paid and income are the same currency and no longer depend on the AVAX price |
| Fixed validator cost | ACP-77: each validator pays about 1.33 AVAX a month to the P-Chain, with no need to stake 2000 AVAX | Infrastructure cost can be calculated in advance |

Estimate under this design: fee = gas used × `minBaseFee`. With USDC as the native token and `minBaseFee` set to 1 gwei (one billionth of a native token), the fee for a like is 225k × 0.000000001 = 0.000225 USDC, 0.45% of the like price, and it does not change with outside market prices. This number is calculated, not measured.

## How we plan to move

| Step | Work | Status |
|---|---|---|
| 1 | Launch an L1 on Fuji with Fee Manager, Reward Manager and Native Minter enabled in the genesis file | Not started |
| 2 | Deploy `ERC20TokenHome` on C-Chain and `NativeTokenRemote` on the L1, connected with ICM (Avalanche's Interchain Messaging) | Not started |
| 3 | Provide a USDC contract with EIP-3009 on the L1, see item 1 under "Unsolved problems" below | Not started, the biggest uncertainty |
| 4 | Deploy `AccountNFT` and `Posts`, and point the server at the new chain | No logic changes needed in the contracts or server, see below |
| 5 | Deposits: the user sends USDC to `ERC20TokenHome` on C-Chain, and it arrives on the L1 once the cross-chain message lands | Not started |

Why step 4 needs no logic changes: prices, thresholds, the USDC address and its signing domain are not hard-coded. The contract is the single source. The server reads them from the chain on startup and checks them against `deployments/<chain>.json`, and clients get them from the `/config` endpoint. The server keeps one database file per chain and refuses to open a database that belongs to another deployment.

## Unsolved problems

1. **USDC on the L1 no longer comes with EIP-3009.** "Sign once, no gas token needed" relies on the authorized transfers built into Circle's USDC contract. After bridging to an L1 it is a different contract, and this feature has to be added by us. Two options: add EIP-3009 to the remote token contract, or use the native token with a wrapper contract that supports EIP-3009. Both mean maintaining our own contract, which needs an audit before launch.
2. **Deposits take one more step.** The user's USDC is on C-Chain and has to be bridged to the L1 first. ICTT has `sendAndCall`, which transfers and calls a target contract in one cross-chain message, so deposit and account opening could be combined into one step.
3. **Who runs the validators.** At first only the platform itself can. This is in tension with "every interaction can be checked on-chain": the chain belongs to the platform, and how trustworthy the ledger is depends on how open the validator set is.
4. **When moving is worth it.** Avalanche's documentation suggests that apps with modest transaction volume stay on C-Chain first. Based on the cost table above, the trigger is a C-Chain gas price that stays above the break-even point.

## References

- ACP-194 (C-Chain asynchronous execution, including the minimum billing rule): https://build.avax.network/docs/acps/194-streaming-asynchronous-execution
- Helicon upgrade release notes: https://github.com/ava-labs/avalanchego/releases/tag/v1.15.0
- Avalanche L1 overview: https://build.avax.network/docs/avalanche-l1s
- Fee Manager precompile: https://build.avax.network/docs/avalanche-l1s/precompiles/fee-manager
- ICTT overview: https://build.avax.network/docs/cross-chain/interchain-token-transfer/overview
- ACP-77 (continuous fee for L1 validators): https://build.avax.network/docs/acps/77-reinventing-subnets
