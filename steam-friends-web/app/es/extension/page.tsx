import type { Metadata } from "next";
import ExtensionPageContent, { type ExtensionStrings } from "@/components/ExtensionPageContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export const metadata: Metadata = {
  title: "ELO TERRORISTS — Extensión Chrome para FACEIT CS2",
  description:
    "Extensión Chrome impulsada por la comunidad para marcar a tramposos y saboteadores en FACEIT. Los jugadores marcados brillan en cualquier página de FACEIT — sabe con quién juegas antes de empezar.",
  alternates: {
    canonical: `${SITE}/es/extension`,
    languages: {
      en: `${SITE}/extension`,
      ru: `${SITE}/ru/extension`,
      zh: `${SITE}/zh/extension`,
      tr: `${SITE}/tr/extension`,
      es: `${SITE}/es/extension`,
    },
  },
};

const s: ExtensionStrings = {
  heroEyebrow: "Extensión de Chrome · FACEIT CS2",
  heroSub:
    "Una base de datos comunitaria para marcar a tramposos y saboteadores de partidas en FACEIT. Los jugadores marcados brillan en rojo en cualquier página de FACEIT — sabe con quién juegas antes de que empiece la partida.",
  ctaLabel: "Añadir a Chrome — Gratis",
  ctaComingSoon: "Próximamente en Chrome Web Store",
  mockupLabel1: "Vista previa — Sala de partida en faceit.com",
  mockupCaption1:
    "Los jugadores marcados se resaltan automáticamente. Pasa el ratón sobre la insignia para ver los informes de la comunidad.",
  howTitle: "Cómo funciona",
  step1Title: "Inicia sesión con FACEIT.",
  step1BodyA:
    "Conecta tu cuenta de FACEIT una sola vez, desde la página de inicio de sesión del propio FACEIT — la extensión nunca ve tu contraseña. Abre la sala de una partida que hayas jugado y aparecerá un botón",
  step1BodyB:
    "junto al nombre de cada jugador. Nuestro servidor comprueba que realmente estabas en la alineación de esa partida antes de aceptar una denuncia.",
  step2Title: "Haz clic en ⚑, elige un rango, deja un comentario.",
  step2Body:
    "Se abre un panel junto al nombre del jugador. Elige una gravedad de S (vendedor de cuenta confirmado) a F (incidente menor aislado) y escribe un motivo breve. Tu cuenta de FACEIT se guarda solo como un hash irreversible, así que una denuncia no puede rastrearse hasta ti — pero la ventana emergente te sigue permitiendo ver y eliminar las tuyas.",
  step3Title: "Los resaltados aparecen en todo FACEIT.",
  step3BodyA:
    "Los nombres de los jugadores marcados brillan en texto de color según su rango con una insignia como",
  step3BodyB:
    "en cualquier página de FACEIT — salas de partida, marcadores, perfiles — con un tooltip que muestra los informes de la comunidad.",
  step4Title: "Busca antes de entrar en cola.",
  step4Body:
    "Usa la ventana emergente de la extensión para buscar cualquier apodo al instante y ver su rango comunitario, número de informes y el motivo más citado — sin cargar su perfil.",
  mockupLabel2: "Vista previa — Ventana emergente de la extensión",
  rankTitle: "Sistema de rangos",
  rankSub:
    "S es el peor infractor. F es el menos grave. El consenso de la comunidad determina el rango mostrado.",
  rankRows: [
    { label: "Extremo",   desc: "Vendedor de cuenta confirmado / perdió partidas por dinero" },
    { label: "Grave",     desc: "Pérdidas intencionales sistemáticas, AFK farming" },
    { label: "Alto",      desc: "Saboteador frecuente, pérdidas intencionales evidentes" },
    { label: "Medio",     desc: "Sospechoso, malas partidas repetidas" },
    { label: "Bajo",      desc: "Posible troll, problemas menores recurrentes" },
    { label: "Mínimo",    desc: "Incidente aislado o situación incierta" },
  ],
  privacyTitle: "Autores verificados. Denuncias anónimas.",
  privacyBody:
    "Para denunciar hay que iniciar sesión con FACEIT, y nuestro servidor confirma que estabas en la alineación de la partida antes de aceptar nada — eso es lo que evita que la base de datos se llene de venganzas anónimas. El ID de tu cuenta de FACEIT nunca se almacena de forma legible: solo se guarda un hash irreversible, suficiente para que puedas eliminar tus propias denuncias y nada más. Los apodos visibles en la página se envían a nuestra API para obtener sus Steam ID y su rango comunitario.",
  privacyLink: "Leer la política de privacidad completa →",
  ctaBack: "Volver al rastreador de Steam",
  backHref: "/es",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPageEs() {
  return <ExtensionPageContent s={s} />;
}
