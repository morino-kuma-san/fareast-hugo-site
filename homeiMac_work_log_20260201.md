# 作業ログ 2026-02-01

## 概要

職場サーバー（zerofighter）から Docker化ファイルを取得し、自宅PCで Docker 環境を構築・動作確認を行った。

---

## 実施した作業

### 1. 情報要求・取得

#### 作成したファイル
- `info_request_20260201.md` - 職場サーバーへの情報要求書

#### 取得した情報
- ブランチ: `dockerize-hugo`
- 回答ファイル: `docs/info_request_20260201.md`

```bash
git fetch origin
git checkout dockerize-hugo
git pull origin dockerize-hugo
```

### 2. Docker 環境構築

#### 確認事項
| 項目 | 結果 |
|------|------|
| compose.yml | 存在 |
| docker/Dockerfile | 存在 |
| docker/entrypoint.sh | 存在 |
| .env.example | 存在 |
| UID/GID | 1000/1000（デフォルト値で OK） |

#### 実行コマンド
```bash
# 環境変数ファイル作成
cp .env.example .env

# キャッシュディレクトリ作成
mkdir -p .docker-cache/npm .docker-cache/hugo

# Docker ビルド・起動
docker compose up -d --build
```

#### 結果
- Hugo コンテナ起動成功
- ページ生成: JA 42ページ / EN 12ページ
- アクセス: http://localhost:1313/

### 3. サービス起動

#### sp-form-receiver
```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver
nohup npm start > /tmp/sp-form-receiver.log 2>&1 &
```

#### MailHog
```bash
docker run --rm -d --name mailhog -p 8025:8025 -p 1025:1025 mailhog/mailhog
```

### 4. フォーム送信テスト

#### テスト内容
```bash
curl -X POST http://127.0.0.1:8080/api/sp-inquiry \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "trademark_text=テスト商標ABC" \
  -d "goods_services=第35類 広告業" \
  -d "email=info@ahirutokyo.com" \
  -d "email_confirm=info@ahirutokyo.com" \
  -d "hp_company="
```

#### 結果
| 項目 | 結果 |
|------|------|
| フォーム送信 | 成功 (303リダイレクト) |
| 受付番号 | `20260201-8550142188` |
| DB登録 | 完了 |
| JSON保存 | 完了 |
| ユーザーメール | `info@ahirutokyo.com` に送信済み |
| 管理者メール | `admin@example.com` に送信済み |

---

## 現在の環境構成

### ポート構成

| ポート | サービス | 用途 |
|-------|---------|------|
| 1313 | Hugo開発サーバー (Docker) | 静的ページプレビュー（ライブリロード対応）、**APIなし** |
| 8080 | nginx | 静的ページ + APIプロキシ（フォーム送信はこちら） |
| 8787 | sp-form-receiver | Node.js APIサーバー |
| 1025 | MailHog SMTP | テストメール受信 |
| 8025 | MailHog Web UI | メール確認画面 |

### 重要な注意点

- **フォーム送信テスト**: http://127.0.0.1:8080/sp/ を使用（1313ではAPIが動作しない）
- **Hugo開発プレビュー**: http://localhost:1313/ （ライブリロード対応、API不可）

---

## 再起動後の起動手順

### 1. Docker Hugo サーバー起動
```bash
cd ~/ドキュメント/fareast-hugo-site
docker compose up -d
```

### 2. sp-form-receiver 起動
```bash
cd ~/ドキュメント/fareast-hugo-site/server/sp-form-receiver
nohup npm start > /tmp/sp-form-receiver.log 2>&1 &
```

### 3. MailHog 起動（テストメール確認用）
```bash
docker run --rm -d --name mailhog -p 8025:8025 -p 1025:1025 mailhog/mailhog
```

### 4. nginx 確認（自動起動済み）
```bash
sudo systemctl status nginx
```

### 5. 動作確認
```bash
# 各サービスのヘルスチェック
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1313/    # Hugo (200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/    # nginx (200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/healthz  # API (200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8025/    # MailHog (200)
```

---

## アクセスURL一覧

| URL | 説明 |
|-----|------|
| http://localhost:1313/ | Hugo開発サーバー（ライブリロード） |
| http://127.0.0.1:8080/sp/ | 一次判定フォーム（API動作） |
| http://127.0.0.1:8080/mypage/login | 進捗確認ログイン |
| http://127.0.0.1:8080/staff/ | スタッフ画面（Basic認証: staff） |
| http://127.0.0.1:8025 | MailHog UI（メール確認） |

---

## ログ確認方法

### sp-form-receiver ログ
```bash
tail -f /tmp/sp-form-receiver.log
```

### Docker Hugo ログ
```bash
docker compose logs -f
```

---

## 現在のブランチ

```
dockerize-hugo
```

※ masterへのマージはまだ行っていない

---

## 関連ドキュメント

- `work_log_20260131.md` - 前日の作業ログ（初期環境構築）
- `docs/info_request_20260201.md` - 職場サーバーからの回答（Docker化ファイル詳細）
- `docs/home_repro_20260131.md` - 自宅PC再現手順書

---

## 作成・変更したファイル

| ファイル | 操作 |
|---------|------|
| `.env` | 新規作成（.env.exampleからコピー） |
| `.docker-cache/` | 新規作成（npm, hugoキャッシュ用） |
| `info_request_20260201.md` | 新規作成（情報要求書） |

---

## 追加作業: Docker Compose 統合（2026-02-01 午後）

### 5. sp-form-receiver と mailhog の Docker Compose 化

#### 目的
- 再起動後の起動手順を `docker compose` 1発に近づける
- nohup 起動を不要にする

#### 参照ドキュメント
- `04_next_steps_home_desktop_claude_code.md`

### 6. 実施内容

#### 6.1 compose.yml の拡張

sp-form-receiver と mailhog をプロファイル付きで追加：

```yaml
# sp-form-receiver: Node.js API サーバー
sp-form-receiver:
  profiles: ["api"]
  build:
    context: ./server/sp-form-receiver
    dockerfile: Dockerfile
  environment:
    BIND_HOST: "0.0.0.0"
    PORT: "8787"
    # ... その他環境変数
  ports:
    - "127.0.0.1:8787:8787"
  volumes:
    - ./server/sp-form-receiver/data:/app/data
  depends_on:
    - mailhog

# MailHog: ローカル開発用テストメールサーバー
mailhog:
  profiles: ["api", "dev"]
  image: mailhog/mailhog:latest
  ports:
    - "127.0.0.1:1025:1025"
    - "127.0.0.1:8025:8025"
```

#### 6.2 sp-form-receiver 用 Dockerfile 作成

`server/sp-form-receiver/Dockerfile`:
```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY index.js ./
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["node", "index.js"]
```

#### 6.3 index.js の修正

Docker コンテナ内で外部からアクセス可能にするため、バインドアドレスを環境変数で制御：

```javascript
// 変更前
app.listen(port, "127.0.0.1", () => { ... });

// 変更後
const host = process.env.BIND_HOST || "127.0.0.1";
app.listen(port, host, () => { ... });
```

#### 6.4 .env の拡張

```env
# ========== sp-form-receiver 設定 ==========
SESSION_SECRET=9aefab2277f4d3c6bd8119efd4b0da064ee9453fe701e0b77a47bc8a3e18f820
SP_FORM_PORT=8787
MAIL_FROM=test@example.com
ADMIN_EMAIL=admin@example.com
MAIL_REQUIRED=false

# ========== MailHog 設定 ==========
MAILHOG_SMTP_PORT=1025
MAILHOG_WEB_PORT=8025
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_SECURE=false
```

### 7. 動作確認結果

#### コンテナ状態
```
hugo               Up    127.0.0.1:1313->1313/tcp
mailhog            Up    127.0.0.1:1025->1025/tcp, 127.0.0.1:8025->8025/tcp
sp-form-receiver   Up    127.0.0.1:8787->8787/tcp
```

#### ヘルスチェック
| サービス | ポート | 結果 |
|---------|-------|------|
| Hugo | 1313 | 200 OK |
| API | 8787 | 200 OK |
| MailHog | 8025 | 200 OK |
| nginx | 8080 | 200 OK |

#### フォーム送信テスト
| 項目 | 結果 |
|------|------|
| 送信 | 成功 (303リダイレクト) |
| 受付番号 | `20260201-f7eb859c73` |
| DB登録 | 完了 |
| メール送信 | 完了（MailHog で確認） |

---

## 更新: 再起動後の起動手順（Docker Compose 統合版）

### 1発で全サービス起動
```bash
cd ~/ドキュメント/fareast-hugo-site
docker compose --profile api --profile dev up -d
```

### nginx 確認（ホスト側、自動起動済み）
```bash
sudo systemctl status nginx
```

### 動作確認
```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1313/       # Hugo (200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/healthz # API (200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8025/        # MailHog (200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/        # nginx (200)
```

---

## 更新: ログ確認方法

### sp-form-receiver ログ（Docker版）
```bash
docker compose logs -f sp-form-receiver
```

### 全サービスログ
```bash
docker compose --profile api --profile dev logs -f
```

---

## 作成・変更したファイル（追加分）

| ファイル | 操作 |
|---------|------|
| `compose.yml` | 変更（sp-form-receiver, mailhog 追加） |
| `server/sp-form-receiver/Dockerfile` | 新規作成 |
| `server/sp-form-receiver/index.js` | 変更（BIND_HOST 対応） |
| `.env` | 変更（sp-form-receiver/mailhog 設定追加） |

---

## 完了条件の達成状況

| 条件 | 状態 |
|------|------|
| docker compose で Hugo + sp-form-receiver + mailhog が起動 | 完了 |
| nohup 起動が不要 | 完了 |
| フォーム送信テスト成功（nginx経由） | 完了 |

---

## 追加作業: Git Push とコンフリクト解決（2026-02-01 夕方）

### 8. SSH鍵によるGitHub認証設定

#### 問題
- GitHubはパスワード認証を廃止済み
- HTTPS経由でのpushが失敗

#### 解決
既存のSSH鍵を使用：
```bash
# SSH鍵の確認
ls -la ~/.ssh/id_*.pub
# → /home/yasuhiro/.ssh/id_ed25519.pub が存在

# SSH接続テスト
ssh -T git@github.com
# → Hi morino-kuma-san! You've successfully authenticated

# リモートURLをSSHに変更
git remote set-url origin git@github.com:morino-kuma-san/fareast-hugo-site.git
```

### 9. コンフリクト解決

#### 発生状況
- 職場サーバー（zerofighter）側でも同様のDocker Compose統合が実施されていた
- `git pull --rebase` でコンフリクト発生

#### コンフリクトファイル
1. `compose.yml`
2. `server/sp-form-receiver/index.js`

#### 解決方針
職場サーバー側の実装を採用：
- `docker/Dockerfile.sp-form-receiver` を使用（職場側が作成）
- 環境変数名に `SP_FORM_` プレフィックス付き
- `bindHost` 変数名を採用

```bash
# コンフリクト解決後
git add compose.yml server/sp-form-receiver/index.js
git rebase --continue
git push origin dockerize-hugo
```

### 10. .env 更新（職場側の設定に合わせる）

#### 新しい環境変数名（SP_FORM_プレフィックス）
```env
# ========== sp-form-receiver (profile: api) ==========
SP_FORM_PORT=8787
SP_FORM_BIND_IP=127.0.0.1
SP_FORM_SESSION_SECRET=83c6119c1987e4766a0d973a72025f470aecf8b71e35eea9723da4ed6d1f1623
SP_FORM_DB_PATH=/app/data/spform.db
SP_FORM_DATA_DIR=/app/data
SP_FORM_ADMIN_EMAIL=admin@example.com
SP_FORM_MAIL_FROM=no-reply@example.com
SP_FORM_MAIL_REQUIRED=false
SP_FORM_SMTP_HOST=mailhog
SP_FORM_SMTP_PORT=1025
SP_FORM_SMTP_SECURE=false
SP_FORM_SMTP_USER=
SP_FORM_SMTP_PASS=

# ========== MailHog (profile: dev) ==========
MAILHOG_WEB_PORT=8025
MAILHOG_SMTP_PORT=1025
```

### 11. 再ビルド・動作確認

```bash
# 既存コンテナ停止
docker compose --profile api --profile dev down

# 再ビルド・起動
docker compose --profile api --profile dev up -d --build
```

#### 最終動作確認結果
| サービス | ポート | 結果 |
|---------|-------|------|
| Hugo | 1313 | 200 OK |
| sp-form-receiver | 8787 | 200 OK |
| MailHog | 8025 | 200 OK |
| nginx | 8080 | 200 OK |

#### フォーム送信テスト
| 項目 | 結果 |
|------|------|
| 送信 | 成功 (303リダイレクト) |
| 受付番号 | `20260201-d528a76c74` |
| DB登録 | 完了 |
| メール送信 | 完了 |

---

## 職場での作業再開手順

### 職場デスクトップPCでの手順

```bash
# 1. リポジトリに移動
cd <リポジトリパス>

# 2. 最新を取得
git fetch origin
git checkout dockerize-hugo
git pull origin dockerize-hugo

# 3. .env 作成
cp .env.example .env

# 4. SESSION_SECRET を生成して .env に設定
openssl rand -hex 32
# → 出力値を SP_FORM_SESSION_SECRET に設定

# 5. キャッシュディレクトリ作成
mkdir -p .docker-cache/npm .docker-cache/hugo

# 6. 起動
docker compose --profile api --profile dev up -d --build

# 7. 動作確認
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:1313/
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/healthz
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8025/
```

---

## 現在のブランチ状況

```
dockerize-hugo (pushed to origin)
```

### コミット履歴
```
3fc48b8 feat: Docker Compose 統合 (sp-form-receiver + mailhog)
bed41f1 feat(docker): add sp-form-receiver & mailhog to compose (職場側)
883a390 docs: add info_request_20260201 with Docker setup response
8f22738 Dockerize Hugo dev environment (compose + pinned Hugo version)
```

---

## 作成・変更したファイル（最終）

| ファイル | 操作 |
|---------|------|
| `compose.yml` | 変更（職場側の変更を採用） |
| `server/sp-form-receiver/index.js` | 変更（bindHost変数名を採用） |
| `.env` | 更新（SP_FORM_プレフィックス対応） |
| `work_log_20260131.md` | 新規作成 |
| `work_log_20260201.md` | 新規作成 |
| `info_request_20260201.md` | 新規作成 |
| その他ドキュメント | push済み |

