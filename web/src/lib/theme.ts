import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "avaxland:theme";

function initial(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 浅色 / 深色：默认跟随系统，手动切换后记在本地 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next);
      return next;
    });
  return { theme, toggle };
}
