import { useAccount } from "wagmi";
import { useMyAccount } from "../lib/account";
import { AVAX_FAUCET, USDC_FAUCET, useOnTestnet, useUsdcBalance } from "../lib/faucet";
import { fmtUsdc } from "../lib/format";
import { useConfig } from "../lib/useConfig";

function FaucetLink({ children = "Circle 水龙头" }: { children?: string }) {
  return (
    <a className="link" href={USDC_FAUCET} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** 一句话的提示，放在中间一栏：去哪领测试 USDC。只在测试网上显示 */
export function FaucetHint({ need }: { need?: string | bigint }) {
  const onTestnet = useOnTestnet();
  const balance = useUsdcBalance();
  if (!onTestnet) return null;
  const short = need !== undefined && balance !== undefined && balance < BigInt(need);
  return (
    <span className={short ? "warn" : undefined}>
      {balance !== undefined && `钱包里有 ${fmtUsdc(balance, 2)} USDC${short ? "，不够付这一笔" : ""}。`}
      测试 USDC 在 <FaucetLink /> 免费领，网络选 Avalanche Fuji。
    </span>
  );
}

/** 右栏的上手指引：还没有账号、或者余额连一条帖子都付不起时显示。只在测试网上显示 */
export function StartGuide() {
  const cfg = useConfig();
  const onTestnet = useOnTestnet();
  const { isConnected } = useAccount();
  const { accounts } = useMyAccount();
  const balance = useUsdcBalance();
  if (!onTestnet || !cfg.data) return null;
  const p = cfg.data.prices;
  const broke = balance !== undefined && balance < BigInt(p.post);
  if (accounts.length > 0 && !broke) return null;
  return (
    <section className="box guide">
      <h3>想亲手试试？</h3>
      <ol>
        <li className={isConnected ? "done" : ""}>
          <b>连接钱包</b>
          <span className="small muted">钱包切到 Avalanche Fuji 测试网。</span>
        </li>
        <li className={balance !== undefined && balance >= BigInt(p.mint) ? "done" : ""}>
          <b>领测试 USDC</b>
          <span className="small muted">
            去 <FaucetLink /> 领，网络选 Avalanche Fuji，一次 20 USDC。
            {balance !== undefined && ` 现在钱包里有 ${fmtUsdc(balance, 2)} USDC。`}
          </span>
        </li>
        <li className={accounts.length > 0 ? "done" : ""}>
          <b>开户，然后发帖</b>
          <span className="small muted">
            开户 {fmtUsdc(p.mint)} USDC，发帖 {fmtUsdc(p.post)} USDC。每次只签一个名，不需要 AVAX。
          </span>
        </li>
      </ol>
      <p className="small muted">
        只有把收益提现到钱包时要一点 AVAX 付手续费，可以在{" "}
        <a className="link" href={AVAX_FAUCET} target="_blank" rel="noreferrer">
          Avalanche 水龙头
        </a>{" "}
        领。
      </p>
    </section>
  );
}
