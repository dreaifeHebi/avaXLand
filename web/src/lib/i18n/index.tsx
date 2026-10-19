import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en, { type MessageKey } from "./en";
import zhCN from "./zh-CN";
import zhTW from "./zh-TW";
import ja from "./ja";

export type { MessageKey } from "./en";
export const languages = { en: "English", "zh-CN": "简体中文", "zh-TW": "繁體中文", ja: "日本語" } as const;
export type Locale = keyof typeof languages;
export type Params = Record<string, string | number>;
export type Message = { key: MessageKey; params?: Params };
export type Translate = (key: MessageKey, params?: Params) => string;
const dictionaries = { en, "zh-CN": zhCN, "zh-TW": zhTW, ja };
const STORAGE_KEY = "avaxland:language";

export function browserLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const tag = preference.toLowerCase();
    if (tag.startsWith("zh")) {
      return /(?:^zh-hant|^zh-(?:tw|hk|mo)(?:-|$))/.test(tag) ? "zh-TW" : "zh-CN";
    }
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

export function translator(locale: Locale): Translate {
  const number = new Intl.NumberFormat(locale);
  return (key, params = {}) => dictionaries[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name]!;
    return typeof value === "number" ? number.format(value) : value;
  });
}

interface I18n {
  locale: Locale;
  setLocale(locale: Locale): void;
  t: Translate;
}
const Context = createContext<I18n>(null!);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(() =>
    (localStorage.getItem(STORAGE_KEY) as Locale | null) ?? browserLocale(navigator.languages),
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.querySelector('meta[name="description"]')!.setAttribute("content", translator(locale)("meta.description"));
  }, [locale]);
  const value = useMemo<I18n>(() => ({
    locale,
    t: translator(locale),
    setLocale(next) {
      localStorage.setItem(STORAGE_KEY, next);
      updateLocale(next);
    },
  }), [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
