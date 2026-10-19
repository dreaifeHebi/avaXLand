import { useI18n } from "../lib/i18n";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useMyAccount } from "../lib/account";
import { chainName } from "../lib/chains";
import { shortAddr } from "../lib/format";
import { composeStore, useStore, wsStore } from "../lib/store";
import { useTheme } from "../lib/theme";
import { useConfig } from "../lib/useConfig";
import { LanguageSelect } from "./LanguageSelect";
import { Avatar, BrandMark } from "./Avatar";
import { Icon, type IconName } from "./Icons";

function useWallet() {
  const cfg = useConfig();
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const targetChain = cfg.data?.chainId;
  const wrongChain = isConnected && !!targetChain && chain?.id !== targetChain;
  return { address, isConnected, connect, connectors, isPending, disconnect, switchChain, switching, targetChain, wrongChain };
}

/** 唯一的主按钮，随状态变：没连钱包 → 连接钱包；链不对 → 切换；没账号 → 开户；都齐了 → 发帖 */
function MainAction({ onOpenAccount, compact, menuDown }: { onOpenAccount: () => void; compact?: boolean; menuDown?: boolean }) {
  const { t } = useI18n();
  const w = useWallet();
  const { accounts } = useMyAccount();
  const navigate = useNavigate();
  const cls = `btn primary cta ${compact ? "" : "big"}`;

  if (w.wrongChain)
    return (
      <button className={cls} disabled={w.switching} onClick={() => w.switchChain({ chainId: w.targetChain as 43113 | 31337 })} title={t("wallet.switch", { chain: chainName(w.targetChain!, t) })}>
        <span className="cta-icon">
          <Icon name="layers" />
        </span>
        <span className="label">{t("wallet.switch", { chain: chainName(w.targetChain!, t) })}</span>
      </button>
    );
  if (!w.isConnected) {
    if (w.connectors.length <= 1)
      return (
        <button className={cls} disabled={w.isPending || !w.connectors[0]} onClick={() => w.connect({ connector: w.connectors[0]! })} title={t("wallet.connect")}>
          <span className="cta-icon">
            <Icon name="wallet" />
          </span>
          <span className="label">{t("wallet.connect")}</span>
        </button>
      );
    return (
      <details className="menu">
        <summary className={cls} title={t("wallet.connect")}>
          <span className="cta-icon">
            <Icon name="wallet" />
          </span>
          <span className="label">{t("wallet.connect")}</span>
        </summary>
        <div className={`menu-list ${menuDown ? "down" : ""}`}>
          {w.connectors.map((c) => (
            <button key={c.uid} className="btn ghost" disabled={w.isPending} onClick={() => w.connect({ connector: c })}>
              {c.name === "Injected" ? t("wallet.default") : c.name}
            </button>
          ))}
        </div>
      </details>
    );
  }
  if (accounts.length === 0)
    return (
      <button className={cls} onClick={onOpenAccount} title={t("account.mint")}>
        <span className="cta-icon">
          <Icon name="plus" />
        </span>
        <span className="label">{t("account.mint")}</span>
      </button>
    );
  return (
    <button
      className={cls}
      title={t("action.post")}
      onClick={() => {
        navigate("/");
        composeStore.set((n) => n + 1);
      }}
    >
      <span className="cta-icon">
        <Icon name="pen" />
      </span>
      <span className="label">{t("action.post")}</span>
    </button>
  );
}

/** 当前身份：点开可以换账号、再开一个、断开钱包 */
function Me({ onOpenAccount, menuDown }: { onOpenAccount: () => void; menuDown?: boolean }) {
  const { t } = useI18n();
  const w = useWallet();
  const { accounts, current, select } = useMyAccount();
  if (!w.isConnected || !w.address) return null;
  return (
    <details className="menu">
      <summary className="me" title={t("account.current")}>
        {current ? <Avatar id={current.id} name={current.name} /> : <span className="avatar" style={{ background: "var(--line-strong)" }}>?</span>}
        <span className="me-text">
          <b>{current ? (current.name ?? t("account.id", { id: String(current.id) })) : t("account.none")}</b>
          <span className="muted small">
            {current ? `#${current.id} · ` : ""}
            {shortAddr(w.address)}
          </span>
        </span>
        <span className="more">
          <Icon name="more" />
        </span>
      </summary>
      <div className={`menu-list ${menuDown ? "down" : ""}`} onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute("open")}>
        {accounts.map((a) => (
          <button key={a.id} className="btn ghost" onClick={() => select(a.id)}>
            <Avatar id={a.id} name={a.name} size="sm" />
            {a.name ?? t("account.id", { id: String(a.id) })} <span className="muted small">#{a.id}</span>
            {a.id === current?.id && <span className="ok">✓</span>}
          </button>
        ))}
        {accounts.length > 0 && <div className="sep" />}
        {!w.wrongChain && accounts.length > 0 && (
          <button className="btn ghost" onClick={onOpenAccount}>{t("account.another")}</button>
        )}
        <button className="btn ghost" onClick={() => w.disconnect()}>
          {t("wallet.disconnect", { address: shortAddr(w.address) })}
        </button>
      </div>
    </details>
  );
}

function useNavItems(): { to: string; label: string; icon: IconName; end?: boolean; narrow?: boolean }[] {
  const { t } = useI18n();
  const { current } = useMyAccount();
  return [
    { to: "/", label: t("nav.feed"), icon: "home", end: true },
    { to: "/pulse", label: t("nav.flows"), icon: "pulse", narrow: true },
    { to: "/rank", label: t("nav.rank"), icon: "trophy" },
    ...(current ? [{ to: `/a/${current.id}`, label: t("nav.mine"), icon: "user" as const }] : []),
  ];
}

function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  return (
    <button className="nav-item" onClick={toggle} title={t("theme.toggle")}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
      <span className="label">{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>
    </button>
  );
}

function NetStatus() {
  const { t } = useI18n();
  const cfg = useConfig();
  const ws = useStore(wsStore);
  if (!cfg.data) return null;
  return (
    <span className="net" title={t("network.status")}>
      <i className={`dot ${ws.connected ? "on" : ""}`} />
      <span>
        {chainName(cfg.data.chainId, t)} · {ws.connected ? t("network.live") : t("network.offline")}
      </span>
    </span>
  );
}

/** 桌面：左侧竖排导航 */
export function Rail({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { t } = useI18n();
  const items = useNavItems();
  return (
    <header className="rail">
      <Link to="/" className="brand" title={t("brand.description")}>
        <BrandMark />
        <span className="label">avaXLand</span>
      </Link>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""} ${it.narrow ? "only-narrow" : ""}`} title={it.label}>
          <Icon name={it.icon} />
          <span className="label">{it.label}</span>
        </NavLink>
      ))}
      <ThemeToggle />
      <LanguageSelect />
      <MainAction onOpenAccount={onOpenAccount} />
      <div className="rail-foot">
        <NetStatus />
        <Me onOpenAccount={onOpenAccount} />
      </div>
    </header>
  );
}

/** 手机：顶部一条（标志 + 身份 + 主按钮），底部一条（导航） */
export function TopBar({ onOpenAccount }: { onOpenAccount: () => void }) {
  return (
    <div className="topbar">
      <Link to="/" className="brand">
        <BrandMark />
        avaXLand
      </Link>
      <span className="spacer" />
      <LanguageSelect compact />
      <Me onOpenAccount={onOpenAccount} menuDown />
      <MainAction onOpenAccount={onOpenAccount} compact menuDown />
    </div>
  );
}

export function TabBar() {
  const items = useNavItems();
  return (
    <nav className="tabbar">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? "active" : "")} aria-label={it.label}>
          <Icon name={it.icon} />
        </NavLink>
      ))}
    </nav>
  );
}
