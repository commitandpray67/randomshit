"use client";

import { useEffect, useRef } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const DEFAULT_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

/**
 * A single responsive AdSense unit. Renders nothing unless both the AdSense
 * client id and a slot id are configured. It only fills once the ad script is
 * loaded (which Consent does after the visitor accepts), so no ad — and no ad
 * cookie — appears without consent.
 */
export default function AdSlot({ slot }: { slot?: string }) {
  const slotId = slot ?? DEFAULT_SLOT;
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || !slotId) return;
    const tryPush = () => {
      if (pushed.current) return;
      const w = window as unknown as { adsbygoogle?: unknown[] };
      if (w.adsbygoogle) {
        try {
          w.adsbygoogle.push({});
          pushed.current = true;
        } catch {
          /* AdSense not ready yet; the event will retry */
        }
      }
    };
    tryPush();
    window.addEventListener("sfw-ads-ready", tryPush);
    return () => window.removeEventListener("sfw-ads-ready", tryPush);
  }, [slotId]);

  if (!CLIENT || !slotId) return null;

  return (
    <div className="ad-slot">
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={CLIENT}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
