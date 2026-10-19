import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { payErrorText } from "../lib/pay";
import { toastStore, useStore } from "../lib/store";

export function Toasts() {
  const { t } = useI18n();
  const { badgeText } = useFormat();
  const toasts = useStore(toastStore);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <div className="toast-title">
            {toast.kind === "badge" ? "🏅 " : toast.kind === "error" ? "✕ " : ""}
            {toast.kind === "error" ? payErrorText(toast.error, t) : toast.title && t(toast.title.key, toast.title.params)}
          </div>
          {toast.sub && <div className="small">{t(toast.sub.key, toast.sub.params)}</div>}
          {toast.badge && <div className="small">{badgeText(toast.badge.metric, toast.badge.threshold)}</div>}
        </div>
      ))}
    </div>
  );
}
