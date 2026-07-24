"use client";

import { useEffect, useRef } from "react";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const DEFAULT_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

/**
 * A single responsive AdSense unit. Renders nothing unless both the AdSense
 * client id and a slot id are configured. Consent for EEA/UK/CH visitors is
 * handled by Google's Consent Management Platform (loaded via the AdSense tag
 * in the root layout), so there's no separate gating here.
 */
export default function AdSlot({ slot }: { slot?: string }) {
  const slotId = slot ?? DEFAULT_SLOT;
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || !slotId || pushed.current) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
      pushed.current = true;
    } catch {
      /* script not ready yet; queued pushes are processed once it loads */
    }
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
