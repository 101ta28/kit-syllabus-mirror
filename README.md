# KIT Syllabus Clone

金沢工業大学のシラバス検索結果を、共有しやすい URL で開ける React クローンです。

## URL 設計

元サイトの詳細 URL は検索結果 index に依存するため共有に向きません。このアプリでは次の形式にしています。

    /courses/:year/:semester/:courseCode/:courseNameSlug

例:

    /courses/2026/spring/G001-01/shugaku-kiso-a

`semester` は `spring`, `fall`, `full-year` のような英語 token です。科目名 slug は既知の科目では読みやすい英字を使い、それ以外は安定した ASCII slug を生成します。

## 開発

    bun install
    bun run prepare-data
    bun run dev -- --host 127.0.0.1

## ビルド

    bun run build

`npm` が PATH にある環境では `npm install` / `npm run build` でも同じです。

## データ

このプロトタイプは親ディレクトリにある取得済みファイル `../europa-syllabus-search-detail.json` からデータを生成します。検索結果 1056 件は一覧として取り込み、詳細本文は取得済みの `G001-01 修学基礎Ａ` を構造化しています。ほかの科目は共有 URL と基本情報を表示し、詳細本文は今後の取り込み対象として扱います。
