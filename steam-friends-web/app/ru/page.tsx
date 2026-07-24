import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdSlot from "@/components/AdSlot";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export const metadata: Metadata = {
  title: "Трекер Друзей Steam: Кто Удалил Тебя из Друзей?",
  description:
    "Бесплатный инструмент для отслеживания списка друзей Steam. Войди через Steam и узнай, кто удалил тебя из друзей и когда именно это произошло.",
  keywords: [
    "кто удалил меня из друзей стим",
    "трекер друзей стим",
    "кто убрал из друзей стим",
    "история друзей steam",
    "отслеживание друзей стим",
    "стим трекер друзей",
    "кто удалил из стим",
    "steam друзья история",
    "проверить список друзей стим",
  ],
  alternates: {
    canonical: `${SITE}/ru`,
    languages: {
      en: `${SITE}/`,
      ru: `${SITE}/ru`,
      zh: `${SITE}/zh`,
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE}/ru`,
    siteName: "Steam Friends Tracker",
    title: "Трекер Друзей Steam: Кто Удалил Тебя из Друзей?",
    description:
      "Войди через Steam и узнай, кто удалил тебя из друзей и когда.",
  },
};

export default async function RuPage() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main className="landing">
      <section className="hero">
        <h1>Узнай, кто удалил тебя из друзей в Steam</h1>
        <p className="sub">
          Steam не сообщает, когда тебя удаляют из друзей. Войди — и мы
          запомним список, чтобы показать, кто и когда тебя удалил.
        </p>
        <a className="btn btn-lg" href="/api/auth/steam">
          Войти через Steam
        </a>
        <p className="trust">
          Пароль не нужен. Мы читаем только твой публичный SteamID через Steam
          OpenID.
        </p>
      </section>

      <section className="how">
        <h2>Как узнать, кто удалил тебя из друзей в Steam</h2>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <span>
              Открой <strong>настройки приватности Steam</strong> и выбери «Мой
              список друзей» → «Открытый». Steam не разрешает сторонним
              приложениям читать закрытый список.
            </span>
          </li>
          <li>
            <span className="step-n">2</span>
            <span>
              Нажми <strong>«Войти через Steam»</strong> выше. Мы сохраним
              снимок твоих текущих друзей.
            </span>
          </li>
          <li>
            <span className="step-n">3</span>
            <span>
              Заходи в любое время — ежедневная проверка сделает всё
              автоматически. Мы покажем всех, кто{" "}
              <strong>удалил тебя из друзей</strong>.
            </span>
          </li>
        </ol>
      </section>

      <AdSlot />
    </main>
  );
}
