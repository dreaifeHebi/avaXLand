#!/usr/bin/env python3
"""把 forge script 的广播记录整理成 deployments/<name>.json。

用法：python3 contracts/script/write-deployment.py local
      python3 contracts/script/write-deployment.py fuji
读取 contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json：合约地址、部署区块、Posts 的构造参数。
"""
import datetime
import json
import pathlib
import sys

CHAINS = {"local": 31337, "fuji": 43113}
name = sys.argv[1]
chain_id = CHAINS.get(name) or int(sys.argv[2])
root = pathlib.Path(__file__).resolve().parents[2]
run = json.loads((root / "contracts/broadcast/Deploy.s.sol" / str(chain_id) / "run-latest.json").read_text())

addrs, params, usdc_arg = {}, None, None
for tx in run["transactions"]:
    if tx.get("transactionType") != "CREATE":
        continue
    addrs[tx["contractName"]] = tx["contractAddress"]
    if tx["contractName"] == "Posts":
        args = tx.get("arguments") or []
        usdc_arg = args[0]
        tup = [x.strip() for x in args[3].strip("()").split(",")]
        keys = ["mintFee", "post", "reply", "repost", "like", "treasuryBps", "maxDepth"]
        params = {k: (int(v) if k in ("treasuryBps", "maxDepth") else v) for k, v in zip(keys, tup)}

receipts = run.get("receipts", [])
to_int = lambda x: int(x, 16) if isinstance(x, str) else int(x)
blocks = [to_int(r["blockNumber"]) for r in receipts]
posts_tx = next((r["transactionHash"] for r in receipts if (r.get("contractAddress") or "").lower() == addrs["Posts"].lower()), None)

out = {
    "chainId": chain_id,
    "network": f"eip155:{chain_id}",
    "usdc": addrs.get("MockUSDC") or usdc_arg,
    "account": addrs["AccountNFT"],
    "posts": addrs["Posts"],
    "voucher": None,
    "deployBlock": min(blocks) if blocks else 0,
    "deployTx": posts_tx,
    "deployedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    "params": params,
}
path = root / "deployments" / f"{name}.json"
path.write_text(json.dumps(out, indent=2) + "\n")
print(f"wrote {path}")
print(json.dumps(out, indent=2))
