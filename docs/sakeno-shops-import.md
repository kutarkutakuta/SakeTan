# 日本酒物語 酒屋データ初回インポート設計

## 1. 目的

日本酒物語の都道府県別「日本酒が買える店」ページから、47都道府県の酒屋情報を初回のみ取得し、`shops` の初期データとしてSupabaseへ登録する。

通常のアプリ処理とは分離する。

```text
scripts/
  import-sakeno-shops.ts
```

実行：

```bash
npm run import:sakeno-shops
```

---

## 2. 全体処理

```text
47都道府県URL
   ↓
HTML取得
   ↓
raw HTML保存
   ↓
店舗情報抽出
   ↓
正規化
   ↓
バリデーション
   ↓
重複排除
   ↓
Supabaseへupsert
```

HTML取得とDB登録を直接つなげない。

途中データを保存して、解析処理だけ何度でもやり直せるようにする。

---

## 3. URL管理

都道府県コードを固定配列で管理する。

```ts
const prefectures = [
  { id: 1, name: "北海道" },
  { id: 2, name: "青森県" },
  // ...
  { id: 47, name: "沖縄県" },
];
```

URL：

```text
https://www.sakeno.com/sakaya_todou/{id}/
```

URL生成を1か所に集約する。

---

## 4. Raw HTMLを保存する

取得直後に解析せず、一度保存する。

例：

```text
data/sakeno/raw/
  01-hokkaido.html
  02-aomori.html
  ...
  47-okinawa.html
```

利点：

- 解析失敗時に再アクセス不要
- DOM解析ロジックだけ修正できる
- 県ごとの差異を比較できる
- 問題のあるページを後から確認できる

---

## 5. 中間JSONを作る

HTMLから抽出した結果もJSONとして保存する。

```text
data/sakeno/parsed/
  01-hokkaido.json
  ...
```

1店舗：

```json
{
  "source": "sakeno.com",
  "sourceId": "...",
  "sourceUrl": "...",
  "name": "...",
  "nameKana": "...",
  "prefecture": "東京都",
  "city": "...",
  "address": "..."
}
```

Supabaseへ直接書かず、まずこのJSONを完成させる。

---

# 6. ページ構造の差異に強くする

最重要ポイント。

## 固定CSSセレクタ1個に依存しない

避ける：

```ts
$(".shops > div:nth-child(3) > table > tr");
```

このようなDOM階層依存は、少しHTMLが違うだけで壊れる。

代わりに、

```text
1. 店舗詳細へのリンクを探す
2. 店名らしい要素を探す
3. その周辺DOMから住所等を取得
```

という意味ベースで解析する。

---

## 7. 複数セレクタのfallback

例えば店名なら：

```ts
const name =
  findByKnownSelector(node) ?? findFromHeading(node) ?? findFromShopLink(node);
```

住所：

```ts
const address =
  findAddressByLabel(node) ?? findJapaneseAddress(node.textContent);
```

かな：

```ts
const kana = findKanaByLabel(node) ?? null;
```

一つの取得方法に依存させない。

---

# 8. ラベルベース解析

HTMLに、

```text
住所
電話
ホームページ
```

のようなラベルがある場合、CSS位置ではなくラベル文字列を基準にする。

例：

```ts
findValueByLabel(node, ["住所", "所在地"]);
findValueByLabel(node, ["ホームページ", "URL", "Web"]);
```

これなら、

```html
<th>住所</th>
<td>...</td>
```

でも、

```html
<dt>住所</dt>
<dd>...</dd>
```

でも対応しやすい。

---

# 9. 店舗ブロックの検出

店舗単位のDOMを最初に特定する。

優先順位：

```text
店舗詳細リンク
↓
店舗名リンク
↓
見出し要素
↓
住所を含むまとまり
```

まず東京など店舗数の多い県で実DOMを確認し、

```ts
findShopBlocks(document);
```

を独立関数として作る。

以降の解析は、

```ts
parseShop(block);
```

へ渡す。

---

# 10. Parserを分割する

1関数に全部書かない。

```ts
parseShopName();
parseShopKana();
parseAddress();
parseSourceId();
parseSourceUrl();
```

最終的に：

```ts
function parseShop(block): ParsedShop | null;
```

とする。

DOM変更があった場合も該当関数だけ直せる。

---

# 11. 住所解析

サイト上の住所文字列をそのまま `address` として保持する。

さらに、

```text
prefecture
city
```

を抽出する。

例：

```text
神奈川県横浜市中区○○1-2-3
```

↓

```text
prefecture = 神奈川県
city       = 横浜市中区
address    = 神奈川県横浜市中区○○1-2-3
```

元住所を壊して分割しない。

---

# 12. 取得できない項目はNULL

無理に推測しない。

```text
nameKana
city
```

などが取れなければ：

```text
NULL
```

とする。

特に読み仮名を自動生成しない。

---

# 13. source_id

可能であれば、日本酒物語側の店舗詳細ページに含まれるIDを利用する。

例：

```text
source = "sakeno.com"
source_id = "<site-side shop id>"
```

IDを取得できない場合は、URLそのものから安定した識別子を生成する。

URLもない場合のみ、

```text
normalized_name + normalized_address
```

からhashを生成する。

優先順位：

```text
公式店舗ID
↓
店舗詳細URL
↓
店名＋住所hash
```

---

# 14. DB

`shops`：

```text
id
name
name_kana
prefecture
city
address
latitude
longitude

source
source_id
source_url

created_by
is_active
created_at
updated_at
```

制約：

```sql
UNIQUE(source, source_id)
```

---

# 15. 重複処理

同じ酒屋が複数県ページ等に存在しても二重登録しない。

まず：

```text
source + source_id
```

で同一判定。

さらにインポート前に、

```text
normalized_name
normalized_address
```

でも重複候補を検出する。

ただし自動マージしすぎない。

```text
完全一致 → 自動統合
類似 → warning
```

程度にする。

---

# 16. 正規化

比較用の値だけ正規化する。

例えば：

```ts
normalizeShopName();
normalizeAddress();
```

で、

- 全角・半角空白除去
- 連続空白整理
- Unicode正規化
- `丁目/番地` 等を無理に変換しない

DBには原文を保存する。

---

# 17. バリデーション

最低限：

```text
name 必須
prefecture 必須
address 必須
source_id 必須
```

異常例：

```text
店名なし
住所なし
店舗数0件
同じsource_idが大量発生
県と住所の都道府県が不一致
```

はDB投入せずwarningへ。

---

# 18. 県ごとの件数チェック

各都道府県について、

```text
東京都: 128件
神奈川県: 72件
...
```

のように件数を出力する。

前処理時に、

```text
HTML内候補数
Parsed成功数
Skipped数
Error数
```

を記録する。

例：

```text
東京都
found   : 132
parsed  : 129
skipped : 2
errors  : 1
```

`found > 0` なのに `parsed = 0` ならParser異常と判断する。

---

# 19. 47県を一気にDB投入しない

処理を3モードに分ける。

### fetch

```bash
npm run import:sakeno-shops -- --fetch
```

HTML取得だけ。

### parse

```bash
npm run import:sakeno-shops -- --parse
```

HTML → JSON。

### import

```bash
npm run import:sakeno-shops -- --import
```

JSON → Supabase。

最終的には：

```bash
npm run import:sakeno-shops -- --all
```

も用意してよい。

---

# 20. 1県指定を可能にする

デバッグ用：

```bash
npm run import:sakeno-shops -- --prefecture=13
```

これで東京だけ処理できるようにする。

最初は、

```text
東京
神奈川
北海道
沖縄
```

など構造差がありそうな数県で検証してから47県を実行する。

---

# 21. 再開可能にする

途中で失敗しても1県目からやり直さない。

```text
success
failed
pending
```

を記録する。

例えば：

```json
{
  "13": "success",
  "14": "success",
  "15": "failed"
}
```

再実行時は成功済みをskipできるようにする。
