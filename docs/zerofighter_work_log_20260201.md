# 作業記録 2026-02-01

## 概要

server300 の GitHub SSH 接続問題を解決し、Docker 環境の動作確認を行った。
また、自宅 PC (yasuhiro-iMac) からの情報要求に回答した。

---

## 1. server300 GitHub SSH 接続の復旧

### 1.1 状況

- server300 (10.0.1.61) で GitHub への SSH 接続が `Permission denied` になっていた
- SSH キーは存在するが、SSH エージェントに読み込まれていなかった
- パスフレーズは keychain 2.8.5 に保存済み

### 1.2 解決手順

```bash
# keychain を起動して SSH キーを読み込み
ssh -p 2718 server300@10.0.1.61 'eval $(keychain --eval --agents ssh id_ed25519) && ssh-add -l'

# GitHub 接続テスト
ssh -p 2718 server300@10.0.1.61 'eval $(keychain --eval --agents ssh id_ed25519) && ssh -T git@github.com'
# → Hi morino-kuma-san! You've successfully authenticated...
```

### 1.3 結果

- GitHub SSH 接続成功
- `git fetch origin` で `dockerize-hugo` ブランチを取得

---

## 2. server300 dockerize-hugo ブランチへの切り替え

### 2.1 作業内容

```bash
# 未コミット変更を破棄（以前 scp でコピーしたファイル）
git checkout . && git clean -fd

# dockerize-hugo ブランチをチェックアウト
git checkout dockerize-hugo
```

### 2.2 .docker-cache 権限問題

- `.docker-cache` ディレクトリが root 所有になっていた
- Docker 起動時に `Permission denied` エラー発生

#### 手動実行で解決

```bash
sudo rm -rf ~/hugo_fareast_site/.docker-cache
mkdir -p ~/hugo_fareast_site/.docker-cache/npm ~/hugo_fareast_site/.docker-cache/hugo
```

### 2.3 Docker Compose 起動確認

```bash
docker compose up -d
# → HTTP 200 OK 確認
```

---

## 3. 両サーバーの Docker 環境確認

### 3.1 確認結果

| サーバー | 項目 | 状態 |
|----------|------|------|
| zerofighter (10.0.1.54) | Docker Hugo コンテナ | ✅ 起動中 (127.0.0.1:1313) |
| server300 (10.0.1.61) | Docker Hugo コンテナ | ✅ 起動中 (127.0.0.1:1313) |
| server300 (10.0.1.61) | sp-form-receiver | ✅ active (running) |
| server300 (10.0.1.61) | Nginx | ✅ active (running) |

### 3.2 エンドポイント確認（server300）

| URL | HTTP Status |
|-----|-------------|
| http://127.0.0.1:1313/ (Docker Hugo) | 200 |
| http://127.0.0.1/ (Nginx トップ) | 200 |
| http://127.0.0.1/sp/ | 200 |
| http://127.0.0.1/mypage/login | 200 |

---

## 4. 自宅 PC (yasuhiro-iMac) への情報提供

### 4.1 情報要求

自宅 PC の Claude Code から `info_request_20260201.md` で以下の情報を要求された：

1. Docker 化ファイル一式（compose.yml, Dockerfile, .env.example）
2. ディレクトリ構造
3. Docker 起動コマンド
4. 自宅環境との差異についての調整方法
5. 確認事項（git push 済みか、server300 でも同じ設定か）

### 4.2 回答内容

- `info_request_20260201.md` の回答欄に詳細な情報を追記
- Docker 化ファイルの完全な内容を記載
- ディレクトリ構造を図示
- 自宅 PC での作業手順をまとめ

### 4.3 Git commit & push

```bash
cp info_request_20260201.md hugo_fareast_site/docs/
cd hugo_fareast_site
git add docs/info_request_20260201.md
git commit -m "docs: add info_request_20260201 with Docker setup response"
git push origin dockerize-hugo
```

| 項目 | 値 |
|------|-----|
| コミット SHA | `883a390` |
| ブランチ | `dockerize-hugo` |
| ファイル | `docs/info_request_20260201.md` |

---

## 5. 現在の状態

### 5.1 zerofighter (10.0.1.54)

| 項目 | 状態 |
|------|------|
| ブランチ | `dockerize-hugo` |
| Docker Hugo | ✅ 起動中 (127.0.0.1:1313) |

### 5.2 server300 (10.0.1.61)

| 項目 | 状態 |
|------|------|
| ブランチ | `dockerize-hugo` |
| Docker Hugo | ✅ 起動中 (127.0.0.1:1313) |
| sp-form-receiver | ✅ systemd で常駐 (127.0.0.1:8787) |
| Nginx | ✅ 起動中 (ポート 80) |
| GitHub SSH | ✅ keychain 経由で接続可能 |

---

## 6. 自宅 PC での次の作業

自宅 PC (yasuhiro-iMac) で以下を実行：

```bash
# dockerize-hugo ブランチを取得
cd ~/ドキュメント/fareast-hugo-site
git fetch origin
git checkout dockerize-hugo
git pull origin dockerize-hugo

# 回答ファイルを確認
cat docs/info_request_20260201.md

# Docker 環境構築
cp .env.example .env
id  # UID/GID を確認して .env を編集
mkdir -p .docker-cache/npm .docker-cache/hugo
docker compose up -d --build
```

---

## 7. 残作業

1. **dockerize-hugo ブランチを master にマージ**（必要に応じて）
2. **自宅 PC での Docker 環境構築確認**

---

## 8. Docker 安定化 & Compose 拡張（03_next_steps 対応）

参照ドキュメント: `03_next_steps_servers_zerofighter_claude_code.md`

### 8.1 A セクション: 現状の安定化（事故再発防止）

#### A-1: docs/DOCKER_RULES.md 作成

Docker 運用ルールを明文化：

- `sudo docker` / `sudo docker compose` は原則禁止
- `.docker-cache` が root 所有になった場合の復旧手順
- 各 URL の使い分け（1313 は Hugo、8787 は API、80 は Nginx）

#### A-2: scripts/reset_local_cache.sh 作成

キャッシュ初期化スクリプト：

```bash
./scripts/reset_local_cache.sh
# → .docker-cache を削除・再作成
```

#### A-3: server300 root 所有物チェック

```bash
find . -maxdepth 3 -user root -print
# → 問題なし（server300 ユーザー所有）
```

---

### 8.2 B セクション: Compose に sp-form-receiver / MailHog を組み込む

#### B-1: sp-form-receiver 起動要件調査

| 項目 | 内容 |
|------|------|
| 依存関係 | better-sqlite3（ネイティブ）, express, helmet, nodemailer, dotenv |
| 必須環境変数 | SESSION_SECRET, DB_PATH, ADMIN_EMAIL, MAIL_FROM |
| ヘルスチェック | GET /healthz → 200 "ok" |

#### B-2: .env.example 拡張

sp-form-receiver / MailHog 用の設定項目を追加：

```env
# sp-form-receiver
SP_FORM_PORT=8787
SP_FORM_SESSION_SECRET=...
SP_FORM_DB_PATH=/app/data/spform.db
SP_FORM_SMTP_HOST=mailhog
SP_FORM_SMTP_PORT=1025

# MailHog
MAILHOG_WEB_PORT=8025
MAILHOG_SMTP_PORT=1025
```

#### B-3: compose.yml 更新

profiles を使用して追加：

```yaml
services:
  hugo:              # デフォルト
  sp-form-receiver:  # profile: ["api"]
  mailhog:           # profile: ["dev"]
```

#### B-4: Dockerfile.sp-form-receiver 作成

better-sqlite3 のビルドに必要なツール（python3, make, g++）を含む Dockerfile を作成。

#### B-5: index.js 修正（BIND_HOST 対応）

Docker コンテナ内で 0.0.0.0 にバインドするため、環境変数 `BIND_HOST` を追加：

```javascript
const bindHost = process.env.BIND_HOST || "127.0.0.1";
app.listen(port, bindHost, () => { ... });
```

---

### 8.3 動作確認結果

#### zerofighter (10.0.1.54)

```bash
docker compose --profile api --profile dev up -d --build
```

| サービス | ポート | HTTP Status |
|----------|--------|-------------|
| Hugo | 1313 | ✅ 200 |
| sp-form-receiver (Docker) | 8788 | ✅ 200 |
| MailHog | 8025 | ✅ 200 |

※ ポート 8787 は既存 systemd 版が使用中のため、Docker 版は 8788 で起動

#### server300 (10.0.1.61)

```bash
docker compose --profile api up -d --build
```

| サービス | ポート | HTTP Status | 備考 |
|----------|--------|-------------|------|
| Hugo (Docker) | 1313 | ✅ 200 | |
| sp-form-receiver (Docker) | 8788 | ✅ 200 | 新規コンテナ版 |
| sp-form-receiver (systemd) | 8787 | ✅ 200 | 既存サービス（共存） |

**systemd 版と Docker 版が別ポートで同時稼働確認。**

---

### 8.4 Git コミット履歴

| SHA | 内容 |
|-----|------|
| 4e79ca1 | feat: add sp-form-receiver and MailHog to Docker Compose (profiles) |
| bed41f1 | chore: sync package-lock.json for npm ci |

---

### 8.5 完了条件チェック

| 条件 | 状態 |
|------|------|
| `.docker-cache` root化の復旧が scripts でワンコマンド化 | ✅ |
| sp-form-receiver / mailhog が compose の profile で起動できる | ✅ |
| server300 で systemd 版と衝突せず（別ポートで）コンテナ版テストできる | ✅ |
| dockerize-hugo の変更が docs 含めて整理され、merge 準備ができている | ✅ |

---

### 8.6 Docker Compose 使用方法

```bash
# Hugo のみ（デフォルト）
docker compose up -d

# Hugo + sp-form-receiver
docker compose --profile api up -d

# Hugo + sp-form-receiver + MailHog（開発用フル構成）
docker compose --profile api --profile dev up -d

# 停止
docker compose --profile api --profile dev down
```

---

### 8.7 現在のファイル構成

```
hugo_fareast_site/
├── compose.yml                       # 更新: 3サービス構成
├── .env.example                      # 更新: sp-form-receiver/mailhog設定追加
├── docker/
│   ├── Dockerfile                    # Hugo用
│   ├── Dockerfile.sp-form-receiver   # 新規: sp-form-receiver用
│   └── entrypoint.sh
├── scripts/
│   └── reset_local_cache.sh          # 新規: キャッシュ復旧スクリプト
├── docs/
│   ├── DOCKER_RULES.md               # 新規: Docker運用ルール
│   ├── info_request_20260201.md      # 新規: 自宅PC向け情報
│   └── home_repro_20260131.md
└── server/sp-form-receiver/
    └── index.js                      # 更新: BIND_HOST対応
```

---

### 8.8 残作業

1. **C セクション: nginx の Docker 化**（後回し・段階的対応）
2. **D セクション: dockerize-hugo → master マージ**
3. **自宅 PC での Docker 環境構築確認**

---

*以上*
