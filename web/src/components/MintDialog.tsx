import { useState } from "react";
import { useAccount } from "wagmi";
import { useMyAccount } from "../lib/account";
import { fmtUsdc } from "../lib/format";
import { payErrorText, usePay } from "../lib/pay";
import { pushToast } from "../lib/store";
import { useConfig } from "../lib/useConfig";

/** 开户：付一次开户费，铸一个账号 NFT 给当前钱包；名字存在链下 */
export function MintDialog({ onClose }: { onClose: () => void }) {
  const cfg = useConfig();
  const { address } = useAccount();
  const { client, signer } = usePay();
  const { refetch, select } = useMyAccount();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!client || !signer || !address || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await client.mintAccount({ to: address, name: name.trim() }, signer);
      pushToast({ kind: "info", title: `账号 #${r.result.accountId} 开好了`, sub: `签名后 ${r.result.ms} ms 上链` });
      await refetch();
      select(r.result.accountId);
      onClose();
    } catch (e) {
      setErr(payErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog card" onClick={(e) => e.stopPropagation()}>
        <h3>开一个账号</h3>
        <p className="small muted">
          账号是一个可转让的 NFT。开户费 {cfg.data ? fmtUsdc(cfg.data.prices.mint) : "…"} USDC 进国库，一次签名，不需要 AVAX。一个钱包可以开多个账号。
        </p>
        <input className="input" placeholder="名字（1–40 字）" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        {err && <div className="error small">{err}</div>}
        <div className="row">
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={submit} disabled={busy || !name.trim() || !signer}>
            {busy ? "等待签名 / 上链中…" : `开户 · ${cfg.data ? fmtUsdc(cfg.data.prices.mint) : ""} USDC`}
          </button>
        </div>
      </div>
    </div>
  );
}
