import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const alice = "10000000-0000-4000-8000-000000000001",
  bob = "10000000-0000-4000-8000-000000000002",
  admin = "10000000-0000-4000-8000-000000000003",
  guest = "10000000-0000-4000-8000-000000000004";
let shop: string,
  brand: string,
  otherBrand: string,
  thirdBrand: string,
  invalidBrand: string,
  brewery: string,
  sighting: string;
async function scalar<T = string>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const { rows } = await db.query<Record<string, T>>(sql, params);
  return Object.values(rows[0])[0];
}
async function asUser(id: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec("set role " + (id ? "authenticated" : "anon"));
}
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',is_anonymous boolean not null default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const migration = await readFile(new URL(file, directory), "utf8");
    await db.exec(
      migration.replace("create extension if not exists pgcrypto;", ""),
    );
  }
  for (const [id, name] of [
    [alice, "Alice"],
    [bob, "Bob"],
    [admin, "Admin"],
    [guest, "Guest"],
  ])
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        id,
        name + "@example.invalid",
        JSON.stringify({ full_name: name, role: "admin" }),
      ],
    );
  await db.query("update auth.users set is_anonymous=true where id=$1", [
    guest,
  ]);
  await db.query("update public.users set role='admin' where id=$1", [admin]);
  await db.exec("reset role");
  brewery = await scalar(
    "insert into public.breweries(name,name_kana,prefecture,source,source_id) values('試験酒造','しけんしゅぞう','長野県','sakenowa','brewery-1') returning id",
  );
  brand = await scalar(
    "insert into public.brands(name,name_kana,brewery_id,source,source_id) values('試験の酒','しけんのさけ',$1,'sakenowa','brand-1') returning id",
    [brewery],
  );
  await scalar(
    "insert into public.brands(name,name_kana,source,source_id) values('作','ざく','sakenowa','brand-zaku') returning id",
  );
  otherBrand = await scalar(
    "insert into public.brands(name,source,source_id) values('別の試験酒','sakenowa','brand-2') returning id",
  );
  thirdBrand = await scalar(
    "insert into public.brands(name,source,source_id) values('三つ目の試験酒','sakenowa','brand-3') returning id",
  );
  invalidBrand = await scalar(
    "insert into public.brands(name,source,source_id) values('誤情報の試験酒','sakenowa','brand-4') returning id",
  );
  await asUser(alice);
  shop = await scalar("select public.save_master('shop',null,$1)", [
    JSON.stringify({
      name: "【テスト】酒屋",
      name_kana: "てすとさかや",
      prefecture: "東京都",
      city: "千代田区",
      latitude: 35.68,
      longitude: 139.76,
    }),
  ]);
});
after(() => db.close());
test("Google metadata cannot promote users; email is not public; raw writes denied", async () => {
  await asUser(alice);
  assert.equal(await scalar<boolean>("select public.is_admin()"), false);
  await assert.rejects(db.query("select email from public.users"));
  await assert.rejects(
    db.query("update public.users set role='admin' where id=$1", [alice]),
  );
  await assert.rejects(
    db.query("insert into public.brands(name) values('不正')"),
  );
});
test("legacy brand request intake has been removed", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar<string | null>("select to_regclass('public.brand_requests')"),
    null,
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname in ('submit_brand_request','review_brand_request')",
    ),
    0,
  );
});
test("shops do not store website URLs", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar<number>(
      "select count(*)::int from information_schema.columns where table_schema='public' and table_name='shops' and column_name='website_url'",
    ),
    0,
  );
  await asUser(alice);
  await assert.rejects(
    db.query("select public.save_master('shop',$1,$2)", [
      shop,
      JSON.stringify({ website_url: "https://example.com/" }),
    ]),
    /変更できない項目です: website_url/,
  );
});
test("anonymous browsing allowed, posting and master changes denied", async () => {
  await asUser(null);
  assert.equal(
    await scalar<number>("select count(*)::int from public.shops"),
    1,
  );
  await assert.rejects(
    db.query("select public.post_sighting($1,$2,'2026-01-02',null)", [
      shop,
      brand,
    ]),
  );
  await assert.rejects(
    db.query("select public.save_master('brand',null,'{\"name\":\"不正\"}')"),
  );
});
test("anonymous sessions can report availability, but not edit masters or comment", async () => {
  await asUser(guest);
  await db.query(
    "select public.set_shop_brand_status($1,$2,'available','店頭で確認')",
    [shop, otherBrand],
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::int from public.sightings s join public.shop_brands sb on sb.id=s.shop_brand_id where sb.shop_id=$1 and sb.brand_id=$2",
      [shop, otherBrand],
    ),
    0,
  );
  await db.query(
    "select public.set_shop_brand_status($1,$2,'unavailable','店頭で確認')",
    [shop, otherBrand],
  );
  assert.equal(
    await scalar(
      "select status from public.shop_brands where shop_id=$1 and brand_id=$2",
      [shop, otherBrand],
    ),
    "unavailable",
  );
  await assert.rejects(
    db.query("select public.save_master('shop',null,'{\"name\":\"不正\"}')"),
  );
  await assert.rejects(
    db.query("select public.post_shop_comment($1,'匿名コメント')", [shop]),
  );
});
test("signed-in users can only update brand and brewery kana through the public kana action", async () => {
  await asUser(null);
  await assert.rejects(
    db.query("select public.update_master_kana('brand',$1,'みっつめ','不正')", [
      thirdBrand,
    ]),
  );
  await asUser(guest);
  await assert.rejects(
    db.query("select public.update_master_kana('brand',$1,'みっつめ','不正')", [
      thirdBrand,
    ]),
    /ログインしてください/,
  );

  await asUser(alice);
  await assert.rejects(
    db.query("select public.update_master_kana('brand',$1,'みっつめ',null)", [
      thirdBrand,
    ]),
    /変更理由を入力してください/,
  );
  await assert.rejects(
    db.query(
      "select public.update_master_kana('brand',$1,'みっつめ','あああ')",
      [thirdBrand],
    ),
    /同じ文字の繰り返し/,
  );
  assert.equal(
    await scalar(
      "select public.update_master_kana('brand',$1,'  みっつめのしけんしゅ  ','読みを確認')",
      [thirdBrand],
    ),
    thirdBrand,
  );
  assert.equal(
    await scalar("select name_kana from public.brands where id=$1", [
      thirdBrand,
    ]),
    "みっつめのしけんしゅ",
  );
  assert.equal(
    await scalar(
      "select reason from public.change_histories where entity_id=$1 order by created_at desc limit 1",
      [thirdBrand],
    ),
    "読みを確認",
  );

  await asUser(bob);
  await db.query(
    "select public.update_master_kana('brewery',$1,'しけんしゅぞう','読みを確認')",
    [brewery],
  );
  await assert.rejects(
    db.query("select public.update_master_kana('shop',$1,'てすと','不正')", [
      shop,
    ]),
    /かなを編集できるのは銘柄と酒蔵のみです/,
  );

  await asUser(admin);
  assert.equal(
    await scalar(
      "select public.update_master_kana('brewery',$1,'しけんしゅぞう',null)",
      [brewery],
    ),
    brewery,
  );
});
test("brand applications are public, immediately attach to a shop, and can be approved", async () => {
  await asUser(guest);
  const pendingBrand = await scalar(
    "select public.submit_brand_application('申請中の酒','申請酒造','店頭で確認',$1)",
    [shop],
  );
  assert.equal(
    await scalar("select registration_status from public.brands where id=$1", [
      pendingBrand,
    ]),
    "pending",
  );
  assert.equal(
    await scalar(
      "select status from public.shop_brands where shop_id=$1 and brand_id=$2",
      [shop, pendingBrand],
    ),
    "available",
  );
  assert.equal(
    await scalar(
      "select reason from public.brand_applications where brand_id=$1",
      [pendingBrand],
    ),
    "店頭で確認",
  );

  await asUser(null);
  assert.equal(
    await scalar(
      "select requested_brewery_name from public.brands where id=$1",
      [pendingBrand],
    ),
    "申請酒造",
  );
  await assert.rejects(
    db.query("select reason from public.brand_applications where brand_id=$1", [
      pendingBrand,
    ]),
  );

  await asUser(admin);
  await assert.rejects(
    db.query("select public.review_brand_application($1,'approve',null)", [
      pendingBrand,
    ]),
    /先に酒蔵を登録するか、既存酒蔵を選択してください/,
  );
  assert.equal(
    await scalar(
      "select public.review_brand_application($1,'register_brewery',null,null,'申請酒造','しんせいしゅぞう','山形県','https://example.com/brewery')",
      [pendingBrand],
    ),
    pendingBrand,
  );
  assert.deepEqual(
    (
      await db.query(
        "select b.registration_status,w.name as brewery_name,w.name_kana as brewery_name_kana,w.prefecture,w.website_url,b.registered_at is not null as registered from public.brands b join public.breweries w on w.id=b.brewery_id where b.id=$1",
        [pendingBrand],
      )
    ).rows,
    [
      {
        registration_status: "pending",
        brewery_name: "申請酒造",
        brewery_name_kana: "しんせいしゅぞう",
        prefecture: "山形県",
        website_url: "https://example.com/brewery",
        registered: false,
      },
    ],
  );
  assert.equal(
    await scalar("select public.review_brand_application($1,'approve',null)", [
      pendingBrand,
    ]),
    pendingBrand,
  );
  assert.deepEqual(
    (
      await db.query(
        "select b.registration_status,w.name as brewery_name,w.name_kana as brewery_name_kana,w.prefecture,w.website_url,b.registered_at is not null as registered from public.brands b join public.breweries w on w.id=b.brewery_id where b.id=$1",
        [pendingBrand],
      )
    ).rows,
    [
      {
        registration_status: "approved",
        brewery_name: "申請酒造",
        brewery_name_kana: "しんせいしゅぞう",
        prefecture: "山形県",
        website_url: "https://example.com/brewery",
        registered: true,
      },
    ],
  );
  await db.query(
    "select public.set_shop_brand_status($1,$2,'incorrect','テスト後に無効化')",
    [shop, pendingBrand],
  );
  await db.query(
    "select public.save_master('brand',$1,'{\"is_active\":false}','テスト後に無効化')",
    [pendingBrand],
  );
});
test("brand applications retain kana and an existing brewery selection", async () => {
  await asUser(bob);
  const pendingBrand = await scalar(
    "select public.submit_brand_application_v2('かな申請の酒','かな しんせいのさけ',$1,'未使用の酒蔵名','候補を選択',$2)",
    [brewery, shop],
  );
  assert.deepEqual(
    (
      await db.query(
        "select name_kana,brewery_id,requested_brewery_name from public.brands where id=$1",
        [pendingBrand],
      )
    ).rows,
    [
      {
        name_kana: "かな しんせいのさけ",
        brewery_id: brewery,
        requested_brewery_name: null,
      },
    ],
  );

  await asUser(admin);
  await db.query("select public.review_brand_application($1,'approve',null)", [
    pendingBrand,
  ]);
  assert.deepEqual(
    (
      await db.query(
        "select name_kana,brewery_id,requested_brewery_name from public.brands where id=$1",
        [pendingBrand],
      )
    ).rows,
    [
      {
        name_kana: "かな しんせいのさけ",
        brewery_id: brewery,
        requested_brewery_name: null,
      },
    ],
  );
  await db.query(
    "select public.set_shop_brand_status($1,$2,'incorrect','テスト後に無効化')",
    [shop, pendingBrand],
  );
  await db.query(
    "select public.save_master('brand',$1,'{\"is_active\":false}','テスト後に無効化')",
    [pendingBrand],
  );
});
test("admin can resolve a typed brewery name to an existing brewery", async () => {
  await asUser(bob);
  const pendingBrand = await scalar(
    "select public.submit_brand_application('既存酒蔵選択酒','入力された別の酒蔵名','既存酒蔵へ紐付け',$1)",
    [shop],
  );
  await asUser(admin);
  assert.equal(
    await scalar(
      "select public.review_brand_application($1,'approve',null,$2)",
      [pendingBrand, brewery],
    ),
    pendingBrand,
  );
  assert.deepEqual(
    (
      await db.query(
        "select brewery_id,requested_brewery_name,registration_status from public.brands where id=$1",
        [pendingBrand],
      )
    ).rows,
    [
      {
        brewery_id: brewery,
        requested_brewery_name: null,
        registration_status: "approved",
      },
    ],
  );
  await db.query(
    "select public.set_shop_brand_status($1,$2,'incorrect','テスト後に無効化')",
    [shop, pendingBrand],
  );
  await db.query(
    "select public.save_master('brand',$1,'{\"is_active\":false}','テスト後に無効化')",
    [pendingBrand],
  );
});
test("admin can merge a pending brand while retaining its shop relation", async () => {
  await asUser(bob);
  const pendingBrand = await scalar(
    "select public.submit_brand_application('別表記の試験酒','試験酒造','既存銘柄かもしれない',$1)",
    [shop],
  );
  await asUser(admin);
  assert.equal(
    await scalar("select public.review_brand_application($1,'merge',$2)", [
      pendingBrand,
      otherBrand,
    ]),
    otherBrand,
  );
  assert.deepEqual(
    (
      await db.query(
        "select registration_status,is_active,merged_into_brand_id from public.brands where id=$1",
        [pendingBrand],
      )
    ).rows,
    [
      {
        registration_status: "merged",
        is_active: false,
        merged_into_brand_id: otherBrand,
      },
    ],
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from public.shop_brands where shop_id=$1 and brand_id=$2",
      [shop, otherBrand],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select status from public.shop_brands where shop_id=$1 and brand_id=$2",
      [shop, otherBrand],
    ),
    "available",
  );
  await db.query(
    "select public.set_shop_brand_status($1,$2,'unavailable','テスト状態を復元')",
    [shop, otherBrand],
  );
});
test("admin can merge an approved brand from the brand status workflow", async () => {
  await db.exec("reset role");
  const registeredSource = await scalar(
    "insert into public.brands(name,source,source_id) values('登録済みの別表記','sakenowa','brand-approved-merge') returning id",
  );
  await db.query(
    "insert into public.shop_brands(shop_id,brand_id,created_by,status,is_active,first_seen_at,last_seen_at) values($1,$2,$3,'available',true,'2026-10-01','2026-10-01')",
    [shop, registeredSource, admin],
  );

  await asUser(admin);
  assert.equal(
    await scalar("select public.review_brand_application($1,'merge',$2)", [
      registeredSource,
      otherBrand,
    ]),
    otherBrand,
  );
  assert.deepEqual(
    (
      await db.query(
        "select registration_status,is_active,merged_into_brand_id from public.brands where id=$1",
        [registeredSource],
      )
    ).rows,
    [
      {
        registration_status: "merged",
        is_active: false,
        merged_into_brand_id: otherBrand,
      },
    ],
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from public.shop_brands where shop_id=$1 and brand_id=$2",
      [shop, otherBrand],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select status from public.shop_brands where shop_id=$1 and brand_id=$2",
      [shop, otherBrand],
    ),
    "available",
  );
});
test("signed-in users can restore only the kana from the latest matching history", async () => {
  await db.exec("reset role");
  const kanaBrand = await scalar(
    "insert into public.brands(name,name_kana,source,source_id) values('かな復元酒','もとのかな','sakenowa','kana-restore') returning id",
  );
  await asUser(alice);
  await db.query(
    "select public.update_master_kana('brand',$1,'あとのかな','読みを修正')",
    [kanaBrand],
  );
  const historyId = await scalar(
    "select id from public.change_histories where entity_type='brand' and entity_id=$1 order by created_at desc limit 1",
    [kanaBrand],
  );
  await asUser(bob);
  assert.equal(
    await scalar("select public.restore_master_kana($1)", [historyId]),
    kanaBrand,
  );
  assert.equal(
    await scalar("select name_kana from public.brands where id=$1", [
      kanaBrand,
    ]),
    "もとのかな",
  );
  await assert.rejects(
    db.query("select public.restore_master_kana($1)", [historyId]),
    /この後にかなが変更されています/,
  );
});
test("latest shop comments are returned once per shop and omit deleted comments", async () => {
  await asUser(alice);
  const first = await scalar(
    "select public.post_shop_comment($1,'最初のコメント')",
    [shop],
  );
  await asUser(bob);
  const latest = await scalar(
    "select public.post_shop_comment($1,'最新のコメント')",
    [shop],
  );
  await db.exec("reset role");
  await db.query(
    "update public.shop_comments set created_at=case when id=$1 then now()-interval '1 day' else now() end where id in ($1,$2)",
    [first, latest],
  );
  await asUser(null);
  assert.deepEqual(
    (
      await db.query(
        "select comment,user_name,comment_count::int from public.latest_shop_comments(array[$1::uuid])",
        [shop],
      )
    ).rows,
    [{ comment: "最新のコメント", user_name: "Bob", comment_count: 2 }],
  );
  await asUser(bob);
  await db.query("select public.edit_shop_comment($1,'最新のコメント',true)", [
    latest,
  ]);
  await asUser(null);
  assert.deepEqual(
    (
      await db.query(
        "select comment,user_name,comment_count::int from public.latest_shop_comments(array[$1::uuid])",
        [shop],
      )
    ).rows,
    [{ comment: "最初のコメント", user_name: "Alice", comment_count: 1 }],
  );
});
test("display names remain custom after provider metadata refresh", async () => {
  await asUser(alice);
  assert.equal(
    await scalar("select public.update_display_name('  好みの名前  ')"),
    "好みの名前",
  );
  await db.exec("reset role");
  await db.query(
    'update auth.users set raw_user_meta_data=\'{"full_name":"Provider Name"}\' where id=$1',
    [alice],
  );
  assert.equal(
    await scalar("select name from public.users where id=$1", [alice]),
    "好みの名前",
  );
});
test("admins can create local brewery and brand masters", async () => {
  await asUser(admin);
  const localBrewery = await scalar(
    "select public.save_master('brewery',null,$1)",
    [
      JSON.stringify({
        name: "ローカル酒造",
        name_kana: "ろーかるしゅぞう",
        prefecture: "長野県",
      }),
    ],
  );
  const localBrand = await scalar(
    "select public.save_master('brand',null,$1)",
    [
      JSON.stringify({
        name: "ローカル銘柄",
        name_kana: "ろーかるめいがら",
        brewery_id: localBrewery,
      }),
    ],
  );
  assert.equal(
    await scalar("select name from public.breweries where id=$1", [
      localBrewery,
    ]),
    "ローカル酒造",
  );
  assert.equal(
    await scalar("select brewery_id from public.brands where id=$1", [
      localBrand,
    ]),
    localBrewery,
  );
  await asUser(alice);
  await assert.rejects(
    db.query("select public.save_master('brand',null,$1)", [
      JSON.stringify({ name: "利用者作成銘柄" }),
    ]),
  );
});
test("posting creates relation atomically, out-of-order posts aggregate min/max without duplicates", async () => {
  await asUser(alice);
  sighting = await scalar(
    "select public.post_sighting($1,$2,'2026-01-10','発見しました')",
    [shop, brand],
  );
  await db.query("select public.post_sighting($1,$2,'2026-01-02',null)", [
    shop,
    brand,
  ]);
  await db.query("select public.post_sighting($1,$2,'2026-01-20',null)", [
    shop,
    brand,
  ]);
  const { rows } = await db.query<{
    first: string;
    last: string;
    count: number;
  }>(
    "select min(first_seen_at)::text first,max(last_seen_at)::text last,count(*)::int count from public.shop_brands where shop_id=$1 and brand_id=$2",
    [shop, brand],
  );
  assert.deepEqual(rows[0], {
    first: "2026-01-02",
    last: "2026-01-20",
    count: 1,
  });
});
test("shop brand previews return the total with only the requested top rows", async () => {
  await db.exec("reset role");
  await db.query(
    "update public.shop_brands set is_active=true,status='available' where shop_id=$1 and brand_id=$2",
    [shop, otherBrand],
  );
  await asUser(alice);
  const { rows } = await db.query<{
    shop_id: string;
    total: bigint;
    brand_id: string;
    brand_name: string;
  }>(
    "select shop_id,total,brand_id,brand_name from public.shop_brand_previews(array[$1]::uuid[],1)",
    [shop],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].shop_id, shop);
  assert.equal(Number(rows[0].total), 1);
  assert.equal(rows[0].brand_id, brand);
  assert.equal(rows[0].brand_name, "試験の酒");
  await db.exec("reset role");
  await db.query(
    "update public.shop_brands set is_active=false,status='unavailable' where shop_id=$1 and brand_id=$2",
    [shop, otherBrand],
  );
});
test("shop brand totals include requested shops with no active brands", async () => {
  await db.exec("reset role");
  const emptyShop = await scalar(
    "insert into public.shops(name,name_kana,latitude,longitude) values('銘柄なし酒店','めいがらなしさけてん',35.6,139.7) returning id",
  );
  await asUser(alice);
  const { rows } = await db.query<{ shop_id: string; total: bigint }>(
    "select * from public.shop_brand_totals(array[$1,$2]::uuid[]) order by shop_id",
    [shop, emptyShop],
  );
  assert.deepEqual(
    new Map(rows.map((row) => [row.shop_id, Number(row.total)])),
    new Map([
      [shop, 1],
      [emptyShop, 0],
    ]),
  );
});
test("invalid sighting rolls back relation and audit history", async () => {
  await asUser(alice);
  const count = await scalar<number>(
    "select count(*)::int from public.change_histories",
  );
  const relationCount = await scalar<number>(
    "select count(*)::int from public.shop_brands where brand_id=$1",
    [otherBrand],
  );
  await assert.rejects(
    db.query("select public.post_sighting($1,$2,'2026-01-10',$3)", [
      shop,
      otherBrand,
      "x".repeat(1001),
    ]),
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::int from public.shop_brands where brand_id=$1",
      [otherBrand],
    ),
    relationCount,
  );
  assert.equal(
    await scalar("select status from public.shop_brands where brand_id=$1", [
      otherBrand,
    ]),
    "unavailable",
  );
  assert.equal(
    await scalar<number>("select count(*)::int from public.change_histories"),
    count,
  );
  await assert.rejects(
    db.query("select public.post_sighting($1,$2,'2999-01-01',null)", [
      shop,
      brand,
    ]),
  );
});
test("brand, kana, brewery and shop search; bounds and brand filters", async () => {
  await asUser(guest);
  const searchablePendingBrand = await scalar(
    "select public.submit_brand_application('検索中の申請','検索用酒造',null,$1)",
    [shop],
  );
  const kanaVariantBrand = await scalar(
    "select public.submit_brand_application_v2('づ検索銘柄','つづきのさけ',null,'検索用酒造','かな検索の確認',$1)",
    [shop],
  );
  await asUser(null);
  assert.equal(
    (await db.query("select * from public.search_brands('しけんしゅぞう')"))
      .rows.length,
    1,
  );
  assert.equal(
    (
      await db.query<{ name: string }>(
        "select name from public.search_brands('つずきのさけ')",
      )
    ).rows.some(({ name }) => name === "づ検索銘柄"),
    true,
  );
  assert.equal(
    (
      await db.query<{ name: string }>(
        "select name from public.search_brands('ざく')",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.search_brands('しけんのさけ')")).rows
      .length,
    1,
  );
  assert.deepEqual(
    (
      await db.query<{ name: string; registration_status: string }>(
        "select name,registration_status from public.search_brands('検索中の申請')",
      )
    ).rows,
    [{ name: "検索中の申請", registration_status: "pending" }],
  );
  await asUser(admin);
  await db.query("select public.review_brand_application($1,'reject',null)", [
    searchablePendingBrand,
  ]);
  await db.query("select public.review_brand_application($1,'reject',null)", [
    kanaVariantBrand,
  ]);
  await asUser(null);
  assert.equal(
    (await db.query("select * from public.search_shops('てすと')")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from public.search_shops('', $1)", [brand])).rows
      .length,
    1,
  );
  assert.equal(
    (await db.query("select * from public.search_shops('', $1)", [otherBrand]))
      .rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.search_shops('', null, 40, 41, 139, 140)",
      )
    ).rows.length,
    0,
  );
});
test("map search returns all matches beyond 1000 and respects bounds", async () => {
  await db.exec("reset role; begin");
  try {
    await db.exec(`
      insert into public.shops(name,name_kana,latitude,longitude)
      select '上限確認店' || n,'じょうげんかくにん',35,139
      from generate_series(1,200) n;
      insert into public.shops(name,name_kana,latitude,longitude,is_active)
      values ('上限確認店 範囲外','じょうげんかくにん',40,140,true),
             ('上限確認店 無効','じょうげんかくにん',35,139,false);
    `);
    const matchCount = () =>
      scalar<number>(
        "select count(*)::integer from public.search_shops('上限確認店',null,34,36,138,140)",
      );
    await asUser(null);
    assert.equal(await matchCount(), 200);
    await db.exec("reset role");
    await db.exec(`
      insert into public.shops(name,name_kana,latitude,longitude)
      values ('上限確認店201','じょうげんかくにん',35,139);
    `);
    await asUser(null);
    assert.equal(await matchCount(), 201);
    await db.exec("reset role");
    await db.exec(`
      insert into public.shops(name,name_kana,latitude,longitude)
      values ('上限確認店202','じょうげんかくにん',35,139);
    `);
    await asUser(null);
    assert.equal(await matchCount(), 202);
    await db.exec("reset role");
    await db.exec(`
      insert into public.shops(name,name_kana,latitude,longitude)
      select '上限確認店' || n,'じょうげんかくにん',35,139
      from generate_series(203,1201) n;
    `);
    await asUser(null);
    assert.equal(await matchCount(), 1201);
    assert.equal(
      await scalar<number>(
        "select count(*)::integer from public.search_shops('上限確認店',$1,34,36,138,140)",
        [brand],
      ),
      0,
    );
  } finally {
    await db.exec("rollback; reset role");
  }
});
test("shop candidate search orders by distance and supports paging", async () => {
  await db.exec("reset role");
  await db.query(
    `insert into public.shops(name,name_kana,latitude,longitude) values
      ('距離順 遠い店','きょりじゅん とおいみせ',36,139),
      ('距離順 近い店','きょりじゅん ちかいみせ',35.001,139),
      ('距離順 中間店','きょりじゅん ちゅうかんみせ',35.1,139),
      ('づ表記店','つづきのみせ',35,139)`,
  );
  await asUser(null);

  const firstPage = await db.query<{ name: string }>(
    "select name from public.search_shop_candidates('距離順',35,139,2,0)",
  );
  const secondPage = await db.query<{ name: string }>(
    "select name from public.search_shop_candidates('距離順',35,139,2,2)",
  );

  assert.deepEqual(
    firstPage.rows.map(({ name }) => name),
    ["距離順 近い店", "距離順 中間店"],
  );
  assert.deepEqual(
    secondPage.rows.map(({ name }) => name),
    ["距離順 遠い店"],
  );
  assert.deepEqual(
    (
      await db.query<{ name: string }>(
        "select name from public.search_shop_candidates('つずき',35,139,2,0)",
      )
    ).rows.map(({ name }) => name),
    ["づ表記店"],
  );
});
test("only owner/admin can edit sighting; dates recompute on edit and soft delete", async () => {
  await asUser(bob);
  await assert.rejects(
    db.query("select public.edit_sighting($1,'2026-01-01','不正',false)", [
      sighting,
    ]),
  );
  await asUser(alice);
  await db.query("select public.edit_sighting($1,'2026-01-01','修正',false)", [
    sighting,
  ]);
  assert.equal(
    await scalar(
      "select first_seen_at::text from public.shop_brands where brand_id=$1",
      [brand],
    ),
    "2026-01-01",
  );
  await db.query("select public.edit_sighting($1,'2026-01-01','修正',true)", [
    sighting,
  ]);
  assert.equal(
    await scalar(
      "select first_seen_at::text from public.shop_brands where brand_id=$1",
      [brand],
    ),
    "2026-01-02",
  );
  await asUser(null);
  assert.equal(
    (await db.query("select * from public.sightings where id=$1", [sighting]))
      .rows.length,
    0,
  );
});
test("master edits append history; source metadata and unsupported entity fields rejected", async () => {
  await asUser(alice);
  await db.query(
    "select public.save_master('shop',$1,'{\"name\":\"更新したテスト酒屋\"}','名前を修正')",
    [shop],
  );
  assert.equal(
    await scalar(
      "select after_data->>'name' from public.change_histories where entity_id=$1 order by created_at desc limit 1",
      [shop],
    ),
    "更新したテスト酒屋",
  );
  await assert.rejects(
    db.query("select public.save_master('brand',$1,'{\"source\":\"fake\"}')", [
      brand,
    ]),
  );
  await assert.rejects(
    db.query(
      "select public.save_master('shop_brand',$1,'{\"is_active\":false}')",
      [shop],
    ),
  );
});
test("only the registering user or an administrator can deactivate a shop", async () => {
  await asUser(bob);
  await assert.rejects(
    db.query("select public.save_master('shop',$1,'{\"is_active\":false}')", [
      shop,
    ]),
    /登録者または管理者/,
  );
  assert.equal(
    await scalar<boolean>("select is_active from public.shops where id=$1", [
      shop,
    ]),
    true,
  );

  await asUser(alice);
  await assert.rejects(
    db.query("select public.save_master('shop',$1,'{\"is_active\":false}')", [
      shop,
    ]),
    /変更理由を入力してください/,
  );
  await assert.rejects(
    db.query(
      "select public.save_master('shop',$1,'{\"is_active\":false}','あああ')",
      [shop],
    ),
    /同じ文字の繰り返し/,
  );
  await db.query(
    "select public.save_master('shop',$1,'{\"is_active\":false}','閉店を確認')",
    [shop],
  );
  assert.equal(
    await scalar<boolean>("select is_active from public.shops where id=$1", [
      shop,
    ]),
    false,
  );

  await asUser(admin);
  await db.query(
    "select public.save_master('shop',$1,'{\"is_active\":true}')",
    [shop],
  );
  assert.equal(
    await scalar<boolean>("select is_active from public.shops where id=$1", [
      shop,
    ]),
    true,
  );
});
test("history pages exclude administrator edits by default and can include all users", async () => {
  await asUser(admin);
  const historyShop = await scalar(
    "select public.save_master('shop',null,$1,'管理者が登録')",
    [
      JSON.stringify({
        name: "履歴フィルター酒店",
        name_kana: "りれきふぃるたーさけてん",
        prefecture: "東京都",
        city: "台東区",
        latitude: 35.71,
        longitude: 139.78,
      }),
    ],
  );
  await asUser(bob);
  await db.query(
    "select public.save_master('shop',$1,'{\"name\":\"履歴フィルター酒店・利用者更新\"}','利用者が更新')",
    [historyShop],
  );
  await asUser(admin);
  await db.query(
    "select public.save_master('shop',$1,'{\"name\":\"履歴フィルター酒店・管理者更新\"}','管理者が更新')",
    [historyShop],
  );

  await asUser(null);
  const nonAdmin = await db.query<{
    user_name: string;
    total_count: number;
  }>(
    "select user_name,total_count::integer from public.history_page('shop',$1,null,false,0,30)",
    [historyShop],
  );
  assert.equal(nonAdmin.rows.length, 1);
  assert.equal(nonAdmin.rows[0].user_name, "Bob");
  assert.equal(nonAdmin.rows[0].total_count, 1);

  const allUsers = await db.query<{ total_count: number }>(
    "select total_count::integer from public.history_page('shop',$1,null,true,0,30)",
    [historyShop],
  );
  assert.equal(allUsers.rows.length, 3);
  assert.ok(allUsers.rows.every((row) => row.total_count === 3));
});
test("admin restore adds immutable history, ordinary users denied", async () => {
  const history = await scalar(
    "select id from public.change_histories where entity_id=$1 and action='create'",
    [shop],
  );
  await asUser(alice);
  await assert.rejects(
    db.query("select public.restore_history($1)", [history]),
  );
  await asUser(admin);
  await db.query("select public.restore_history($1)", [history]);
  assert.equal(
    await scalar("select name from public.shops where id=$1", [shop]),
    "【テスト】酒屋",
  );
  assert.equal(
    await scalar(
      "select action from public.change_histories where entity_id=$1 order by created_at desc limit 1",
      [shop],
    ),
    "restore",
  );
  await assert.rejects(
    db.query("delete from public.change_histories where id=$1", [history]),
  );
  await db.exec("reset role");
  await assert.rejects(
    db.query("delete from public.change_histories where id=$1", [history]),
  );
});
test("deactivated masters cannot receive posts, and disappear from search", async () => {
  await asUser(admin);
  await db.query(
    "select public.save_master('brand',$1,'{\"is_active\":false}')",
    [brand],
  );
  assert.equal(
    (await db.query("select * from public.search_shops('', $1)", [brand])).rows
      .length,
    0,
  );
  await assert.rejects(
    db.query("select public.post_sighting($1,$2,'2026-01-15',null)", [
      shop,
      brand,
    ]),
  );
  await db.query(
    "select public.save_master('brand',$1,'{\"is_active\":true}')",
    [brand],
  );
});
test("posting reactivates an existing relation and keeps unique identity", async () => {
  await db.exec("reset role");
  await db.query(
    "update public.shop_brands set is_active=false,status='unavailable' where brand_id=$1",
    [brand],
  );
  const id = await scalar(
    "select id from public.shop_brands where brand_id=$1",
    [brand],
  );
  await asUser(alice);
  await db.query("select public.post_sighting($1,$2,'2026-01-25',null)", [
    shop,
    brand,
  ]);
  assert.equal(
    await scalar(
      "select id from public.shop_brands where brand_id=$1 and is_active",
      [brand],
    ),
    id,
  );
});

test("any authenticated session can set the three shop-brand statuses", async () => {
  await asUser(null);
  await assert.rejects(
    db.query("select public.set_shop_brand_status($1,$2,'unavailable')", [
      shop,
      brand,
    ]),
  );
  await asUser(bob);
  await db.query(
    "select public.set_shop_brand_status($1,$2,'unavailable','現在は見当たらない')",
    [shop, brand],
  );
  assert.deepEqual(
    (
      await db.query(
        "select status,is_active from public.shop_brands where shop_id=$1 and brand_id=$2",
        [shop, brand],
      )
    ).rows[0],
    { status: "unavailable", is_active: false },
  );
  await asUser(guest);
  await db.query(
    "select public.set_shop_brand_status($1,$2,'incorrect','誤登録')",
    [shop, brand],
  );
  assert.equal(
    await scalar(
      "select status from public.shop_brands where shop_id=$1 and brand_id=$2",
      [shop, brand],
    ),
    "incorrect",
  );
  await asUser(alice);
  await db.query("select public.set_shop_brand_status($1,$2,'available')", [
    shop,
    brand,
  ]);
});

test("signed-in users can copy available brands without overwriting target data", async () => {
  await db.exec("reset role");
  const copyBrandOne = await scalar(
    "insert into public.brands(name,source,source_id) values('コピー酒一','sakenowa','copy-brand-1') returning id",
  );
  const copyBrandTwo = await scalar(
    "insert into public.brands(name,source,source_id) values('コピー酒二','sakenowa','copy-brand-2') returning id",
  );
  await asUser(bob);
  const copySource = await scalar("select public.save_master('shop',null,$1)", [
    JSON.stringify({
      name: "コピー元酒店",
      name_kana: "こぴーもとさけてん",
      prefecture: "東京都",
      city: "中央区",
      latitude: 35.67,
      longitude: 139.77,
    }),
  ]);
  const copyTargetOne = await scalar(
    "select public.save_master('shop',null,$1)",
    [
      JSON.stringify({
        name: "コピー先一号店",
        name_kana: "こぴーさきいちごうてん",
        prefecture: "東京都",
        city: "港区",
        latitude: 35.66,
        longitude: 139.75,
      }),
    ],
  );
  const copyTargetTwo = await scalar(
    "select public.save_master('shop',null,$1)",
    [
      JSON.stringify({
        name: "コピー先二号店",
        name_kana: "こぴーさきにごうてん",
        prefecture: "東京都",
        city: "新宿区",
        latitude: 35.69,
        longitude: 139.7,
      }),
    ],
  );

  await db.query("select public.post_sighting($1,$2,'2026-09-01',null)", [
    copySource,
    copyBrandOne,
  ]);
  await db.query("select public.set_shop_brand_status($1,$2,'available')", [
    copySource,
    copyBrandTwo,
  ]);
  await db.query("select public.set_shop_brand_status($1,$2,'available')", [
    copyTargetOne,
    copyBrandOne,
  ]);
  await db.query("select public.set_shop_brand_status($1,$2,'incorrect')", [
    copyTargetOne,
    copyBrandOne,
  ]);

  const preview = await scalar<{
    source_count: number;
    target_count: number;
    add_count: number;
    skip_count: number;
  }>("select public.preview_shop_brand_copy($1,$2)", [
    copySource,
    [copyTargetOne, copyTargetTwo],
  ]);
  assert.deepEqual(
    {
      source_count: preview.source_count,
      target_count: preview.target_count,
      add_count: preview.add_count,
      skip_count: preview.skip_count,
    },
    { source_count: 2, target_count: 2, add_count: 3, skip_count: 1 },
  );

  const result = await scalar<{ copied_count: number; skip_count: number }>(
    "select public.copy_shop_brands($1,$2)",
    [copySource, [copyTargetOne, copyTargetTwo]],
  );
  assert.equal(result.copied_count, 3);
  assert.equal(result.skip_count, 1);
  assert.equal(
    await scalar(
      "select status from public.shop_brands where shop_id=$1 and brand_id=$2",
      [copyTargetOne, copyBrandOne],
    ),
    "incorrect",
  );
  assert.deepEqual(
    (
      await db.query(
        "select first_seen_at,last_seen_at from public.shop_brands where shop_id=$1 and brand_id=$2",
        [copyTargetTwo, copyBrandOne],
      )
    ).rows[0],
    { first_seen_at: null, last_seen_at: null },
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from public.sightings s join public.shop_brands sb on sb.id=s.shop_brand_id where sb.shop_id=any($1::uuid[])",
      [[copyTargetOne, copyTargetTwo]],
    ),
    0,
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from public.change_histories where changed_by=$1 and reason='取扱銘柄一括コピー: コピー元酒店からコピー'",
      [bob],
    ),
    3,
  );

  const repeated = await scalar<{ copied_count: number; skip_count: number }>(
    "select public.copy_shop_brands($1,$2)",
    [copySource, [copyTargetOne, copyTargetTwo]],
  );
  assert.equal(repeated.copied_count, 0);
  assert.equal(repeated.skip_count, 4);

  await asUser(guest);
  await assert.rejects(
    db.query("select public.copy_shop_brands($1,$2)", [
      copySource,
      [copyTargetOne],
    ]),
    /ログインしてください/,
  );
});

test("account contribution summary excludes incorrect data and finds favorite shops", async () => {
  await asUser(alice);
  await db.query("select public.set_shop_brand_status($1,$2,'available')", [
    shop,
    thirdBrand,
  ]);
  await db.query("select public.set_shop_brand_status($1,$2,'available')", [
    shop,
    invalidBrand,
  ]);
  await db.query("select public.set_shop_brand_status($1,$2,'incorrect')", [
    shop,
    invalidBrand,
  ]);
  const summary = await scalar<{
    shop_brand_count: number;
    shop_count: number;
    resolved_brand_request_count: number;
    approved_brand_application_count: number;
    favorite_shops: Array<{
      shop_id: string;
      shop_name: string;
      contribution_count: number;
    }>;
  }>("select public.get_my_contribution_summary()");
  assert.equal(summary.shop_brand_count, 2);
  assert.equal(summary.shop_count, 1);
  assert.equal(summary.resolved_brand_request_count, 0);
  assert.equal(summary.approved_brand_application_count, 0);
  assert.deepEqual(summary.favorite_shops, [
    {
      shop_id: shop,
      shop_name: "【テスト】酒屋",
      contribution_count: 2,
    },
  ]);

  await asUser(guest);
  const guestSummary = await scalar<{
    shop_brand_count: number;
    approved_brand_application_count: number;
    favorite_shops: unknown[];
  }>("select public.get_my_contribution_summary()");
  assert.equal(guestSummary.shop_brand_count, 1);
  assert.equal(guestSummary.approved_brand_application_count, 1);
  assert.deepEqual(guestSummary.favorite_shops, []);
  await asUser(null);
  await assert.rejects(db.query("select public.get_my_contribution_summary()"));
});

test("source shops without required search fields stay out of search results", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into public.shops(name,prefecture,city,latitude,longitude,source,source_id,source_url) values('取込酒店','北海道',null,null,null,'sakeno.com','999','https://www.sakeno.com/sakaya/999/')",
  );
  await asUser(null);
  assert.equal(
    (await db.query("select * from public.search_shops('取込酒店')")).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.search_shops('',null,34,36,138,140) where name='取込酒店'",
      )
    ).rows.length,
    0,
  );
});

test("Google geocodes receive a server timestamp and expire from bounded map results", async () => {
  await asUser(alice);
  const googleShop = await scalar("select public.save_master('shop',null,$1)", [
    JSON.stringify({
      name: "Google位置テスト店",
      name_kana: "ぐーぐるいちてすとてん",
      prefecture: "東京都",
      city: "千代田区",
      latitude: 35.681,
      longitude: 139.767,
      geocode_source: "google",
      geocode_precision: "ROOFTOP",
    }),
  ]);
  assert.equal(
    await scalar<string>(
      "select case when geocoded_at is not null then 'yes' else 'no' end from public.shops where id=$1",
      [googleShop],
    ),
    "yes",
  );
  assert.equal(
    (
      await db.query(
        "select * from public.search_shops('',null,35,36,139,140) where id=$1",
        [googleShop],
      )
    ).rows.length,
    1,
  );
  await db.exec("reset role");
  await db.query(
    "update public.shops set geocoded_at=now()-interval '31 days' where id=$1",
    [googleShop],
  );
  await asUser(null);
  assert.equal(
    (
      await db.query(
        "select * from public.search_shops('',null,35,36,139,140) where id=$1",
        [googleShop],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.search_shops('Google位置テスト店') where id=$1",
        [googleShop],
      )
    ).rows.length,
    1,
  );
});

test("anonymous contributions can be claimed by an existing account exactly once", async () => {
  await asUser(guest);
  const token = await scalar(
    "select public.begin_anonymous_account_transfer()",
  );
  const historyCount = await scalar<number>(
    "select count(*)::integer from public.change_histories",
  );

  await asUser(alice);
  assert.equal(
    await scalar("select public.claim_anonymous_account_transfer($1)", [token]),
    guest,
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from public.change_histories",
    ),
    historyCount,
  );
  for (const [table, column] of [
    ["shop_brands", "created_by"],
    ["sightings", "user_id"],
    ["change_histories", "changed_by"],
  ])
    assert.equal(
      await scalar<number>(
        `select count(*)::integer from public.${table} where ${column}=$1`,
        [guest],
      ),
      0,
    );
  await assert.rejects(
    db.query("select public.claim_anonymous_account_transfer($1)", [token]),
    /引き継ぎ情報が見つかりません/,
  );
});

test("approved shop product imports are atomic, repeatable, and keep private provenance", async () => {
  await db.exec("reset role");
  const importedBrand = await scalar(
    "insert into public.brands(name,source,source_id) values('公式サイト取込酒','sakenowa','import-brand-1') returning id",
  );
  await db.exec("set role service_role");
  const payload = JSON.stringify([
    {
      brand_id: importedBrand,
      source_name: "公式サイト取込酒 純米 720ml",
      source_url: "https://shop.example/products/1",
    },
  ]);
  const first = await scalar<{
    import_id: string;
    added_brands: number;
    approved_items: number;
  }>("select public.import_shop_products($1,$2,$3,$4,$5)", [
    shop,
    "https://shop.example/products",
    "2026-09-16T00:00:00.000Z",
    "a".repeat(64),
    payload,
  ]);
  assert.equal(first.added_brands, 1);
  assert.equal(first.approved_items, 1);

  const second = await scalar<{
    import_id: string;
    added_brands: number;
    unchanged_brands: number;
  }>("select public.import_shop_products($1,$2,$3,$4,$5)", [
    shop,
    "https://shop.example/products",
    "2026-09-16T00:00:00.000Z",
    "a".repeat(64),
    payload,
  ]);
  assert.equal(second.added_brands, 0);
  assert.equal(second.unchanged_brands, 1);

  await db.exec("reset role");
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from public.shop_brands where shop_id=$1 and brand_id=$2 and status='available'",
      [shop, importedBrand],
    ),
    1,
  );
  assert.equal(
    await scalar<number>(
      "select count(*)::integer from public.shop_product_import_items where import_id in ($1,$2)",
      [first.import_id, second.import_id],
    ),
    2,
  );
  await asUser(alice);
  await assert.rejects(db.query("select * from public.shop_product_imports"));
});
