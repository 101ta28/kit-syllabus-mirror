# KIT Syllabus Clone

金沢工業大学のシラバス検索結果を、共有しやすい URL で開ける React クローンです。

## URL 設計

元サイトの詳細 URL は検索結果 index に依存するため共有に向きません。このアプリでは次の形式にしています。

    /courses/:year/:semester/:courseCode

例:

    /courses/2026/spring/G001-01

`semester` は `spring`, `fall`, `full-year` のような英語 token です。2026 年度の取得済みデータでは `年度 + 学期 + 科目コード` が 1056 件すべて一意だったため、URL は科目コードで終わる形にしています。

## 開発

    bun install
    bun run prepare-data
    bun run dev -- --host 127.0.0.1

## ビルド

    bun run build

`npm` が PATH にある環境では `npm install` / `npm run build` でも同じです。

## データ

このプロトタイプは親ディレクトリにある取得済みファイル `../europa-syllabus-search-detail.json` と、Chrome DevTools Protocol 経由で取得した `data/syllabus-details-cache.json` からデータを生成します。検索結果 1056 件は一覧として取り込み、詳細本文も 1056 件すべてを `public/details/*.json` に分割して生成しています。

詳細を再取得する場合:

    bun run scrape-details
    bun run prepare-data
