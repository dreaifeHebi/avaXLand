import { languages, useI18n, type Locale } from "../lib/i18n";

export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={`language-select ${compact ? "compact" : ""}`}>
      <span aria-hidden="true">◎</span>
      <select aria-label={t("language.label")} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {Object.entries(languages).map(([value, label]) => <option key={value} value={value} lang={value}>{label}</option>)}
      </select>
    </label>
  );
}
