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
  sighting: string,
  brandRequest: string;
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
test("anonymous sessions can report availability and missing brands, but not edit masters or comment", async () => {
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
  brandRequest = await scalar(
    "select public.submit_brand_request('未登録酒','未登録酒造','店頭で確認',$1)",
    [shop],
  );
  assert.equal(
    await scalar("select status from public.brand_requests where id=$1", [
      brandRequest,
    ]),
    "pending",
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
test("even admins cannot create local brand masters", async () => {
  await asUser(admin);
  await assert.rejects(
    db.query(
      "select public.save_master('brand',null,'{\"name\":\"ローカル銘柄\"}')",
    ),
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
  await asUser(null);
  assert.equal(
    (await db.query("select * from public.search_brands('しけんしゅぞう')"))
      .rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from public.search_brands('しけんのさけ')")).rows
      .length,
    1,
  );
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
test("shop candidate search orders by distance and supports paging", async () => {
  await db.exec("reset role");
  await db.query(
    `insert into public.shops(name,name_kana,latitude,longitude) values
      ('距離順 遠い店','きょりじゅん とおいみせ',36,139),
      ('距離順 近い店','きょりじゅん ちかいみせ',35.001,139),
      ('距離順 中間店','きょりじゅん ちゅうかんみせ',35.1,139)`,
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
    favorite_shops: Array<{
      shop_id: string;
      shop_name: string;
      contribution_count: number;
    }>;
  }>("select public.get_my_contribution_summary()");
  assert.equal(summary.shop_brand_count, 2);
  assert.equal(summary.shop_count, 1);
  assert.equal(summary.resolved_brand_request_count, 0);
  assert.deepEqual(summary.favorite_shops, [
    {
      shop_id: shop,
      shop_name: "【テスト】酒屋",
      contribution_count: 2,
    },
  ]);

  await asUser(admin);
  await db.query("select public.review_brand_request($1,'resolved')", [
    brandRequest,
  ]);
  await asUser(guest);
  const guestSummary = await scalar<{
    shop_brand_count: number;
    resolved_brand_request_count: number;
    favorite_shops: unknown[];
  }>("select public.get_my_contribution_summary()");
  assert.equal(guestSummary.shop_brand_count, 1);
  assert.equal(guestSummary.resolved_brand_request_count, 1);
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
    ["brand_requests", "submitted_by"],
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
