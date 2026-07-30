"use client";

import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";

const LANGS: { code: Locale; label: string; page: string }[] = [
  { code: "en", label: "EN", page: "/" },
  { code: "ru", label: "RU", page: "/ru" },
  { code: "zh", label: "中文", page: "/zh" },
  { code: "tr", label: "TR", page: "/tr" },
  { code: "es", label: "ES", page: "/es" },
];

export default function LangSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";

  return (
    <span className="lang-switcher">
      {LANGS.map((l, i) => (
        <span key={l.code}>
          {i > 0 && <span className="lang-sep"> · </span>}
          {l.code === current ? (
            <strong>{l.label}</strong>
          ) : (
            <a
              href={
                onDashboard
                  ? `/api/lang?lang=${l.code}&return=/dashboard`
                  : `/api/lang?lang=${l.code}&return=${l.page}`
              }
            >
              {l.label}
            </a>
          )}
        </span>
      ))}
    </span>
  );
}
