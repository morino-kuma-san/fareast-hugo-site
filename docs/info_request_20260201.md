# 情報要求書 - 自宅デスクトップPC (yasuhiro-iMac) より

## 作成日時
- 2026-02-01

## 要求元
- ホスト名: yasuhiro-iMac
- OS: Ubuntu 24.04.3 LTS
- Docker: v28.2.2
- Docker Compose: v2.37.1

---

## 要求する情報

### 1. Docker化ファイル一式

以下のファイルの内容を提供してください：

#### 1.1 docker-compose.yml
- ファイルパス（職場サーバー上）
- ファイルの完全な内容

#### 1.2 Dockerfile（Hugo用）
- ファイルパス（職場サーバー上）
- ファイルの完全な内容

#### 1.3 .env.example（環境変数テンプレート）
- ファイルパス（職場サーバー上）
- ファイルの完全な内容

---

### 2. ディレクトリ構造

職場サーバー（zerofighter）における以下のディレクトリ構造を提供してください：

```
リポジトリルート/
├── docker-compose.yml の位置
├── Dockerfile の位置
├── hugo_fareast_site/ の構造
│   ├── server/
│   │   └── sp-form-receiver/
│   └── public/
└── その他のDockerに関連するファイル
```

---

### 3. Docker起動コマンド

職場サーバーで使用している Docker 起動コマンドを教えてください：
- 開発時の起動コマンド
- ビルドコマンド
- 停止コマンド

---

### 4. 自宅環境との差異について

作業ログ `work_log_20260131.md` に記載の通り、自宅環境と職場環境でパスが異なります：

| 項目 | 職場 | 自宅 |
|------|------|------|
| Hugoサイトパス | `hugo_fareast_site/` 配下 | ルート直下 |
| sp-form-receiverパス | `hugo_fareast_site/server/` | `server/` |
| publicパス | `hugo_fareast_site/public` | `public` |

この差異を考慮した Docker 設定の調整方法があれば教えてください。

---

### 5. 確認事項

- [ ] Docker化ファイルは origin/main または origin/master にpush済みですか？
- [ ] server300 (10.0.1.61) でも同じDocker設定を使用していますか？

---

## 回答方法

このファイルの下部に回答を追記するか、別途 `info_response_YYYYMMDD.md` ファイルを作成してください。

その後、git commit & push をお願いします。

---

## 回答欄（職場サーバー Claude Code 用）

**回答日時**: 2026-02-01
**回答元**: zerofighter (10.0.1.54)

---

### 1. Docker化ファイル一式

#### 1.1 compose.yml

**ファイルパス**: `hugo_fareast_site/compose.yml`

```yaml
services:
  hugo:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        # ここで Hugo 版本を固定（Git 管理）
        HUGO_VERSION: "0.152.2"
    working_dir: /work
    # host 側のファイル所有権を壊さないために、host の UID/GID で実行
    user: "${UID}:${GID}"
    environment:
      TZ: "${TZ:-Asia/Tokyo}"
      HUGO_ENVIRONMENT: "${HUGO_ENVIRONMENT:-development}"
      HUGO_BASEURL: "${HUGO_BASEURL:-http://localhost:1313/}"
      HUGO_CACHEDIR: "/cache/hugo"
    ports:
      # host 側のバインドIPを .env で制御（原則 127.0.0.1 推奨）
      - "${BIND_IP:-127.0.0.1}:${HOST_PORT:-1313}:1313"
    volumes:
      - .:/work
      - ./.docker-cache:/cache
    command:
      [
        "hugo",
        "server",
        "--bind", "0.0.0.0",
        "--port", "1313",
        "--baseURL", "${HUGO_BASEURL}",
        "--environment", "${HUGO_ENVIRONMENT}",
        "--disableFastRender",
        "--ignoreCache"
      ]
```

#### 1.2 Dockerfile

**ファイルパス**: `hugo_fareast_site/docker/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

ARG HUGO_VERSION=0.152.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl jq git tzdata \
  && rm -rf /var/lib/apt/lists/*

# Hugo Extended を GitHub Releases API から取得してインストール
RUN set -eux; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64)   arch_pat="amd64|64bit" ;; \
    arm64)   arch_pat="arm64|ARM64" ;; \
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  api="https://api.github.com/repos/gohugoio/hugo/releases/tags/v${HUGO_VERSION}"; \
  # まず .deb を優先して探す（あれば apt で導入）
  url_deb="$(curl -fsSL "$api" | jq -r --arg ap "$arch_pat" \
    '.assets[].browser_download_url as $u | .assets[] | select(.name|test("extended";"i")) \
     | select(.name|test("linux";"i")) | select(.name|test($ap;"i")) | select(.name|test("\\.deb$";"i")) \
     | .browser_download_url' | head -n1)"; \
  if [ -n "${url_deb:-}" ] && [ "$url_deb" != "null" ]; then \
    echo "Downloading Hugo (deb): $url_deb"; \
    curl -fsSL -o /tmp/hugo.deb "$url_deb"; \
    apt-get update; \
    apt-get install -y /tmp/hugo.deb; \
    rm -f /tmp/hugo.deb; \
  else \
    # .tar.gz にフォールバック
    url_tgz="$(curl -fsSL "$api" | jq -r --arg ap "$arch_pat" \
      '.assets[] | select(.name|test("extended";"i")) \
       | select(.name|test("linux";"i")) | select(.name|test($ap;"i")) | select(.name|test("tar\\.gz$";"i")) \
       | .browser_download_url' | head -n1)"; \
    echo "Downloading Hugo (tgz): $url_tgz"; \
    test -n "$url_tgz" && test "$url_tgz" != "null"; \
    curl -fsSL -o /tmp/hugo.tgz "$url_tgz"; \
    tar -C /tmp -xzf /tmp/hugo.tgz; \
    # tar の中身に hugo バイナリがいる前提
    mv /tmp/hugo /usr/local/bin/hugo; \
    chmod +x /usr/local/bin/hugo; \
    rm -f /tmp/hugo.tgz; \
  fi; \
  hugo version

WORKDIR /work

ENV TZ=Asia/Tokyo
ENV HUGO_CACHEDIR=/cache/hugo

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
```

#### 1.3 entrypoint.sh

**ファイルパス**: `hugo_fareast_site/docker/entrypoint.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /work

# npm キャッシュ先（bind mount した /cache を使う）
mkdir -p /cache/npm
npm config set cache /cache/npm >/dev/null 2>&1 || true

# Node ビルドが必要なテーマ/パイプライン対応:
# - package-lock.json があれば npm ci
# - それ以外で package.json があれば npm install
if [ -f package-lock.json ]; then
  if [ ! -d node_modules ] || [ "${FORCE_NPM_CI:-0}" = "1" ]; then
    echo "[entrypoint] npm ci ..."
    npm ci
  fi
elif [ -f package.json ]; then
  if [ ! -d node_modules ] || [ "${FORCE_NPM_INSTALL:-0}" = "1" ]; then
    echo "[entrypoint] npm install ..."
    npm install
  fi
fi

exec "$@"
```

#### 1.4 .env.example

**ファイルパス**: `hugo_fareast_site/.env.example`

```env
# ========== 共通 ==========
TZ=Asia/Tokyo

# host 側ファイル所有権を維持するために必須（各マシンで変わる）
# 例: UID=1000 / GID=1000
UID=1000
GID=1000

# ========== Hugo 実行設定 ==========
# Hugo の環境名（config/<env>/ を使う場合にも有効）
HUGO_ENVIRONMENT=development

# dev server のアクセスURL（絶対URLが必要な場合に使用）
HUGO_BASEURL=http://localhost:1313/

# ========== 公開ポート ==========
# 原則: 127.0.0.1 を推奨（外部公開しない）
BIND_IP=127.0.0.1
HOST_PORT=1313
```

---

### 2. ディレクトリ構造

**職場サーバー（zerofighter）のリポジトリ構造**:

```
hugo_fareast_site/                    ← リポジトリルート
├── compose.yml                       ← Docker Compose 設定
├── .env                              ← 環境変数（git管理外）
├── .env.example                      ← 環境変数テンプレート
├── .docker-cache/                    ← Docker用キャッシュ（git管理外）
│   ├── npm/
│   └── hugo/
├── docker/
│   ├── Dockerfile                    ← Hugo用Dockerfile
│   └── entrypoint.sh                 ← npm依存関係処理
├── server/
│   └── sp-form-receiver/             ← Node.js API（Phase2実装）
│       ├── index.js
│       ├── package.json
│       ├── .env                      ← API用環境変数（git管理外）
│       ├── .env.example
│       └── .env.local.example        ← ローカル開発用（MailHog設定）
├── content/                          ← Hugo コンテンツ
├── layouts/                          ← Hugo テンプレート
├── static/                           ← 静的ファイル
├── themes/                           ← Blowfishテーマ（サブモジュール）
├── public/                           ← Hugo 生成物（git管理外）
├── docs/
│   └── home_repro_20260131.md        ← 自宅PC再現手順書
└── ops/
    └── nginx/
        └── hugo-fareast.local-8080.conf.example
```

---

### 3. Docker起動コマンド

```bash
# 起動（ビルド含む）
docker compose up -d --build

# 起動（ビルド済みの場合）
docker compose up -d

# ログ確認
docker compose logs -f

# 停止
docker compose down

# 状態確認
docker compose ps
```

---

### 4. 自宅環境との差異について

#### 差異の整理

| 項目 | 職場（zerofighter） | 自宅（yasuhiro-iMac） |
|------|---------------------|----------------------|
| リポジトリパス | `~/ドキュメント/wordPress移行/hugo_fareast_site/` | `~/ドキュメント/fareast-hugo-site/` |
| compose.yml | `hugo_fareast_site/compose.yml` | `fareast-hugo-site/compose.yml` |
| sp-form-receiver | `hugo_fareast_site/server/sp-form-receiver/` | `fareast-hugo-site/server/sp-form-receiver/` |

#### 調整方法

**差異は問題ありません。** Docker化ファイルはリポジトリ内で相対パスを使用しているため、リポジトリをどこに clone しても動作します。

自宅での手順:
```bash
cd ~/ドキュメント/fareast-hugo-site
git checkout dockerize-hugo
git pull origin dockerize-hugo
cp .env.example .env
# .env を編集（UID/GID確認: id コマンドで確認）
mkdir -p .docker-cache/npm .docker-cache/hugo
docker compose up -d --build
```

---

### 5. 確認事項への回答

| 質問 | 回答 |
|------|------|
| Docker化ファイルは origin/main または origin/master にpush済みですか？ | **いいえ**。現在 `dockerize-hugo` ブランチにのみ存在。masterへのマージはまだ行っていません。 |
| server300 (10.0.1.61) でも同じDocker設定を使用していますか？ | **はい**。server300 も `dockerize-hugo` ブランチをチェックアウトし、同じ compose.yml で動作確認済みです。 |

---

### 6. 自宅PCでの作業手順（まとめ）

```bash
# 1. リポジトリに移動
cd ~/ドキュメント/fareast-hugo-site

# 2. dockerize-hugo ブランチを取得
git fetch origin
git checkout dockerize-hugo
git pull origin dockerize-hugo

# 3. 環境変数ファイル作成
cp .env.example .env

# 4. UID/GID を確認して .env を編集
id  # UID, GID を確認
# .env の UID=xxxx, GID=xxxx を自分の値に変更

# 5. キャッシュディレクトリ作成
mkdir -p .docker-cache/npm .docker-cache/hugo

# 6. Docker起動
docker compose up -d --build

# 7. 動作確認
curl http://127.0.0.1:1313/
# または ブラウザで http://localhost:1313/
```

---

### 7. 参考ドキュメント

- `docs/home_repro_20260131.md` - 自宅PC再現手順書（Phase2 sp-form-receiver含む）
- `work_log_20260131.md` - 作業記録（Docker化セクション参照）

---

**以上**
