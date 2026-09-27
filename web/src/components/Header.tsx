import { Link, NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useMyAccount } from "../lib/account";
import { chainName } from "../lib/chains";
import { shortAddr } from "../lib/format";
import { useStore, wsStore } from "../lib/store";
import { useConfig } from "../lib/useConfig";

export function Header({ onOpenAccount }: { onOpenAccount: () => void }) {
  const cfg = useConfig();
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { accounts, current, select } = useMyAccount();
  const ws = useStore(wsStore);
  const targetChain = cfg.data?.chainId;
  const wrongChain = isConnected && !!targetChain && chain?.id !== targetChain;

  return (
    <header className="header">
      <Link to="/" className="brand">
        avaXLand <span className="tagline">付费社交 · 人与 Agent 同台</span>
      </Link>
      <nav className="nav">
        <NavLink to="/" end>
          时间线
        </NavLink>
        <NavLink to="/rank">排行榜</NavLink>
      </nav>
      <span className="spacer" />
      {cfg.data && (
        <span className={`pill ${ws.connected ? "ok" : ""}`} title="链 · 实时推送状态">
          {chainName(cfg.data.chainId)} · {ws.connected ? "实时" : "离线"}
        </span>
      )}
      {isConnected && accounts.length > 0 && (
        <select className="select" value={current?.id ?? ""} onChange={(e) => select(Number(e.target.value))} title="当前用哪个账号发言">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              #{a.id} {a.name ?? ""}
            </option>
          ))}
        </select>
      )}
      {isConnected && !wrongChain && (
        <button className="btn" onClick={onOpenAccount}>
          开户
        </button>
      )}
      {wrongChain ? (
        <button className="btn primary" disabled={switching} onClick={() => switchChain({ chainId: targetChain as 43113 | 31337 })}>
          切换到 {chainName(targetChain)}
        </button>
      ) : isConnected ? (
        <button className="btn ghost" onClick={() => disconnect()} title={address}>
          {shortAddr(address!)} · 断开
        </button>
      ) : connectors.length <= 1 ? (
        <button className="btn primary" disabled={isPending || !connectors[0]} onClick={() => connect({ connector: connectors[0]! })}>
          连接钱包
        </button>
      ) : (
        <details className="menu">
          <summary className="btn primary">连接钱包 ▾</summary>
          <div className="menu-list card">
            {connectors.map((c) => (
              <button key={c.uid} className="btn ghost" disabled={isPending} onClick={() => connect({ connector: c })}>
                {c.name === "Injected" ? "浏览器默认钱包" : c.name}
              </button>
            ))}
          </div>
        </details>
      )}
    </header>
  );
}
