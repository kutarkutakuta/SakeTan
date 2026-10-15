import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { publicClient, paged } from "./supabase-admin";
import type { Brand, Brewery } from "../src/lib/types";
import {
  buildPublicDetails,
  type PublicShop,
  type PublicRelation,
} from "./public-details";

const siteUrl = (process.env.SITE_URL ?? "https://xn--l8jsqp0k5g.jp").replace(
  /\/$/u,
  "",
);
const publicDirectory = join(process.cwd(), "public");

type SitemapRow = {
  id: string;
  updated_at: string | null;
};

type SitemapEntry = {
  path: string;
  lastModified?: string;
};

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
}

export function toSitemapXml(entries: SitemapEntry[]) {
  const urls = entries
    .map(
      ({ path, lastModified }) => `  <url>
    <loc>${escapeXml(`${siteUrl}${path}`)}</loc>${
      lastModified ? `\n    <lastmod>${escapeXml(lastModified)}</lastmod>` : ""
    }
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function toRobotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /account
Disallow: /admin
Disallow: /edit
Disallow: /history
Disallow: /login
Disallow: /post

Sitemap: ${siteUrl}/sitemap.xml
`;
}

function rowsToEntries(rows: SitemapRow[], prefix: string): SitemapEntry[] {
  return rows.map((row) => ({
    path: `${prefix}/${row.id}`,
    ...(row.updated_at ? { lastModified: row.updated_at } : {}),
  }));
}

async function generateSitemap() {
  const db = publicClient();
  const [brands, breweries, shops, relations, comments] = await Promise.all([
    paged<Brand & SitemapRow>((from, to) =>
      db
        .from("brands")
        .select(
          "id,name,name_kana,brewery_id,is_active,registration_status,registered_at,sakenowa_rank,sakenowa_area_rank,sakenowa_area_name,updated_at",
        )
        .eq("is_active", true)
        .eq("registration_status", "approved")
        .order("id")
        .range(from, to),
    ),
    paged<Brewery & SitemapRow>((from, to) =>
      db
        .from("breweries")
        .select("id,name,name_kana,prefecture,website_url,is_active,updated_at")
        .eq("is_active", true)
        .order("id")
        .range(from, to),
    ),
    paged<PublicShop & SitemapRow>((from, to) =>
      db
        .from("shops")
        .select(
          "id,name,name_kana,prefecture,city,google_place_id,is_active,seeking_brand_info,updated_at",
        )
        .eq("is_active", true)
        .order("id")
        .range(from, to),
    ),
    paged<PublicRelation>((from, to) =>
      db
        .from("shop_brands")
        .select(
          "id,shop_id,brand_id,is_active,status,first_seen_at,last_seen_at",
        )
        .eq("is_active", true)
        .in("status", ["available", "unavailable"])
        .order("id")
        .range(from, to),
    ),
    paged<{ shop_id: string }>((from, to) =>
      db
        .from("shop_comments")
        .select("shop_id")
        .eq("is_deleted", false)
        .order("id")
        .range(from, to),
    ),
  ]);

  const entries: SitemapEntry[] = [
    { path: "/" },
    { path: "/brands" },
    { path: "/breweries" },
    { path: "/shops" },
    ...rowsToEntries(brands, "/brands"),
    ...rowsToEntries(breweries, "/breweries"),
    ...rowsToEntries(shops, "/shops"),
  ];

  await mkdir(publicDirectory, { recursive: true });
  await mkdir(join(process.cwd(), ".generated"), { recursive: true });
  await Promise.all([
    writeFile(join(publicDirectory, "sitemap.xml"), toSitemapXml(entries)),
    writeFile(join(publicDirectory, "robots.txt"), toRobotsTxt()),
    writeFile(
      join(process.cwd(), ".generated/public-details.json"),
      JSON.stringify(
        buildPublicDetails(shops, brands, breweries, relations, comments),
      ),
    ),
  ]);

  console.log(
    `sitemap.xml を生成しました（銘柄 ${brands.length}、蔵 ${breweries.length}、店舗 ${shops.length}、合計 ${entries.length} URL）`,
  );
}

generateSitemap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
