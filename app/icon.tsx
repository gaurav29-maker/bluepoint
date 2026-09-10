import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The tab icon: the point of the logo, on the logo's blue. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1D9BF0",
          borderRadius: 7,
          color: "#05080C",
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        b
      </div>
    ),
    size,
  );
}
