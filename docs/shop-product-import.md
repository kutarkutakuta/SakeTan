# 店舗公式サイトの商品一覧インポート

店舗公式サイトの商品一覧URLまたはPDFから商品名を取得し、既存の銘柄マスターと
照合して、確実な項目だけを対象店舗の取扱銘柄として登録する管理者向けCLIです。

クロール処理は通常のNext.jsリクエストから分離しています。

## 前提

- .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY が必要です。
- npm run db:migrate で最新migrationを適用してください。
- 対象サイトの利用規約を確認してください。
- robots.txt で許可されているHTMLとPDFだけを取得します。
- ログイン、CAPTCHAが必要なページは取得しません。
- JavaScript実行や無限スクロールが必要なページは、ブラウザーやAIで共通抽出JSONを
  作成し、`--extracted` で同じ照合・登録処理へ渡せます。

## 推奨: 自動処理

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/products/ \
      --auto

登録せず抽出・照合レポートだけを確認する場合は `--dry-run` を追加します。

`--auto` は取得、抽出、照合、登録、レポート作成までを続けて行います。既定で最大
50ページ、`--max-pages` の指定で最大200ページを巡回します。自動登録するのは次の
項目だけです。

- 正規化後の銘柄名が有効な銘柄マスター1件と完全一致
- 人が確認済みの表記揺れ辞書に一致
- 同名候補がある場合は取得元の蔵名で一意に特定できる

部分一致、同点候補、未登録銘柄は登録しません。`report.md` に元の銘柄名、蔵名、
候補、出典を出力します。同じ銘柄の商品違いと複数ページ間の重複は銘柄UUID単位で
1件に集約します。

再実行しても `shop_id + brand_id` の一意制約とupsertにより取扱関係は重複しません。
取得元から消えた銘柄を自動削除したり「取扱なし」に変更したりもしません。

確認済みの表記揺れは `config/shop-product-brand-aliases.json` に保存します。元表記と
銘柄マスターの対応を蔵元まで確認できた場合だけ追加します。

同じサービスやサイト固有のセレクター、ページ上限、除外語は
`config/shop-product-source-profiles.json` に保存します。一度確認したサイト構造を
次回以降はAIで解析し直しません。コマンドラインの `--selector` はプロファイルより
優先されます。

## 1. HTML・PDF取得

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/products/ \
      --fetch

rel=next、ページャーの「次へ」、ページ番号など、同一ドメインのページ送りだけを
追跡します。取得間隔は1秒以上です。

変更例:

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/products/ \
      --fetch \
      --max-pages=12 \
      --delay-ms=2000

取得済みHTMLを更新する場合だけ --force を付けます。

## 2. 商品名抽出と銘柄照合

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/products/ \
      --parse

JSON-LDのProduct、microdata、一般的な商品カードの順に商品名を探します。
抽出できない、または余計な要素が多いサイトでは商品名のCSSセレクタを指定します。

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/products/ \
      --parse \
      --selector=".product-card .product-name"

--all は --fetch と --parse を続けて実行します。誤登録を避けるため、
一括登録までは行いません。

生成先:

    data/shop-products/<店舗UUID>/<URL hash>/
      raw/           取得HTML
      manifest.json  URL、取得日時、ページごとのSHA-256
      extracted.json AIにも渡せる共通抽出形式
      parsed.json    抽出・照合件数
      review.json    承認ファイル
      report.json    機械可読の結果レポート
      report.md      未登録銘柄と蔵名を含む確認用レポート

PDFはページごとのテキストを `pdf-text.json` に保存します。画像だけのPDFはOCRまたは
AIで共通抽出JSONを作成してください。

## AI・ブラウザー抽出の共通形式

動的ページ、特殊な表、画像PDFなどをAIやブラウザーで抽出した場合は、
`docs/shop-product-extraction.example.json` と同じJSONを作成します。

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/dynamic-items/ \
      --auto \
      --extracted=C:\\path\\to\\extracted.json

AIは銘柄をマスター名へ書き換えず、掲載内容をそのまま `sourceName` と
`sourceBreweryName` に保存します。表記の統合は後段の照合処理だけで行います。

## 3. 確認

review.json の各項目を確認します。
項目は照合先の銘柄名順、同じ銘柄内では元の商品名順に並びます。

- exact: 銘柄名と完全一致
- alias: 人が確認済みの表記揺れ辞書に一致
- suggested: 商品名の中に既存銘柄名が含まれる
- ambiguous: 同点候補が複数ある
- unmatched: 候補なし

登録する項目だけ approved を true にします。brandId が正しい既存銘柄UUIDで
あることも確認してください。候補なしの銘柄は自動作成せず、さけたんの銘柄報告で
別途扱います。

## 4. 一括登録

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/products/ \
      --import

承認済み項目を「取扱あり」としてupsertします。既に取扱ありの銘柄は維持され、
同じ処理を再実行しても重複しません。

DBにはインポート単位で次を保存します。

- 店舗
- 取得元URL
- 取得日時
- HTML内容のSHA-256
- 元の商品名と商品URL
- 対応付けた銘柄

ページから商品が消えても、自動的に「現在は取扱なし」には変更しません。
