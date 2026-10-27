import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        background: "#23483a",
        color: "#f3ecdf",
        fontSize: 22,
        fontStyle: "italic",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      s
    </div>,
    size,
  );
}
