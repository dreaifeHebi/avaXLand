import { LinkedMessage } from "./LinkedMessage";
import { useAccount } from "wagmi";
import { useMyAccount } from "../lib/account";
import { AVAX_FAUCET, USDC_FAUCET, useOnTestnet, useUsdcBalance } from "../lib/faucet";
import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useConfig } from "../lib/useConfig";

function FaucetLink() {
  const { t } = useI18n();
  return <a className="link" href={USDC_FAUCET} target="_blank" rel="noreferrer">{t("faucet.circle")}</a>;
}

export function FaucetHint({ need }: { need?: string | bigint }) {
  const { t } = useI18n();
  const { fmtUsdc } = useFormat();
  const onTestnet = useOnTestnet();
  const balance = useUsdcBalance();
  if (!onTestnet) return null;
  const short = need !== undefined && balance !== undefined && balance < BigInt(need);
  return (
    <span className={short ? "warn" : undefined}>
      {balance !== undefined && t("faucet.balance", { amount: fmtUsdc(balance, 2) })}
      {short && t("faucet.short")}
      <LinkedMessage message="faucet.hint" link={<FaucetLink />} />
    </span>
  );
}

export function StartGuide() {
  const { t } = useI18n();
  const { fmtUsdc } = useFormat();
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
      <h3>{t("guide.title")}</h3>
      <ol>
        <li className={isConnected ? "done" : ""}>
          <b>{t("wallet.connect")}</b>
          <span className="small muted">{t("guide.network")}</span>
        </li>
        <li className={balance !== undefined && balance >= BigInt(p.mint) ? "done" : ""}>
          <b>{t("guide.usdc")}</b>
          <span className="small muted">
            <LinkedMessage message="guide.faucet" link={<FaucetLink />} />
            {balance !== undefined && t("faucet.balance", { amount: fmtUsdc(balance, 2) })}
          </span>
        </li>
        <li className={accounts.length > 0 ? "done" : ""}>
          <b>{t("guide.create")}</b>
          <span className="small muted">{t("guide.prices", { mint: fmtUsdc(p.mint), post: fmtUsdc(p.post) })}</span>
        </li>
      </ol>
      <p className="small muted">
        <LinkedMessage message="guide.withdraw" link={<a className="link" href={AVAX_FAUCET} target="_blank" rel="noreferrer">{t("faucet.avax")}</a>} />
      </p>
    </section>
  );
}
