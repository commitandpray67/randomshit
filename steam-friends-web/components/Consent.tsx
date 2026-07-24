"use client";

import { useEffect, useState } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const KEY = "sfw_consent";

/**
 * Loads Google AdSense only after the visitor accepts. Denial (or no choice)
 * means the ad script is never fetched — the GDPR-correct default. Once the
 * script is ready it fires a `sfw-ads-ready` event that AdSlot listens for.
 */
function loadAdsense() {
  if (!CLIENT || typeof document === "undefined") return;
  if (document.getElementById("adsbygoogle-js")) {
    window.dispatchEvent(new Event("sfw-ads-ready"));
    return;
  }
  const s = document.createElement("script");
  s.id = "adsbygoogle-js";
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
  s.onload = () => window.dispatchEvent(new Event("sfw-ads-ready"));
  document.head.appendChild(s);
}

export function hasAdConsent(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "granted";
}

export default function Consent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!CLIENT) return; // no ads configured → never show the banner
    const saved = localStorage.getItem(KEY);
    if (saved === "granted") {
      loadAdsense();
    } else if (saved !== "denied") {
      setVisible(true); // no choice yet → ask
    }
  }, []);

  if (!CLIENT || !visible) return null;

  function accept() {
    localStorage.setItem(KEY, "granted");
    loadAdsense();
    window.dispatchEvent(new Event("sfw-ads-ready"));
    setVisible(false);
  }
  function reject() {
    localStorage.setItem(KEY, "denied");
    setVisible(false);
  }

  return (
    <div className="consent">
      <div className="consent-inner">
        <p>
          We use cookies to show ads (Google AdSense) and to keep you signed in.
          You can accept ad cookies or continue without them.{" "}
          <a href="/privacy">Learn more</a>.
        </p>
        <div className="consent-actions">
          <button className="btn btn-ghost" onClick={reject}>
            Reject ads
          </button>
          <button className="btn" onClick={accept}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
