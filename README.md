# Fareast Patent Office Hugo Site

## 概要
ファーイースト国際特許事務所のHugoベースのウェブサイト

## 必要環境
- Hugo Extended v0.100.0以上
- Git
- Go 1.18以上（オプション）

## セットアップ
1. リポジトリのクローン
   ```bash
   git clone --recursive https://github.com/[username]/fareast-hugo-site.git
   cd fareast-hugo-site
   ```

2. サブモジュールの初期化（--recursiveを使わなかった場合）
   ```bash
   git submodule init
   git submodule update
   ```

3. 開発サーバー起動
   ```bash
   hugo server -D
   ```

## 開発ガイドライン
- ブランチ戦略に従って開発（main/develop/feature）
- コミットメッセージは日本語で記述
- プルリクエスト前にローカルでビルドテスト

## プロジェクト構造
```
fareast-hugo-site/
├── archetypes/     # Hugoアーキタイプ
├── assets/         # アセットファイル
├── config.yaml     # Hugo設定ファイル
├── content/        # コンテンツファイル
├── data/           # データファイル
├── i18n/           # 国際化ファイル
├── layouts/        # レイアウトテンプレート
├── static/         # 静的ファイル
└── themes/         # テーマ（Blowfish）
```

## 使用テーマ
[Blowfish](https://github.com/nunocoracao/blowfish) - 高機能なHugoテーマ

## ライセンス
Copyright (c) 2024 Fareast Patent Office