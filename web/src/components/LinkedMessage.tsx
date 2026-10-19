import type { ReactNode } from "react";
import { useI18n, type MessageKey } from "../lib/i18n";

/** Keep each language's link position inside its sentence. */
export function LinkedMessage({ message, link }: { message: MessageKey; link: ReactNode }) {
  const { t } = useI18n();
  const [before, after] = t(message, { link: "{link}" }).split("{link}");
  return <>{before}{link}{after}</>;
}
