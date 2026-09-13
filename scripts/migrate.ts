import postgres from "postgres";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "自動migrationには .env.local の DATABASE_URL（SupabaseのSession pooler接続文字列）が必要です。SQL Editorからの手動適用も可能です。",
    );
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    // Supabase's documented Postgres.js setting: require encryption.
    // Projects that install the downloaded CA can opt into verify-full externally.
    ssl: "require",
  });
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(749128501)`;
      await tx`create schema if not exists saketan_private`;
      await tx`revoke all on schema saketan_private from public,anon,authenticated`;
      await tx`create table if not exists saketan_private.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now())`;
      const files = (
        await readdir(new URL("../supabase/migrations/", import.meta.url))
      )
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const file of files) {
        const source = await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        );
        const hash = createHash("sha256").update(source).digest("hex");
        const existing =
          await tx`select sha256 from saketan_private.migrations where name=${file}`;
        if (existing.length) {
          if (existing[0].sha256 !== hash)
            throw new Error("適用済みmigrationが変更されています: " + file);
          console.log("適用済み: " + file);
          continue;
        }
        await tx.unsafe(source);
        await tx`insert into saketan_private.migrations(name,sha256) values(${file},${hash})`;
        console.log("適用: " + file);
      }
    });
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "migrationに失敗しました");
  process.exitCode = 1;
});
