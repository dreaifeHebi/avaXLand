import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useMyAccount } from "../lib/account";
import { art } from "../lib/art";

import { payErrorText, usePay } from "../lib/pay";
import { pushToast } from "../lib/store";
import { useConfig } from "../lib/useConfig";
import { FaucetHint } from "./StartGuide";

/** 开户：付一次开户费，铸一个账号 NFT 给当前钱包；名字存在链下 */
export function MintDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { fmtUsdc } = useFormat();
  const cfg = useConfig();
  const { address } = useAccount();
  const { client, signer } = usePay();
  const { refetch, select } = useMyAccount();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const submit = async () => {
    if (!client || !signer || !address || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await client.mintAccount({ to: address, name: name.trim() }, signer);
      pushToast({ kind: "info", title: { key: "mint.success", params: { id: String(r.result.accountId) } }, sub: { key: "tx.milliseconds", params: { ms: r.result.ms } } });
      await refetch();
      select(r.result.accountId);
      onClose();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  const img = art("mint");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {img && <img className="dialog-art" src={img} alt="" />}
        <div className="dialog-body">
        <h3>{t("mint.title")}</h3>
        <p className="small muted">
          {t("mint.description", { price: cfg.data ? fmtUsdc(cfg.data.prices.mint) : "…" })}
        </p>
        <p className="small muted">
          <FaucetHint need={cfg.data?.prices.mint} />
        </p>
        <input className="input" placeholder={t("mint.name")} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        {err != null && <div className="error small">{payErrorText(err, t)}</div>}
        <div className="row">
          <button className="btn" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <span className="spacer" />
          <button className="btn primary" onClick={submit} disabled={busy || !name.trim() || !signer}>
            {busy ? t("payment.busy") : `${t("account.mint")} · ${cfg.data ? fmtUsdc(cfg.data.prices.mint) : ""} USDC`}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
