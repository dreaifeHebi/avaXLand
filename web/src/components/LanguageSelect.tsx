import { useSyncExternalStore } from "react";
import { languages, useI18n, type Locale } from "../lib/i18n";

const narrowRail = window.matchMedia("(min-width: 641px) and (max-width: 1260px)");
const shortNames = { en: "EN", "zh-CN": "简中", "zh-TW": "繁中", ja: "日本語" };
const subscribe = (notify: () => void) => {
  narrowRail.addEventListener("change", notify);
  return () => narrowRail.removeEventListener("change", notify);
};

export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const narrow = useSyncExternalStore(subscribe, () => narrowRail.matches);
  return (
    <label className={`language-select ${compact ? "compact" : ""}`}>
      <span aria-hidden="true">◎</span>
      <select aria-label={t("language.label")} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {Object.entries(languages).map(([value, label]) => <option key={value} value={value} lang={value}>{narrow && !compact ? shortNames[value as Locale] : label}</option>)}
      </select>
    </label>
  );
}
