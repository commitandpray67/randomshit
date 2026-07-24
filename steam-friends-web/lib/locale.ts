import { cookies } from "next/headers";
import type { Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const lang = store.get("lang")?.value;
  if (lang === "ru" || lang === "zh" || lang === "tr") return lang;
  return "en";
}
