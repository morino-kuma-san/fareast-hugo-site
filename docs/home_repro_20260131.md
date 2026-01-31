# 自宅PCでの再現手順書（2026-01-31）

本手順書は、職場環境（zerofighter + server300）で構築した一次判定システム（Phase1〜Phase2-Commit4）を、自宅PCで再現するためのガイドです。

## 前提条件

- Ubuntu / macOS / WSL2
- Git がインストール済み
- Node.js v20以上（推奨: nvm で v24系）
- Hugo Extended（推奨: v0.120以上）
- Docker（MailHog用、任意）
- nginx（ローカルプロキシ用）

---

## 1. Git同期

```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site
git checkout master
git pull origin master
git submodule update --init --recursive
git status
```

---

## 2. Node.js 環境確認

```bash
# nvm を使っている場合
nvm use 24
node -v  # v24.x.x

# または
node -v  # v20以上であればOK
```

---

## 3. MailHog（ローカルSMTP受信）

Dockerが使える場合（推奨）:

```bash
docker run --rm -p 8025:8025 -p 1025:1025 mailhog/mailhog
```

ブラウザで http://127.0.0.1:8025 を開くと、送信されたメールを確認できます。

---

## 4. sp-form-receiver の設定

### 4.1 .env ファイル作成

```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/hugo_fareast_site/server/sp-form-receiver
cp .env.local.example .env
```

### 4.2 SESSION_SECRET を生成して設定

```bash
openssl rand -hex 32
```

出力された値を `.env` の `SESSION_SECRET=` に貼り付け。

### 4.3 .env の内容確認

```env
SESSION_SECRET=<上で生成した値>
DB_PATH=./data/spform.db
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=test@example.com
ADMIN_EMAIL=admin@example.com
MAIL_REQUIRED=false
PORT=8787
DATA_DIR=./data
```

---

## 5. Node 起動

```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/hugo_fareast_site/server/sp-form-receiver
npm install
npm start
```

別ターミナルで疎通確認:

```bash
curl -i http://127.0.0.1:8787/healthz
# => HTTP/1.1 200 OK
# => ok
```

---

## 6. Hugo ビルド（public生成）

```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/hugo_fareast_site
npm install  # Tailwind等の依存
hugo --minify
ls -la public | head
```

---

## 7. nginx 設定

### 7.1 htpasswd 作成（/staff 用 Basic認証）

```bash
sudo apt update
sudo apt install -y nginx apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd_staff staff
# パスワードを入力
```

### 7.2 nginx 設定ファイルをコピー

```bash
# 設定例をコピー（パスは自宅環境に合わせて編集）
sudo cp /home/yasuhiro/ドキュメント/fareast-hugo-site/hugo_fareast_site/ops/nginx/hugo-fareast.local-8080.conf.example \
  /etc/nginx/sites-available/hugo-fareast-local

# 設定ファイル内の public パスを編集
sudo nano /etc/nginx/sites-available/hugo-fareast-local
# root の行を自宅環境に合わせる:
# root /home/yasuhiro/ドキュメント/fareast-hugo-site/hugo_fareast_site/public;
```

### 7.3 有効化・再読込

```bash
sudo ln -sf /etc/nginx/sites-available/hugo-fareast-local /etc/nginx/sites-enabled/hugo-fareast-local
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. 動作確認

### 8.1 URL一覧

| URL | 説明 |
|-----|------|
| http://127.0.0.1:8080/sp/ | 一次判定フォーム |
| http://127.0.0.1:8080/sp/thanks/?rid=... | 送信完了ページ |
| http://127.0.0.1:8080/mypage/login | 進捗確認ログイン |
| http://127.0.0.1:8080/mypage/ | 進捗確認ページ |
| http://127.0.0.1:8080/staff/ | スタッフ画面（Basic認証） |
| http://127.0.0.1:8025 | MailHog UI |

### 8.2 確認シナリオ

1. `/sp/` からフォーム送信
   - 303 で `/sp/thanks/?rid=xxxxxxxx-xxxxxxxxxx` にリダイレクト
2. MailHog（http://127.0.0.1:8025）でメール確認
   - ユーザー宛: 受付番号 + アクセスキー
   - 管理者宛: 受付通知
3. `/mypage/login` で受付番号 + アクセスキーを入力
   - ログイン後、進捗表示
4. `/staff/` にアクセス（Basic認証: staff / 設定したパスワード）
   - 案件一覧 → 詳細
5. スタッフ画面で「テンプレ挿入」→「Green」ボタン
   - 結果本文が自動入力される
6. 「結果を保存」→「結果をメール送信」
   - MailHog でユーザー宛結果メール確認
7. `/mypage/` で結果表示 + 無料精査(B) CTA
8. 「無料精査(B)を依頼する」ボタン
   - ステータスが b_requested に変更
   - MailHog で管理者宛通知確認

---

## トラブルシューティング

### better-sqlite3 のビルドエラー

```bash
# ビルドツールをインストール
sudo apt install -y build-essential python3
npm rebuild better-sqlite3
```

### ポート競合

```bash
# 8080 が使用中の場合
sudo lsof -i :8080
# nginx 設定の listen を別ポート（例: 8081）に変更
```

### DB ファイルが作成されない

```bash
# data ディレクトリを手動作成
mkdir -p /home/yasuhiro/ドキュメント/fareast-hugo-site/hugo_fareast_site/server/sp-form-receiver/data
```

---

## 補足

- 本番環境（server300）との違い:
  - DB_PATH: 本番は `/var/lib/sp-form-receiver/spform.db`、ローカルは `./data/spform.db`
  - MAIL_REQUIRED: 本番は `true`、ローカルは `false`
  - SMTP: 本番は実SMTP、ローカルは MailHog
- /staff の Basic認証パスワードはローカル用に別途設定

以上。
