import { toastStore, useStore } from "../lib/store";

export function Toasts() {
  const toasts = useStore(toastStore);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div className="toast-title">
            {t.kind === "badge" ? "🏅 " : t.kind === "error" ? "✕ " : ""}
            {t.title}
          </div>
          {t.sub && <div className="small">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
