<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 酒屋の取扱銘柄インポート

ユーザーが店舗UUIDと公式サイトまたはPDFのURLを示して銘柄登録を依頼した場合は、
最初に次の自動処理を使う。

```powershell
npm run import:shop-products -- --shop-id=<店舗UUID> --url=<URL> --auto
```

- raw HTMLや全商品を会話へ展開せず、まず `report.md` の要確認項目だけを見る。
- JavaScript描画、無限スクロール、特殊な表、画像PDFで抽出不足の場合だけ、ブラウザー
  またはAIで `docs/shop-product-extraction.example.json` 形式を作る。
- AI抽出では掲載表記を `sourceName` と `sourceBreweryName` にそのまま保存し、マスター
  名を推測して書き換えない。再実行は `--auto --extracted=<JSON>` を使う。
- 完全一致と確認済みaliasだけが自動登録対象。suggested、ambiguous、unmatchedは候補と
  蔵名を確認し、確証がなければ登録しない。
- 銘柄マスターを新規作成しない。取得元から消えた銘柄を自動削除・取扱なしにしない。
- 最後に新規、登録済み、再有効化、要確認の件数と、要確認銘柄・蔵名をユーザーへ伝える。

### 利用量を抑える実行規則

銘柄取込では正確性と安全性を維持しつつ、モデルのコンテキストと利用量を必要以上に
消費しない。次の規則を守る。

- 最初の `--auto` 実行後は、同じURLの `manifest.json` と `raw/` を再利用する。取得失敗、
  内容の古さが明確、またはユーザーが再取得を求めた場合を除き、同じページ群を再取得
  しない。再解析は `--parse --force`、外部抽出は `--extracted` を使う。
- `report.md`、`review.json`、raw HTML、全商品名を会話やツール出力へ丸ごと展開しない。
  件数集計、理由別集計、必要な要確認項目だけをスクリプトで絞り込み、ツール出力には
  明示的な上限を設定する。
- 10ページ超または100商品超のサイトは、ブラウザーで1件ずつ確認しない。取得済みHTML
  を対象に、CSSセレクタまたは一時的なローカル抽出スクリプトで全ページを一括処理する。
  商品詳細ページは、一覧だけでは安全判定できない項目に限って確認する。
- ブラウザー、Web検索、AI抽出は、取得済みHTML/PDFと決定的なローカル解析で不足する
  場合だけ使う。同じ内容を複数の手段で重複取得しない。
- 外部抽出の照合は原則として、dry-runを1回、必要なら安全な掲載文字列の絞り込みを1回、
  最終importを1回とする。登録数を少し増やすためだけの反復照合は行わず、確証の弱い項目
  は要確認に残す。
- 複数商品が同一銘柄に集約される場合は、商品単位の説明をモデルへ渡さず、銘柄単位に
  重複排除してから確認する。別店舗の過去レポートを次の店舗取込で読み直さない。
- 利用量を確認でき、週間残量が10%以下の場合も最初の安全な自動処理までは実行する。
  その後に大規模なブラウザー巡回やAI抽出が必要なら、推定ページ数・商品数と低コストな
  代替案をユーザーへ伝え、追加の高負荷処理を始める前に確認する。
- 最終報告は件数、代表的な要確認項目、`report.md` へのリンクを中心に簡潔にする。要確認
  全件はレポートへ残し、ユーザーが求めない限り会話へ全件転記しない。
