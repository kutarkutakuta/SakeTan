# 日本酒物語 酒屋データ作業領域

`npm run import:sakeno-shops` が次のディレクトリとファイルを生成します。

- `raw/`: 都道府県別の取得HTML
- `parsed/`: DB投入前の店舗JSON
- `reports/`: 都道府県別の件数とwarning
- `state.json`: fetch / parse / import の再開状態

生成データはGit対象外です。元ページの内容確認、解析の再実行、初回DB投入の監査に使います。
