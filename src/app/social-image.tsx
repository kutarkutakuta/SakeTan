import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const size = {
  width: 1200,
  height: 630,
};

function dataUrl(mimeType: string, data: Buffer) {
  return `data:${mimeType};base64,${data.toString("base64")}`;
}

export async function createSocialImage() {
  const [background, brandIcon, fontRegular, fontBold] = await Promise.all([
    readFile(join(process.cwd(), "public", "og-background.png")),
    readFile(join(process.cwd(), "public", "brand-icon.png")),
    readFile(
      join(
        process.cwd(),
        "node_modules",
        "@fontsource",
        "noto-sans-jp",
        "files",
        "noto-sans-jp-japanese-400-normal.woff",
      ),
    ),
    readFile(
      join(
        process.cwd(),
        "node_modules",
        "@fontsource",
        "noto-sans-jp",
        "files",
        "noto-sans-jp-japanese-700-normal.woff",
      ),
    ),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#f7f0e2",
        color: "#241f1b",
        fontFamily: "Noto Sans JP",
      }}
    >
      <img
        src={dataUrl("image/png", background)}
        alt=""
        width={size.width}
        height={size.height}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(90deg, rgba(250, 246, 237, 0.98) 0%, rgba(250, 246, 237, 0.9) 39%, rgba(250, 246, 237, 0) 62%)",
        }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "58px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 78,
              height: 78,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 24,
              background: "rgba(255, 255, 255, 0.88)",
              boxShadow: "0 10px 32px rgba(88, 43, 31, 0.12)",
            }}
          >
            <img
              src={dataUrl("image/png", brandIcon)}
              alt=""
              width={62}
              height={62}
            />
          </div>
          <span
            style={{
              fontSize: 29,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#a33b2e",
            }}
          >
            さけのありか
          </span>
        </div>
        <div
          style={{
            width: 610,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 66,
              lineHeight: 1.22,
              letterSpacing: "-0.025em",
              fontWeight: 700,
            }}
          >
            <span>飲みたい酒から、</span>
            <span>酒屋を探そう。</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 25,
              lineHeight: 1.55,
              letterSpacing: "0.015em",
              color: "#594c43",
            }}
          >
            みんなで作る、日本酒銘柄と酒販店の取扱マップ
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Noto Sans JP",
          data: fontRegular,
          style: "normal",
          weight: 400,
        },
        {
          name: "Noto Sans JP",
          data: fontBold,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
