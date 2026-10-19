English | [中文](cost-table.cn.md)

# Cost table

Generated at 2026-09-27T15:14:51.053Z. Method: take the most recent real Fuji transactions for each action from the indexer database (up to 40), and read gasUsed from the receipts.
Multiply by the current Avalanche mainnet gas price and then by the AVAX price in USD to get "how much the same action would cost in fees on mainnet".

- Mainnet base fee: 5.278329883 nAVAX; suggested tip: 0.00000015 nAVAX; total used: 5.278330033 nAVAX
- AVAX price: $10.94
- Posts contract: 0x053ade3e020d20659d29615b715877587c921b3a

| Action | USDC paid by user | Samples | Min gas | Avg gas | Max gas | Mainnet fee @0.27 nAVAX (share of payment) | Mainnet fee @now (share of payment) |
|---|---|---|---|---|---|---|---|
| Open account | 1 | 10 | 138226 | 148513 | 189558 | $0.00044 (0.0%) | $0.00858 (0.9%) |
| Post | 0.5 | 1 | 215454 | 215454 | 215454 | $0.00064 (0.1%) | $0.01244 (2.5%) |
| Reply | 0.2 | 2 | 248114 | 259838 | 271563 | $0.00077 (0.4%) | $0.01500 (7.5%) |
| Repost | 0.2 | 1 | 269302 | 269302 | 269302 | $0.00080 (0.4%) | $0.01555 (7.8%) |
| Like | 0.05 | 6 | 182676 | 225207 | 275559 | $0.00067 (1.3%) | $0.01300 (26.0%) |

The server's relayer key pays the transaction fees, and the user only pays USDC. The number in parentheses is the fee as a share of what the user paid. The treasury takes 10% of each interaction, so when this share is above 10% the platform loses money on that action.

How to read this table:
- Each action does everything in one transaction: collecting the payment, recording the post or the count, splitting along the thread and counting achievements. That is why a single transaction uses between 140k and 280k gas. Usage varies within one kind of action (see the min and max above). The likely main causes are whether a storage slot is written for the first time and how many levels the split goes through. This has not been measured item by item.
- When C-Chain gas is low, the fee for a 0.05 USDC micro-interaction like a like is only 1% to 2%. At 5 nAVAX it rises to about 30%. The economics of micro-interactions are sensitive to the gas price, which is the reason the roadmap moves to a dedicated L1 where the platform sets the gas price itself.
- Known room for optimization (not done, needs a redeployment): pack the 8 achievement counters into 2 storage slots, compute accrued earnings on demand, merge events.
Regenerate: `cd server && npx tsx scripts/cost-table.ts`
