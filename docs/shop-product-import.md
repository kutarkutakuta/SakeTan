# 店舗公式サイトの商品一覧インポート

店舗公式サイトの商品一覧URLから商品名を取得し、既存の銘柄マスターと照合して、
承認した項目だけを対象店舗の取扱銘柄として登録する管理者向けCLIです。

クロール処理は通常のNext.jsリクエストから分離しています。

## 前提

- .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SECRET_KEY が必要です。
- npm run db:migrate で最新migrationを適用してください。
- 対象サイトの利用規約を確認してください。
- robots.txt で許可されているHTMLだけを取得します。
- ログイン、CAPTCHA、ブラウザ上のJavaScript実行が必要なページには対応しません。

## 1. HTML取得

    npm run import:shop-products -- \
      --shop-id=<店舗UUID> \
      --url=https://example.com/products/ \
      --fetch

rel=next、ページャーの「次へ」など、同一ドメインのページ送りだけを最大5ページまで
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
      parsed.json    抽出・照合件数
      review.json    承認ファイル

## 3. 確認

review.json の各項目を確認します。
項目は照合先の銘柄名順、同じ銘柄内では元の商品名順に並びます。

- exact: 銘柄名と完全一致
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
