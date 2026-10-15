import type { Metadata } from "next";

export const siteUrl = new URL("https://xn--l8jsqp0k5g.jp/");

export function publicMetadata(
  path: string,
  title: string,
  description: string,
): Metadata {
  return {
    title: { absolute: `${title} - さけのありか` },
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} - さけのありか`,
      description,
      url: path,
      siteName: "さけのありか",
      locale: "ja_JP",
      type: "website",
      images: [
        { url: "/og-image.png", width: 1728, height: 910, alt: "さけのありか" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - さけのありか`,
      description,
      images: ["/og-image.png"],
    },
  };
}
