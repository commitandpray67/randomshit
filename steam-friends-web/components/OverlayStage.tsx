"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type StageEvent = {
  id: number;
  type: "added" | "removed" | "readded";
  name: string | null;
  avatar: string | null;
  at: string;
};

export type StageConfig = {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  accent: string;
  showAvatars: boolean;
  maxEvents: number;
  eventTtlSec: number;
  pollSec: number;
};

type Shown = StageEvent & { expiresAt: number };

const VERB: Record<StageEvent["type"], string> = {
  added: "added you",
  removed: "unfriended you",
  readded: "re-added you",
};

/**
 * The alert stage, used by both the OBS browser source and the control
 * panel's preview.
 *
 * In `demo` mode it invents events on a timer instead of polling, so the
 * overlay can be styled without waiting for someone to actually unfriend you.
 */
export default function OverlayStage({
  overlayKey,
  config,
  demo = false,
  demoTypes,
}: {
  overlayKey?: string;
  config: StageConfig;
  demo?: boolean;
  /** Demo mode only — which event types to invent. Live mode filters server-side. */
  demoTypes?: StageEvent["type"][];
}) {
  const [shown, setShown] = useState<Shown[]>([]);

  // Held in a ref so the polling effect doesn't restart on every new event.
  const lastId = useRef<number | null>(null);

  const push = useCallback(
    (events: StageEvent[]) => {
      if (!events.length) return;
      const expiresAt = Date.now() + config.eventTtlSec * 1000;
      setShown((prev) =>
        [...prev, ...events.map((e) => ({ ...e, expiresAt }))].slice(-config.maxEvents),
      );
    },
    [config.eventTtlSec, config.maxEvents],
  );

  // Lowering "max on screen" should take effect immediately, not wait for the
  // next alert to push the excess off the stack.
  useEffect(() => {
    setShown((prev) => (prev.length > config.maxEvents ? prev.slice(-config.maxEvents) : prev));
  }, [config.maxEvents]);

  // Expire alerts once their TTL is up.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setShown((prev) =>
        prev.some((e) => e.expiresAt <= now) ? prev.filter((e) => e.expiresAt > now) : prev,
      );
    }, 500);
    return () => clearInterval(t);
  }, []);

  // Demo mode: a rolling sample alert for the panel preview.
  // Only invents types the overlay is set to show, so the preview matches what
  // would actually go on stream.
  const demoKey = (demoTypes ?? []).join(",");
  useEffect(() => {
    if (!demo) return;
    const types = demoKey ? (demoKey.split(",") as StageEvent["type"][]) : [];
    if (types.length === 0) {
      setShown([]);
      return;
    }

    const names = ["Juntella", "gaben", "shroud", "cs_player_99", "friend_of_a_friend"];
    let n = 0;

    const fire = () => {
      push([
        {
          id: -Date.now() - n, // negative ids can never collide with real rows
          type: types[n % types.length],
          name: names[n % names.length],
          avatar: null,
          at: new Date().toISOString(),
        },
      ]);
      n++;
    };

    fire();
    const t = setInterval(fire, 2500);
    return () => clearInterval(t);
  }, [demo, demoKey, push]);

  // Live mode: poll the feed.
  useEffect(() => {
    if (demo || !overlayKey) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    // Back off on failure so a deploy or a database blip doesn't turn into a
    // tight retry loop from every running browser source.
    let failures = 0;

    const tick = async () => {
      try {
        const since = lastId.current;
        const url =
          since === null
            ? `/api/overlay/${overlayKey}/events`
            : `/api/overlay/${overlayKey}/events?since=${since}`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));

        const data = await res.json();
        if (cancelled) return;

        if (typeof data.lastId === "number") lastId.current = data.lastId;
        if (Array.isArray(data.events)) push(data.events);
        failures = 0;
      } catch {
        failures++;
      }

      if (cancelled) return;
      const backoff = Math.min(failures, 5) * config.pollSec;
      timer = setTimeout(tick, (config.pollSec + backoff) * 1000);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [demo, overlayKey, config.pollSec, push]);

  const [vertical, horizontal] = config.position.split("-") as
    ["top" | "bottom", "left" | "right"];

  return (
    <div
      className={`ov-stage ov-${vertical} ov-${horizontal}`}
      style={{ ["--ov-accent" as string]: config.accent }}
    >
      {shown.map((e) => (
        <div key={e.id} className={`ov-alert ov-${e.type}`}>
          {config.showAvatars && e.avatar ? (
            <img className="ov-avatar" src={e.avatar} alt="" />
          ) : null}
          <div className="ov-body">
            <span className="ov-name">{e.name ?? "Someone"}</span>
            <span className="ov-verb">{VERB[e.type]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
