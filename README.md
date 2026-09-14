# さけたん / SAKETAN

飲みたい酒から店を探せる。近くの店から酒を探せる。

日本酒銘柄と酒屋の長期的な取扱関係を、ユーザーの「見つけた」投稿から蓄積するWebアプリです。取扱関係（ShopBrand）と日付付き投稿（Sighting）を別々に保持します。機能仕様は `docs/mvp-spec.md` です。

## 構成

- Next.js 16 App Router / React 19 / TypeScript
- Supabase PostgreSQL、Supabase Auth の匿名認証・Google / X / Facebook OAuth、`@supabase/ssr`
- PostgRESTクライアントとSQL migration。ORMは追加していません。
- Google Maps JavaScript API / Advanced Markers / Places API (New)
- Noto Sans JP（ローカル配信）、生成り・白・墨色・朱のモバイルUI
- Node.js 22以上推奨（検証: Node.js 24）、npm

## セットアップ

### 1. インストール

```bash
npm ci
```

### 2. 環境変数

`.env.example` を `.env.local` にコピーして設定します。既存ファイルは上書きせず編集してください。`.env.local` はGit対象外です。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
DATABASE_URL=
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=
```

| 変数                                   | 用途                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase Project URL                                                                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key。旧 `anon` keyも同じ変数名で利用可能                                                                            |
| `SUPABASE_SECRET_KEY`                  | import専用。旧 `service_role` keyも利用可能。ブラウザには公開しない                                                             |
| `DATABASE_URL`                         | 自動migration用。Supabase Connectの **Session pooler** 接続文字列。DBパスワードを含むため非公開。SQL Editorで適用する場合は不要 |
| `NEXT_PUBLIC_SITE_URL`                 | アプリの正規origin。末尾スラッシュなし                                                                                          |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`      | Maps JavaScript API・Places API (New)用の公開キー。Webサイト制限とAPI制限を設定                                                 |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`       | Advanced Markerを使うGoogle Map ID                                                                                              |

通常のアプリ実行にはサーバー用Secret keyやDBパスワードを使いません。認証とDB権限・RLSで書き込みを保護します。

### 3. DB migration

空の開発用Supabaseプロジェクトに、**次のどちらか一方**で適用します。

**自動適用:** `DATABASE_URL` を設定し、次を実行します。SupabaseがPostgres.js向けに案内する `ssl: "require"` で暗号化し、トランザクション、適用履歴とハッシュ照合を使って同じmigrationの二重適用を防ぎます。サーバー証明書まで検証する運用では、Supabase Database SettingsからCA証明書を取得し `verify-full` 相当で接続してください。

```bash
npm run db:migrate
```

**手動適用:** Supabase Dashboard → SQL Editorで `supabase/migrations/` のSQLをファイル名順に一度ずつ実行します。手動適用は自動migrationの台帳に記録されないため、その後に同じmigrationを自動適用しないでください。

既存の `auth.users` を使用し、既存認証ユーザーのプロフィールもバックフィルします。

### 4. さけのわimport

```bash
npm run import:sakenowa
```

地域 → 酒蔵 → 銘柄 → 総合ランキングの順で解決してDBへ保存します。`UNIQUE(source, source_id)` によるupsertで再実行可能です。途中で失敗しても再実行で再開できます。

- `areaId` から都道府県名を解決して酒蔵へ保存します。地域用の追加テーブルは不要です。
- 空・不明の `breweryId` はNULLにします。
- 名前が空のレコードは除外し件数を表示します。
- 読み仮名を推測しません。編集済みのかなは再取込で上書きしません。
- APIに確実な銘柄ページURLがないため、初回 `external_url` はNULLです。既存の確認済みURLは再取込で変更しません。
- 最新月の総合ランキングを銘柄へ保存し、地図のピン選択時は上位銘柄を優先して最大3件表示します。
- 画面表示時にさけのわAPIを呼びません。

DBなしで実APIの形式のみ確認する場合:

```bash
npm run import:sakenowa -- --dry-run
```

2026-09-11の検証では地域48件、名前のある酒蔵1,697件、銘柄3,291件。名前が空の酒蔵48件を除外しました。件数はAPIの更新で変わります。

[さけのわ公式仕様・利用条件](https://muro.sakenowa.com/sakenowa-data/)に従い、全画面の共通フッターに帰属表示とリンクを設置しています。

### 5. 日本酒物語の酒屋データ初回import

初回データ投入はHTML取得・解析・DB登録を分けて実行します。raw HTMLと中間JSONはGit対象外で、成功・失敗状態を県ごとに保存するため中断後も再開できます。

```bash
npm run import:sakeno-shops -- --fetch
npm run import:sakeno-shops -- --parse
npm run import:sakeno-shops -- --import
```

3段階を続けて実行する場合は `--all`、1県だけ検証する場合は `--prefecture=13` を付けます。成功済みも処理し直す明示的な再実行には `--force` を使います。取得間隔は最低1秒で、HTMLは最大3回まで再試行します。

解析結果と県別の件数・warningは `data/sakeno/parsed/` と `data/sakeno/reports/` に保存します。店舗詳細ページのIDを `source_id` とし、`UNIQUE(source, source_id)` によるupsertで二重登録を防ぎます。住所は解析時の識別・検証にだけ使用し、DBには保存しません。

日本酒物語に位置情報がないため、取り込み時の緯度・経度はNULLです。かなと座標が揃うまでは検索結果に表示せず、整備後に地図・検索へ掲載します。各店舗詳細には取得元ページへのリンクを表示します。

実装仕様は `docs/sakeno-shops-import.md` です。

### 6. Google Mapsと店舗位置

Google Cloudで課金を有効にし、**Maps JavaScript API** と **Places API (New)** を有効にします。OAuthログイン用のClient ID / SecretはMaps APIキーとして使用できません。

1. Maps JavaScript APIとPlaces API (New)だけを許可し、Webサイト（HTTPリファラー）で制限した公開キーを `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` に設定します。
2. Google Cloud ConsoleでMap IDを作成し、`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` に設定します。ローカル確認だけなら未設定時にGoogleのデモMap IDを使います。

Googleから取得した店舗座標には取得日時と精度を保存し、30日を超えた座標は地図とエリア検索から除外します。継続表示する場合は期限内に再取得してください。料金、保存期間、表示条件は運用開始前にも最新のGoogle Maps Platform規約を確認してください。

### 7. 匿名操作とソーシャルログイン

1. Supabase AuthenticationでAnonymous Sign-Insを有効にします。画面上はログインを求めませんが、初回の取扱操作時に匿名ユーザーを自動作成し、DB権限と更新履歴の主体にします。
2. Authentication → ProvidersでGoogle、X、Facebookを有効化し、各サービスで発行したClient ID / Secretを設定します。Secretはアプリの環境変数には置きません。
3. 各サービス側のコールバックURLには `https://YOUR_PROJECT.supabase.co/auth/v1/callback` を登録します。
4. Supabase Authentication → URL ConfigurationのSite URLを `http://127.0.0.1:3000` とし、Redirect URLsに `http://127.0.0.1:3000/auth/callback` を追加します。
5. Authentication → Identity LinkingでManual Linkingを有効にします。これにより匿名操作の履歴を保持したまま、Google / X / Facebookアカウントへ引き継げます。

`localhost` を使う場合はアプリURL・環境変数・Supabase許可URLをすべて `localhost` に合わせてください。PKCE Cookieは別ホストへ引き継がれないため、`localhost` と `127.0.0.1` を混在させないでください。本番ではHTTPSの本番originを登録します。

[匿名認証](https://supabase.com/docs/guides/auth/auth-anonymous)、[Google](https://supabase.com/docs/guides/auth/social-login/auth-google)、[X](https://supabase.com/docs/guides/auth/social-login/auth-twitter)、[Facebook](https://supabase.com/docs/guides/auth/social-login/auth-facebook)、[Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)、[Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)も参照してください。公開時はSupabaseの匿名ユーザー向けレート制限も設定してください。

### 9. 起動

```bash
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000) を開きます。環境変数変更後はサーバーを再起動してください。

Googleログインを確認するときは、Codexの内蔵ブラウザーやVS Codeがデバッグ用に起動したChromeではなく、通常のChromeまたはEdgeでこのURLを開いてください。Googleは埋め込みブラウザーとソフトウェア制御中のブラウザーからのOAuthログインを拒否する場合があります。

VS Codeでは「Next.js: デバッグしてブラウザーを開く（Googleログイン対応）」を選んでF5を押します。Next.jsの準備ができると、上記URLが通常の既定ブラウザーで自動的に開きます。ブラウザーにはVS Codeのデバッガーを接続しないため、Googleログインを利用できます。クライアント側は通常のブラウザーのDevToolsでデバッグできます。

```bash
npm run build
npm start
```

接続情報なしでもホーム地図と案内を表示できます。架空のマスタへのフォールバックや未認証の保存処理はありません。

## 画面

| 画面       | ルート                       | 主な動作                                                           |
| ---------- | ---------------------------- | ------------------------------------------------------------------ |
| ホーム地図 | `/`、`/?brand_id=...`        | 名前／かな検索、銘柄フィルタ、現在地、エリア再検索                 |
| 酒屋詳細   | `/shops/[id]`                | 取扱あり／現在は取扱なしの銘柄、最近の投稿、編集・履歴導線         |
| 取扱編集   | `/post?shop_id=...`          | 既存銘柄の追加と「取扱あり／現在は取扱なし／誤った取扱情報」の変更 |
| 編集       | `/edit`、`/edit/[type]/[id]` | 酒屋の追加・編集。銘柄・酒蔵マスタは管理者のみ編集                 |
| 更新履歴   | `/history?type=...&id=...`   | 差分、30件ごとのページ送り、管理者の復元                           |
| アカウント | `/login`、`/account`         | ログイン連携、表示名、貢献数・達成度・ひいきの酒屋                 |

ホームの銘柄選択は取扱店フィルタです。酒屋詳細の銘柄名は `external_url` がある場合だけ、さけのわ銘柄ページへ直接外部リンクします。中間画面はありません。

ピンだけでは遷移せず、ピン → 地図下部のカード → 酒屋詳細の順です。位置情報が使えない場合は日本の広域表示。地図移動後は「このエリアを検索」で更新します。エリア検索は最大200店、候補は銘柄40件・酒屋200件・酒蔵40件。密集地域ではエリアを狭めてください。最近の投稿は最大50件です。

酒屋の登録・編集では、最初にPlaces API (New)で店舗を選び、座標・Place ID・店舗名・都道府県・市区町村を自動設定します。店舗名・かな・緯度・経度は必須、都道府県・市区町村は任意で、住所と公式サイトは保存しません。Googleマップのクリックまたはピンのドラッグでも位置を調整できます。店舗詳細から営業時間・電話番号などをGoogleマップで確認できます。

## DB・権限・仕様判断

主要テーブルは `users`、`breweries`、`brands`、`shops`、`shop_brands`、`sightings`、`change_histories`、`brand_requests` の8つです。PostGISは不要です。

- 閲覧と取扱情報の追加・変更は画面上のログインなしで可能です。変更時にはSupabaseの匿名セッションを自動発行し、1時間単位の変更上限をDBで適用します。
- `shop_brands.status` は `available`（取扱あり）、`unavailable`（現在は取扱なし）、`incorrect`（誤った取扱情報）の3値です。新しい取扱関係の追加ではSightingを作らず、両者を混同しません。
- 銘柄が見つからない場合は `brand_requests` へ報告し、銘柄マスタへ直接登録しません。報告は管理者が確認済み／却下にできます。
- 銘柄・酒蔵マスタの新規登録は管理者を含めて禁止し、さけのわimportだけを登録元にします。既存マスタの補正・無効化は管理者のみです。酒屋マスタの追加・編集は通常アカウントが必要です。
- 公開ユーザー情報はID・表示名・画像URLで、email・roleの公開SELECTは許可しません。表示名はアカウント画面から変更でき、OAuthメタデータの再同期でも上書きしません。
- アカウント画面では、有効な取扱銘柄登録数・酒屋登録数・解決した銘柄報告数を本人だけに表示します。取扱銘柄登録数に応じた達成名と、同じ酒屋へ2件以上登録した場合の「ひいきの酒屋」上位3店も表示します。取扱状況の更新回数は集計しません。
- 取扱情報・投稿・編集はNext.js側とDBのRPC双方で認証を確認します。直接テーブル書き込みは許可しません。
- `post_sighting` は取扱関係のupsert・再有効化・MIN/MAX更新・投稿作成を1トランザクションで実行します。ユニーク制約と行ロックで競合を処理します。
- 投稿編集／削除は本人またはadminだけ。削除は `is_deleted=true`。変更後は残る投稿から最初／最後の発見日を再計算し、長期的な取扱関係は残します。
- `shop_brands` の3状態は誰でも変更でき、adminは履歴から復元できます。発見日は現在残っている投稿から再計算します。
- マスタの追加・編集・無効化は同一トランザクションで履歴を記録します。履歴の編集／削除はDBトリガーでも拒否します。
- admin復元は選択履歴の **変更後** の状態を適用し、新しい `restore` 履歴を追加します。出典・外部ID・作成者は変更しません。
- Googleメタデータからroleを採用しません。初期roleは必ず `user` です。
- import / seedはシステム処理のため、人間の編集者を割り当てずユーザー変更履歴に記録しません。

ソーシャルログイン後、必要なユーザーだけSQL Editorで管理者にできます。

```sql
update public.users set role = 'admin' where email = '管理者のメールアドレス';
```

確認済みの銘柄ページURLがある場合、DB管理者が正しい銘柄UUIDを指定して `brands.external_url` を設定できます。数値API IDから推測しないでください。

## 検証

```bash
npm test
npm run typecheck
npm run build
```

PGlite（実PostgreSQLエンジン）にSupabaseの認証スキーマ・ロールを最小再現し、同じmigrationとRPCで投稿原子性・日付集計・権限・検索・履歴不変性・復元を検証します。PGliteでは組込UUID生成を使うため、テスト時だけ `pgcrypto` 拡張宣言を除きます。

ホストされたSupabaseとGoogle OAuthへの実接続は別途必要です。初回接続後に次を確認してください。

1. migration → さけのわimportと日本酒物語importを2回 → Googleジオコーディングを実行して件数が重複しない。
2. ピン → カード → 酒屋詳細で取扱銘柄と投稿を確認できる。
3. ログイン画面を出さずに、既存銘柄の追加と3つの取扱状況の変更ができる。
4. 見つからない銘柄はマスタ登録ではなく管理者向け報告になる。
5. 匿名操作後にGoogle / X / Facebookを連携し、履歴を保ったまま表示名を変更できる。
6. 別ユーザーは他人の投稿を変更できない。
7. マスタ変更・管理者復元で新しい差分履歴が残る。

銘柄詳細、写真投稿、いいね、ランキング、EC等は実装対象外です。
