import { ImageResponse } from "next/og";

export const alt = "Steam Friends Tracker — see who unfriended you on Steam";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social share card shown when the site is linked on Twitter/Discord/etc.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #16283b 0%, #0e1720 60%, #1d3350 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 800 }}>
          Steam Friends Tracker
        </div>
        <div style={{ fontSize: 34, color: "#66c0f4", marginTop: 16 }}>
          See who unfriended you on Steam
        </div>
      </div>
    ),
    { ...size },
  );
}
