"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Brand, Brewery, Shop } from "@/lib/types";
export function EditSearch({ admin = false }: { admin?: boolean }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{
    brands: Brand[];
    shops: Shop[];
    breweries: Brewery[];
  }>({ brands: [], shops: [], breweries: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const [a, b] = await Promise.all([
          fetch("/api/search?q=" + encodeURIComponent(q), {
            signal: abort.signal,
          }),
          fetch("/api/breweries?q=" + encodeURIComponent(q), {
            signal: abort.signal,
          }),
        ]);
        if (!a.ok || !b.ok) throw new Error("検索できませんでした");
        setData({ ...(await a.json()), breweries: await b.json() });
        setError("");
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "検索できませんでした");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q]);
  return (
    <div className="card">
      <label>
        登録情報を検索
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="銘柄・酒蔵・酒屋の名前"
        />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {(
        [
          ["brands", "brand", "銘柄"],
          ["breweries", "brewery", "酒蔵"],
          ["shops", "shop", "酒屋"],
        ] as const
      )
        .filter(([, type]) => admin || type === "shop")
        .map(([key, type, label]) => (
          <section key={key} style={{ marginTop: 24 }}>
            <h2>{label}</h2>
            {data[key].map((item) => (
              <Link
                className="search-result"
                key={item.id}
                href={"/edit/" + type + "/" + item.id}
              >
                {item.name}
                <span className="inline-link">編集</span>
              </Link>
            ))}
            {type === "shop" && (
              <Link className="text-link" href="/edit/shop/new">
                ＋ 新しい酒屋を登録
              </Link>
            )}
          </section>
        ))}
      {!admin && (
        <p className="notice master-source-note">
          銘柄と酒蔵は、さけのわのデータから同期しています。
        </p>
      )}
    </div>
  );
}
