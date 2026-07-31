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
  step1Title: "Maç oyna — kayıt gerekmez.",
  step1BodyA:
    "FACEIT'te bir maç odası açtığında, uzantı giriş yaptığın FACEIT hesabının odadaki 10 oyuncudan biri olup olmadığını kontrol eder. Eğer öyleyse, diğer her oyuncunun adının yanında",
  step1BodyB:
    "işaretleme butonu belirir. Hesap, e-posta veya ayrı bir giriş gerekmez — maçta olman tek doğrulama yöntemidir.",
  step2Title: "⚑'e tıkla, rütbe seç, yorum bırak.",
  step2Body:
    "Oyuncunun adının yanında bir panel açılır. S (onaylanmış hesap satıcısı) ile F (küçük tek seferlik olay) arasında bir ağırlık seç ve kısa bir gerekçe yaz. Şikayet, anonim raporlayıcı kimliğinle topluluk veritabanına gönderilir — FACEIT kimliğin asla kaydedilmez veya iletilmez.",
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
  privacyTitle: "Hesap yok. Giriş yok. Maçla doğrulanır.",
  privacyBody:
    "Hesap oluşturmak yerine uzantı, gerçekten maçta olduğunu doğrular — FACEIT oturumunu doğrudan sayfadan okur ve takma adını oda oyuncu listesiyle karşılaştırır. Bu işlem tamamen tarayıcında gerçekleşir; FACEIT kullanıcı adın sunucularımıza asla iletilmez. Şikayetler yalnızca kurulumda oluşturulan rastgele anonim bir kimlikle ilişkilendirilir ve istediğin zaman açılır pencereden silebilirsin.",
  privacyLink: "Tam gizlilik politikasını oku →",
  ctaBack: "Steam takipçisine dön",
  backHref: "/tr",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPageTr() {
  return <ExtensionPageContent s={s} />;
}
