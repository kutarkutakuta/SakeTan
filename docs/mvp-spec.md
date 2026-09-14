# さけたん MVP 実装指示

日本酒探索Webアプリ「さけたん」のMVPを実装してください。

この文書を機能仕様の正とします。参考UI画像がある場合はデザインの雰囲気のみ参考にし、画像内の機能・文言と本仕様が異なる場合は本仕様を優先してください。

---

## 1. コンセプト

アプリ名：**さけたん / SAKETAN**

コンセプト：

> 飲みたい酒から店を探せる。近くの店から酒を探せる。

「この酒屋は普段どんな銘柄を扱う店なのか」をユーザー投稿で蓄積する、**酒屋 × 日本酒銘柄の取扱情報データベース**です。

リアルタイム在庫サービスではありません。

データを以下の2種類に分けます。

- `ShopBrand`：酒屋と銘柄の長期的な取扱関係
- `Sighting`：「○月○日にこの店でこの銘柄を見つけた」という投稿

UIでは「在庫あり」「必ず買える」などの表現を使用しないでください。

---

## 2. 技術構成

基本：

- Next.js
- TypeScript
- PostgreSQL
- Google Maps JavaScript API
- Google Geocoding API
- Supabase匿名認証
- Google / X / Facebookログイン
- モバイルファースト

ORM・認証ライブラリは、現在のNext.jsで安定して利用でき、構成がシンプルになるものを選択してください。

過剰なレイヤー分割、マイクロサービス、不要な抽象化は避けてください。

---

## 3. デザイン

方向性：

**「酒屋 × 地図 × 現代的な和」**

推奨カラー：

```text
Background  #F7F5EF
Surface     #FFFFFF
Text        #252522
Muted       #74736D
Primary     #B84A3A
```

フォント：

- Noto Sans JP

方針：

- 写真はほぼ使わない
- 地図と文字情報を主役にする
- 生成り＋白＋墨色＋控えめな朱
- 角丸カード
- 十分な余白
- シンプルで落ち着いたモバイルUI

避ける：

- 筆文字
- 桜・徳利など過度な和風装飾
- 和紙テクスチャ
- 黒＋金の高級酒サイト風
- 写真主体のUI

---

## 4. さけのわデータ連携

酒蔵・銘柄の初期マスタには「さけのわデータ」を利用します。

公式仕様：

https://muro.sakenowa.com/sakenowa-data/

利用するAPI：

```text
/api/areas
/api/breweries
/api/brands
```

アプリ表示のたびにAPIを呼ばず、インポートしてPostgreSQLへ保存してください。

```text
さけのわAPI
    ↓
importスクリプト
    ↓
PostgreSQL
    ↓
さけたん
```

例：

```bash
npm run import:sakenowa
```

インポート順：

```text
areas
↓
breweries
↓
brands
```

`areaId` から都道府県名を解決して `breweries.prefecture` に保存します。

インポートは何度実行しても重複しないupsert方式にしてください。

---

## 5. 外部データ管理

`breweries` と `brands` に以下を持たせます。

```text
source nullable
source_id nullable
```

さけのわ由来：

```text
source = "sakenowa"
source_id = さけのわ側ID
```

原則：

```text
UNIQUE(source, source_id)
```

ユーザーによる酒蔵・銘柄マスタの新規登録は行いません。登録元はさけのわimportに限定します。

`brands` にはさらに：

```text
external_url nullable
```

を持たせます。

さけのわ銘柄ページの正しいURLを公式データから確実に取得・生成できる場合のみ保存してください。

API IDとWebサイトの銘柄キーが同一だと推測してURLを生成してはいけません。

確認できなければ：

```text
external_url = NULL
```

で構いません。

---

## 6. さけのわ帰属表示

さけのわデータの利用条件に従い、アプリ内の分かりやすい場所に、

**「さけのわデータを利用しています」**

等の帰属表示と `sakenowa.com` へのリンクを設置してください。

---

# 7. DB

主要テーブルは8つです。

```text
users
breweries
brands
shops
shop_brands
sightings
change_histories
brand_requests
```

認証ライブラリ用テーブルは別途追加して構いません。

### users

```text
id uuid PK
name
email
image_url nullable
role              // user / admin
is_anonymous
name_is_custom
created_at
updated_at
```

### breweries

```text
id uuid PK
name
name_kana nullable
prefecture nullable
website_url nullable
source nullable
source_id nullable
created_by nullable → users
is_active
created_at
updated_at
```

### brands

```text
id uuid PK
brewery_id nullable → breweries
name
name_kana nullable
source nullable
source_id nullable
external_url nullable
created_by nullable → users
is_active
created_at
updated_at
```

さけのわの `breweryId` が空の場合があるため `brewery_id` はnullable。

### shops

```text
id uuid PK
name
name_kana nullable
prefecture
city
address
latitude
longitude
created_by nullable → users
is_active
created_at
updated_at
```

MVPではPostGIS不要です。

### shop_brands

```text
id uuid PK
shop_id → shops
brand_id → brands
created_by nullable → users
is_active
status            // available / unavailable / incorrect
first_seen_at nullable
last_seen_at nullable
created_at
updated_at

UNIQUE(shop_id, brand_id)
```

### sightings

```text
id uuid PK
shop_brand_id → shop_brands
user_id → users
comment nullable
observed_at
is_deleted
created_at
updated_at
```

`shop_id` / `brand_id` は重複保持しません。

### change_histories

```text
id uuid PK
entity_type
entity_id
action
before_data jsonb nullable
after_data jsonb nullable
changed_by → users
reason nullable
created_at
```

entity_type：

```text
brewery
brand
shop
shop_brand
```

action：

```text
create
update
deactivate
restore
```

履歴は物理削除・編集しません。

### brand_requests

```text
id uuid PK
name
brewery_name nullable
note nullable
shop_id nullable → shops
submitted_by → users
status            // pending / resolved / dismissed
created_at
reviewed_at nullable
reviewed_by nullable → users
```

---

# 8. 画面

主な画面は次のとおりです。

```text
1. ホーム地図
2. 酒屋詳細
3. 取扱状況の編集
4. 編集
5. 更新履歴
6. ログイン
7. アカウント
8. 未登録銘柄の管理
```

**銘柄詳細画面は作りません。**

---

# 9. ホーム地図

目的：

- 近くの酒屋を探す
- 銘柄から取扱店を探す

主要UI：

```text
さけたん

[ 銘柄・酒屋を検索 ]

----------------
      地図
----------------

[ このエリアを検索 ]

酒屋カード
```

検索対象：

- 銘柄名
- 銘柄かな
- 酒屋名
- 酒屋かな
- 酒蔵名
- 酒蔵かな

位置情報が許可された場合は現在地周辺を表示。

拒否された場合は適切な広域表示。

地図を移動した場合は「このエリアを検索」で再検索します。

### 銘柄検索結果

例：

```text
銘柄

亀の海
土屋酒造店 / 長野県
```

銘柄を選択したら、**さけのわへ遷移しません。**

```text
亀の海を選択
↓
ホーム地図をbrand_idでフィルタ
↓
亀の海のShopBrandがある酒屋のみ表示
```

フィルタ中は：

```text
[ 亀の海 × ]

「亀の海」を扱う酒屋
```

など、条件を明示してください。

### 酒屋検索結果

酒屋を選択：

```text
酒屋詳細へ
```

### 地図ピン

```text
ピンタップ
↓
地図下部に酒屋カード
↓
カードタップ
↓
酒屋詳細
```

ピンタップだけでは画面遷移しません。

---

# 10. 酒屋詳細

このアプリの中心画面です。

表示：

```text
酒屋名
住所
小さな地図

取扱銘柄

最近の情報

[ ＋ 取扱状況を変更 ]
```

### 取扱銘柄

例：

```text
亀の海 ↗
作 ↗
仙禽 ↗
```

`external_url` が存在する銘柄名は、**さけのわ銘柄ページへの直接外部リンク**にしてください。

```text
酒屋詳細
↓
銘柄名タップ
↓
さけのわ
```

途中に以下を挟みません。

- 銘柄詳細画面
- Modal
- Bottom Sheet
- ウィジェット
- 確認画面

外部リンクであることが分かるアイコンを表示し、可能なら新しいタブ／外部ブラウザで開いてください。

`external_url` がない銘柄は通常テキストとして表示します。

重要：

**ホーム検索の銘柄選択と酒屋詳細の銘柄名は動作が違います。**

```text
ホーム検索の銘柄
→ さけたん内で取扱店検索

酒屋詳細の銘柄名
→ さけのわ
```

各銘柄横の「取扱店を見る」ボタンはMVPでは不要です。

---

# 11. 取扱状況の編集

酒屋詳細の「取扱状況を変更」から遷移します。酒屋は固定表示し、再選択させません。

銘柄ごとの状態は次の3つです。

```text
取扱あり
現在は取扱なし
誤った取扱情報
```

画面上のログインは不要です。初回変更時に匿名セッションを自動発行し、変更者と履歴をDBに記録します。

「取扱あり」は通常の取扱銘柄として表示します。「現在は取扱なし」は過去の取扱情報として別表示し、「誤った取扱情報」は公開一覧から隠します。リアルタイム在庫を保証する表現にはしません。

---

# 12. 銘柄選択

取扱編集画面で銘柄マスタを検索します。

```text
[ 銘柄名を入力 ]

この酒屋の取扱銘柄
亀の海
作
仙禽

検索結果
...

＋ 取扱ありとして追加
```

最初に、この酒屋ですでにShopBrand登録されている銘柄を表示します。検索・絞り込みを行うと、さけのわから取り込んだ全銘柄を表示します。

検索結果には：

```text
銘柄名
酒蔵名
都道府県
```

を表示。

`name_kana` が存在する場合はかな検索にも対応します。

さけのわAPIに読み仮名がない場合、勝手に推測して生成しないでください。

銘柄が見つからない場合は、銘柄名・任意の酒蔵名・補足を `brand_requests` に報告します。ここから銘柄マスタを作成してはいけません。

---

# 13. 取扱変更時のDB処理

トランザクションで処理してください。

```text
shop_id + brand_idでShopBrand検索

存在しない
↓
ShopBrand作成
status = available
is_active = true

存在する
↓
status と is_active を同時更新
```

取扱銘柄の追加とSighting投稿は別の操作です。取扱銘柄を追加しただけではSightingを作成せず、`first_seen_at` / `last_seen_at` も更新しません。

すべてRPC内で実行し、1ユーザーあたりの短時間の変更回数を制限します。匿名・通常アカウントを問わず、誰でも3状態を変更できます。

---

# 14. マスタ登録

銘柄・酒蔵マスタの新規登録は、管理者を含めて画面・RPCから禁止します。登録元はさけのわimportだけです。既存データの補正・無効化は管理者に限ります。

見つからない銘柄は `brand_requests` に報告し、管理者が確認済み／却下を記録します。さけのわに追加された場合は通常のimportで取り込みます。

酒屋がない場合：

```text
＋ 新しい酒屋を登録
```

最低限：

```text
酒屋名
かな nullable
都道府県
市区町村
緯度
経度
```

---

# 15. 編集・更新履歴

通常アカウントは酒屋マスタを追加・編集できます。銘柄・酒蔵は管理者のみ編集でき、新規登録はできません。ShopBrandの3状態は匿名セッションを含む全ユーザーが変更できます。

編集時は自動的にChangeHistoryを作成。

履歴画面では変更されたフィールドのみ表示：

```text
日時
編集者
項目
変更前 → 変更後
```

一般ユーザー：

```text
閲覧のみ
```

admin：

```text
この時点の状態に戻す
```

復元時は履歴を削除せず、新しい：

```text
action = restore
```

を追加してください。

---

# 16. 認証・権限

画面上のログインなし：

```text
閲覧可能
ShopBrandの追加・3状態の変更
未登録銘柄の報告
```

操作時には内部で匿名セッションを作成します。ソーシャルアカウントを連携すると、匿名操作の履歴と同じユーザーIDを引き継ぎます。

アカウント画面には本人だけが確認できる貢献記録として、次を表示します。

```text
有効な取扱銘柄登録数
有効な酒屋登録数
管理者が解決済みにした銘柄報告数
取扱銘柄登録数に応じた達成名と次の達成までの進捗
ひいきの酒屋（最大3店）
```

取扱状況の更新回数は集計しません。「ひいきの酒屋」は、自分が有効な取扱銘柄を2件以上登録した酒屋を、登録数・最終登録日時の順で自動表示します。「誤った取扱情報」、無効な酒屋・銘柄は集計から除外します。

通常アカウント必須：

```text
酒屋マスタの追加・編集
酒屋コメント
表示名変更
```

銘柄・酒蔵マスタの編集、未登録銘柄報告の処理、履歴復元はadminだけです。銘柄・酒蔵マスタの新規登録はadminにも許可しません。

Sightingの編集・削除：

```text
投稿者本人
またはadmin
```

削除は：

```text
is_deleted = true
```

酒屋・銘柄・酒蔵マスタの無効化は：

```text
is_active = false
```

サーバー側でも必ず認可してください。

---

# 17. 開発用データ

酒蔵・銘柄を大量に手入力seedしないでください。

```text
酒蔵・銘柄
→ さけのわAPIからimport

酒屋
ShopBrand
Sighting
→ 開発用seed
```

酒屋は3〜5件程度。

実在酒屋へ架空の取扱情報を付けず、ダミー店舗と分かる名称を使用してください。

---

# 18. MVPで作らないもの

以下は不要です。

```text
銘柄詳細画面
さけのわウィジェット
商品マスタ
シリーズマスタ
季節商品マスタ
写真投稿
いいね
フォロー
お気に入り
通知
星評価
ランキング
フレーバーチャート
チャット
リアルタイム在庫
予約
EC
複雑な承認フロー
```

限定酒・季節酒などはSightingコメントで表現します。

例：

```text
銘柄：亀の海
コメント：夕やけ小やけがありました
```

---

# 19. 最終画面遷移

```text
ホーム地図
 │
 ├─ 銘柄検索
 │    ↓
 │  銘柄選択
 │    ↓
 │  ホーム地図を銘柄フィルタ
 │    ↓
 │  酒屋ピン
 │    ↓
 │  酒屋カード
 │    ↓
 │  酒屋詳細
 │
 ├─ 酒屋検索
 │    ↓
 │  酒屋詳細
 │
 └─ 酒屋ピン
      ↓
    酒屋カード
      ↓
    酒屋詳細
         │
         ├─ 銘柄名 → さけのわ（外部）
         │
         ├─ 取扱状況を変更
         │       ↓
         │  銘柄追加／3状態を選択
         │       ↓
         │    酒屋詳細
         │
         ├─ アカウントを保存
         │       ↓
         │  Google / X / Facebook連携
         │
         ├─ 編集
         └─ 更新履歴
```

---

# 20. 最重要完成条件

以下が動作する状態を最初の完成目標とします。

1. さけのわAPIから酒蔵・銘柄をインポートできる
2. ホームで銘柄を検索できる
3. 銘柄を選ぶと、その銘柄の取扱登録がある酒屋だけ地図表示される
4. 酒屋ピン → 酒屋カード → 酒屋詳細へ進める
5. 酒屋詳細で取扱銘柄・最近の投稿を確認できる
6. 酒屋詳細の銘柄名から、URLがある場合はさけのわへ直接遷移できる
7. ログイン画面を挟まず、酒屋固定で取扱銘柄を追加できる
8. ShopBrandがなければSightingとは別に作成される
9. 誰でも「取扱あり／現在は取扱なし／誤った取扱情報」を変更できる
10. 見つからない銘柄を、マスタ登録ではなく管理者へ報告できる
11. 銘柄・酒蔵マスタを利用者が新規登録できない
12. 匿名操作をソーシャルアカウントに引き継ぎ、表示名を変更できる

---

# 21. 実装順

### Phase 1

- Next.js / DB
- Migration
- 基本デザイン
- さけのわimport
- 開発用seed

### Phase 2

- ホーム地図
- 酒屋ピン
- 酒屋カード
- 酒屋詳細

### Phase 3

- 検索
- 銘柄フィルタ

### Phase 4

- 匿名認証
- Google / X / Facebookログイン
- ShopBrand状態管理

### Phase 5

- 酒屋マスタ追加・編集
- 銘柄・酒蔵マスタの管理者編集
- 未登録銘柄報告
- ChangeHistory
- 更新履歴
- admin復元

---

# 22. 実装開始時

まずリポジトリを確認し、簡潔に以下を整理してください。

- 現在の構成
- 採用する主要ライブラリ
- DBスキーマ
- ルーティング
- さけのわimport方法
- 実装順

重大な仕様矛盾がなければ、細かな確認を繰り返さずPhase 1から実装してください。

判断基準：

1. シンプル
2. モバイルで使いやすい
3. 操作数を少なくする
4. 誤登録しにくくする
5. データ整合性を守る
6. MVPとして過剰実装しない

READMEには最終的に、

```text
インストール
↓
環境変数設定
↓
DB migration
↓
さけのわimport
↓
開発用seed
↓
起動
```

まで再現できる手順を記載してください。

以上の仕様に従って「さけたん」MVPを実装してください。
