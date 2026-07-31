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
  step1Title: "Juega una partida — sin registro.",
  step1BodyA:
    "Cuando abres una sala de partida en FACEIT, la extensión comprueba si tu cuenta de FACEIT está entre los 10 jugadores de la sala. Si es así, aparece un botón",
  step1BodyB:
    "junto al nombre de cada otro jugador. No se necesita cuenta, correo ni inicio de sesión separado — tu presencia en la partida es la prueba.",
  step2Title: "Haz clic en ⚑, elige un rango, deja un comentario.",
  step2Body:
    "Se abre un panel junto al nombre del jugador. Elige una gravedad de S (vendedor de cuenta confirmado) a F (incidente menor aislado) y escribe un motivo breve. La denuncia se envía a la base de datos comunitaria con tu ID anónimo — tu identidad de FACEIT nunca se almacena ni se envía.",
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
  privacyTitle: "Sin cuenta. Sin inicio de sesión. Verificado por la partida.",
  privacyBody:
    "En lugar de crear una cuenta, la extensión verifica que realmente estuviste en la partida — lee tu sesión de FACEIT directamente desde la página y comprueba tu apodo contra la lista de jugadores de la sala. Todo ocurre en tu navegador; tu nombre de usuario de FACEIT nunca se envía a nuestros servidores. Las denuncias se atribuyen solo a un ID anónimo generado en la instalación, y puedes eliminarlas en cualquier momento desde la ventana emergente.",
  privacyLink: "Leer la política de privacidad completa →",
  ctaBack: "Volver al rastreador de Steam",
  backHref: "/es",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPageEs() {
  return <ExtensionPageContent s={s} />;
}
