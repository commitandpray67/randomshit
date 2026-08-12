import type { Metadata } from "next";
import ExtensionPageContent, { type ExtensionStrings } from "@/components/ExtensionPageContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export const metadata: Metadata = {
  title: "ELO TERRORISTS — FACEIT CS2 Chrome Uzantısı",
  description:
    "FACEIT'te maç sahtecilerini ve oyun bozanları işaretlemek için topluluk destekli Chrome uzantısı. İşaretlenen oyuncular her FACEIT sayfasında parlar — maç başlamadan kimi oynayacağını öğren.",
  alternates: {
    canonical: `${SITE}/tr/extension`,
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
  heroEyebrow: "Chrome Uzantısı · FACEIT CS2",
  heroSub:
    "FACEIT üzerinde maç sahtecilerini ve oyun bozanları işaretlemek için topluluk destekli bir veritabanı. İşaretlenen oyuncular herhangi bir FACEIT sayfasında kırmızı parlar — maç başlamadan kimin oynayacağını öğren.",
  ctaLabel: "Chrome'a Ekle — Ücretsiz",
  ctaComingSoon: "Yakında Chrome Web Mağazası'nda",
  mockupLabel1: "Önizleme — faceit.com maç odası",
  mockupCaption1:
    "İşaretlenen oyuncular otomatik olarak vurgulanır. Topluluk raporlarını görmek için rozete fareyi getir.",
  howTitle: "Nasıl çalışır",
  step1Title: "FACEIT ile giriş yap.",
  step1BodyA:
    "FACEIT hesabını bir kez bağla — giriş FACEIT'in kendi sayfasında yapılır, uzantı şifreni asla görmez. Oynadığın bir maçın odasını aç ve diğer her oyuncunun adının yanında bir",
  step1BodyB:
    "butonu belirsin. Sunucumuz, bir şikayeti kabul etmeden önce o maçın kadrosunda gerçekten yer aldığını doğrular.",
  step2Title: "⚑'e tıkla, rütbe seç, yorum bırak.",
  step2Body:
    "Oyuncunun adının yanında bir panel açılır. S (doğrulanmış hesap satıcısı) ile F (küçük, tek seferlik olay) arasında bir ciddiyet seç ve kısa bir gerekçe yaz. FACEIT hesabın yalnızca geri döndürülemez bir hash olarak saklanır, bu yüzden şikayet sana kadar izlenemez — ama kendi şikayetlerini açılır pencereden görüp silebilirsin.",
  step3Title: "Vurgular FACEIT'in her yerinde görünür.",
  step3BodyA:
    "İşaretlenen oyuncuların isimleri rütkeye göre renklendirilmiş metin olarak parlar ve",
  step3BodyB:
    "gibi bir rozet taşır; herhangi bir FACEIT sayfasında — maç odaları, skor tabloları, oyuncu profilleri — topluluk raporlarını gösteren araç ipucu belirir.",
  step4Title: "Kuyruğa girmeden önce ara.",
  step4Body:
    "Profil sayfasını açmadan herhangi bir takma adı anında aramak ve topluluk rütbesini, rapor sayısını ve en sık belirtilen nedeni görmek için uzantı açılır penceresini kullan.",
  mockupLabel2: "Önizleme — Uzantı açılır penceresi",
  rankTitle: "Rütbe sistemi",
  rankSub:
    "S en ağır suçlu, F en hafifidir. Görüntülenen rütbeyi topluluk konsensüsü belirler.",
  rankRows: [
    { label: "En Ağır",   desc: "Onaylanmış hesap satıcısı / para için maç sattı" },
    { label: "Ağır",      desc: "Sürekli kasıtlı yenilgi, AFK çiftlik" },
    { label: "Yüksek",    desc: "Sık maç bozan, açık kasıtlı yenilgi" },
    { label: "Orta",      desc: "Şüpheli, tekrarlayan kötü maçlar" },
    { label: "Düşük",     desc: "Muhtemel troll, tekrarlayan küçük sorunlar" },
    { label: "Minimal",   desc: "Tek seferlik olay veya belirsiz durum" },
  ],
  privacyTitle: "Doğrulanmış şikayetçiler. Anonim şikayetler.",
  privacyBody:
    "Şikayet göndermek için FACEIT ile giriş gerekir ve sunucumuz herhangi bir şeyi kabul etmeden önce maç kadrosunda olduğunu doğrular — veritabanının anonim intikam şikayetleriyle dolmasını engelleyen şey budur. FACEIT hesap kimliğin hiçbir zaman okunabilir biçimde saklanmaz; yalnızca geri döndürülemez bir hash tutulur ve bu da sadece kendi şikayetlerini silebilmene yeter. Sayfada görünen oyuncu takma adları, Steam kimliklerini ve topluluk rütbelerini almak için API'mize gönderilir.",
  privacyLink: "Tam gizlilik politikasını oku →",
  ctaBack: "Steam takipçisine dön",
  backHref: "/tr",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPageTr() {
  return <ExtensionPageContent s={s} />;
}
