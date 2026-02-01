# Docker 運用ルール

## 概要

このドキュメントは、Hugo サイト開発環境における Docker 運用の基本ルールを定めます。

---

## 1. 絶対ルール

### 1.1 sudo docker / sudo docker compose は原則禁止

bind mount を使用しているため、`sudo` で Docker を実行すると、ホスト側のファイルが root 所有になり、通常ユーザーで編集できなくなります。

```bash
# NG - 絶対にやらない
sudo docker compose up -d
sudo docker build .

# OK - 通常ユーザーで実行
docker compose up -d
docker build .
```

**例外**: システム設定の変更が必要な場合のみ（Docker インストール等）

### 1.2 .env の UID/GID を正しく設定する

Docker コンテナ内で作成されるファイルの所有者を、ホスト側のユーザーと一致させるために必須です。

```bash
# 自分の UID/GID を確認
id
# uid=1000(username) gid=1000(username) ...

# .env に設定
UID=1000
GID=1000
```

---

## 2. .docker-cache が root 所有になった場合の復旧手順

### 2.1 症状

```
mkdir: cannot create directory '/cache/npm': Permission denied
```

### 2.2 原因

`sudo docker compose` を実行した、または Docker がルートで実行されたため。

### 2.3 復旧手順

#### 方法1: スクリプトを使用（推奨）

```bash
# root 所有のディレクトリを削除（sudo 必要）
sudo rm -rf .docker-cache

# スクリプトで再作成
./scripts/reset_local_cache.sh
```

#### 方法2: 手動で実行

```bash
# 1. Docker を停止
docker compose down

# 2. root 所有のディレクトリを削除（sudo 必要）
sudo rm -rf .docker-cache

# 3. 通常ユーザーで再作成
mkdir -p .docker-cache/npm .docker-cache/hugo

# 4. Docker を起動
docker compose up -d
```

---

## 3. URL の使い分け

| ポート | 用途 | 説明 |
|--------|------|------|
| 1313 | Hugo プレビュー | Docker コンテナ内の Hugo dev server |
| 8787 | sp-form-receiver API | フォーム送信処理 |
| 80 | Nginx（本番） | 静的サイト配信 + API プロキシ |
| 8025 | MailHog Web UI（開発用） | メール確認用 |
| 1025 | MailHog SMTP（開発用） | テストメール送信用 |

### 開発時のアクセス

```bash
# Hugo プレビュー
curl http://127.0.0.1:1313/

# フォーム送信テスト（API 直接）
curl -X POST http://127.0.0.1:8787/api/sp-inquiry ...

# MailHog でメール確認（ブラウザ）
http://127.0.0.1:8025/
```

### 本番環境（server300）

```bash
# Nginx 経由（静的サイト）
curl http://127.0.0.1/

# Nginx 経由（フォーム送信）
curl -X POST http://127.0.0.1/api/sp-inquiry ...
```

---

## 4. トラブルシューティング

### 4.1 コンテナが起動しない

```bash
# ログを確認
docker compose logs

# コンテナの状態を確認
docker compose ps -a
```

### 4.2 ポートが既に使用されている

```bash
# 使用中のポートを確認
sudo lsof -i :1313
sudo lsof -i :8787

# 既存のプロセスを停止するか、.env でポートを変更
```

### 4.3 node_modules の問題

```bash
# 強制的に npm ci を実行
FORCE_NPM_CI=1 docker compose up -d
```

---

## 5. 環境別の設定

### zerofighter（開発）

```env
HUGO_ENVIRONMENT=development
BIND_IP=127.0.0.1
HOST_PORT=1313
```

### server300（検討用本番）

```env
HUGO_ENVIRONMENT=server300
BIND_IP=127.0.0.1
HOST_PORT=1313
```

### 自宅 PC（開発）

```env
HUGO_ENVIRONMENT=development
BIND_IP=127.0.0.1
HOST_PORT=1313
```

---

*最終更新: 2026-02-01*
