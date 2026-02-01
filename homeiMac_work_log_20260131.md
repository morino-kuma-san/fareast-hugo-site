# 作業ログ 2026-01-31

## 概要

`docs/home_repro_20260131.md` の手順書に従い、自宅PCでの一次判定システム環境を構築した。

---

## 実施した作業

### 1. Git同期
```bash
git checkout master
git pull origin master
git submodule update --init --recursive
```
- 結果: 既に最新状態

### 2. Node.js環境確認
- Node.js v22.16.0 (v20以上でOK)
- npm v10.9.2

### 3. sp-form-receiver 設定

#### ディレクトリパスの違い
- 手順書のパス: `/home/yasuhiro/ドキュメント/fareast-hugo-site/hugo_fareast_site/server/sp-form-receiver`
- 実際のパス: `/home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver`

#### 実行したコマンド
```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver
mkdir -p data
npm install
```

#### .env ファイル作成
```bash
openssl rand -hex 32  # SESSION_SECRET生成
```

`.env` の内容:
```env
SESSION_SECRET=9aefab2277f4d3c6bd8119efd4b0da064ee9453fe701e0b77a47bc8a3e18f820
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

### 4. Hugo ビルド

#### ディレクトリパスの違い
- Hugoサイトはルートディレクトリ直下: `/home/yasuhiro/ドキュメント/fareast-hugo-site/`

```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site
npm install
hugo --minify
```
- 結果: 42ページ(JA) + 12ページ(EN) 生成

### 5. nginx 設定

#### インストール
```bash
sudo apt update
sudo apt install -y nginx apache2-utils
```

#### htpasswd 作成
```bash
sudo htpasswd -c /etc/nginx/.htpasswd_staff staff
# パスワード設定済み
```

#### 設定ファイル
- 作成したファイル: `ops/nginx/hugo-fareast.local-8080.conf`
- コピー先: `/etc/nginx/sites-available/hugo-fareast-local`

```bash
sudo cp "/home/yasuhiro/ドキュメント/fareast-hugo-site/ops/nginx/hugo-fareast.local-8080.conf" /etc/nginx/sites-available/hugo-fareast-local
sudo ln -sf /etc/nginx/sites-available/hugo-fareast-local /etc/nginx/sites-enabled/hugo-fareast-local
sudo nginx -t
sudo systemctl reload nginx
```

#### 権限修正
nginxがホームディレクトリにアクセスできるよう権限を修正:
```bash
sudo chmod o+x /home/yasuhiro
```

### 6. 動作確認結果

| URL | ステータス |
|-----|-----------|
| http://127.0.0.1:8080/ | 200 OK |
| http://127.0.0.1:8080/sp/ | 200 OK |
| http://127.0.0.1:8080/mypage/login | 200 OK |
| http://127.0.0.1:8080/staff/ | 401 (Basic認証必要) |
| http://127.0.0.1:8787/healthz | 200 OK |

---

## 再起動後の起動手順

### 1. sp-form-receiver を起動
```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver
npm start
```

### 2. nginx は自動起動済み
確認:
```bash
sudo systemctl status nginx
```

### 3. (オプション) MailHog を起動
Dockerインストール後:
```bash
docker run --rm -p 8025:8025 -p 1025:1025 mailhog/mailhog
```

---

## 未完了・保留事項

- [ ] Docker のインストール（再起動後に実施）
  ```bash
  sudo apt install -y docker.io
  sudo usermod -aG docker $USER
  # → 再ログイン必要
  ```
- [ ] MailHog によるメール送信確認

---

## 補足

### 職場環境との違い
| 項目 | 職場 | 自宅 |
|------|------|------|
| Hugoサイトパス | `hugo_fareast_site/` 配下 | ルート直下 |
| sp-form-receiverパス | `hugo_fareast_site/server/` | `server/` |
| publicパス | `hugo_fareast_site/public` | `public` |

### 作成・変更したファイル
- `/home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver/.env` (新規)
- `/home/yasuhiro/ドキュメント/fareast-hugo-site/ops/nginx/hugo-fareast.local-8080.conf` (新規)
- `/etc/nginx/sites-available/hugo-fareast-local` (コピー)
- `/etc/nginx/.htpasswd_staff` (新規)

---

## 追加作業（2026-01-31 午後）

### 7. サービス起動・動作確認

#### 確認した状態
- nginx: 自動起動済み（active）
- sp-form-receiver: 停止中
- Docker: 既にインストール済み（v28.2.2）

#### sp-form-receiver 起動
```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver
npm start
```

#### MailHog 起動（Docker）
```bash
docker run --rm -d --name mailhog -p 8025:8025 -p 1025:1025 mailhog/mailhog
```

### 8. フォーム送信テスト時の問題対応

#### 問題1: baseURL が localhost:1313 になっていた
- 症状: フォーム送信後に `http://localhost:1313/api/sp-inquiry` で404エラー
- 原因: `config.yaml` の `baseURL` が `http://localhost:1313/` に設定されていた
- 解決: Hugo 再ビルド時に baseURL を指定

```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site
hugo --minify --baseURL "http://127.0.0.1:8080/"
```

#### 問題2: メール送信エラー（sendmail ENOENT）
- 症状: スタッフページで「結果を送信」時に `spawn /usr/sbin/sendmail ENOENT` エラー
- 原因: `createTransport()` 関数が `SMTP_USER` と `SMTP_PASS` の両方が設定されている場合のみ SMTP を使用し、そうでない場合は sendmail にフォールバックしていた。MailHog は認証不要のため、sendmail が使われてしまった。
- 解決: `server/sp-form-receiver/index.js` の `createTransport()` を修正

修正前:
```javascript
if (host && port && user && pass) return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
```

修正後:
```javascript
if (host && port) {
  const opts = { host, port, secure };
  if (user && pass) opts.auth = { user, pass };
  return nodemailer.createTransport(opts);
}
```

修正後、sp-form-receiver を再起動:
```bash
kill $(lsof -t -i :8787)
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver
nohup npm start > /tmp/sp-form-receiver.log 2>&1 &
```

### 9. 最終動作確認結果

| 機能 | 結果 |
|------|------|
| フォーム送信 (/sp/) | OK - /sp/thanks/?rid=... にリダイレクト |
| スタッフ画面 (/staff/) | OK - Basic認証後アクセス可能 |
| 結果送信 | OK - ステータスが「結果送付済み」に更新 |
| メール送信 | OK - MailHog (http://127.0.0.1:8025) で確認可能 |

### 10. MailHog について

MailHog はローカル開発用のテストメールサーバーです。

- メールは実際のアドレスには送信されない
- すべてのメールは MailHog Web UI に蓄積される
- 確認URL: http://127.0.0.1:8025

本番環境では実際の SMTP サーバーを `.env` に設定することで、実際のメールアドレスに配信されます。

---

## 未完了事項の更新

- [x] Docker のインストール → 既にインストール済みだった
- [x] MailHog によるメール送信確認 → 完了

---

## 変更したファイル（追加分）

- `/home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver/index.js` (修正: createTransport関数)
- `/home/yasuhiro/ドキュメント/fareast-hugo-site/public/` (再ビルド: baseURL修正)

---

## Docker環境構築作業（02_home_desktop_claude_code.md に基づく）

### 目的
職場サーバと同じ Docker 環境で Hugo を動かし、環境差分の事故を無くす。

### 11. 事前確認結果

| 項目 | 結果 |
|------|------|
| ホスト名 | yasuhiro-iMac |
| OS | Ubuntu 24.04.3 LTS (noble) |
| Docker | v28.2.2 (docker.io パッケージ) |
| Docker Compose | 未インストール → インストール実施 |
| docker グループ | 所属済み |

### 12. Docker Compose インストール

Ubuntu の `docker-compose-v2` パッケージをインストール（簡易な方法を選択）:

```bash
sudo apt install -y docker-compose-v2
```

結果:
- Docker Compose version 2.37.1+ds1-0ubuntu2~24.04.1 がインストールされた
- `docker compose` コマンドが使用可能になった

### 13. Docker化ファイルの確認

リポジトリを確認したところ、Docker化に必要なファイルが未作成:

| 必要なファイル | 状態 |
|---------------|------|
| `docker-compose.yml` | なし |
| `Dockerfile` | なし |
| `.env.example`（Hugo用） | なし |

origin/main の最新コミット:
- `8cde0ad` - GitHub Actionsワークフローを追加
- `b7f2543` - 一時的にGitHub Actionsを除外
- `e4299ec` - 初期コミット

### 14. 保留事項

- [ ] 職場サーバー（zerofighter）でDocker化ファイルが作成・push されるのを待つ
- [ ] Docker化ファイル取得後、手順書 `02_home_desktop_claude_code.md` のステップ3以降を実行

### 参照ドキュメント

- `02_home_desktop_claude_code.md` - Docker環境構築手順書
- `zerofighter_improvement_proposal_20260131.md` - 職場サーバー向け改善提案

---

## 現在のサービス状態（セッション終了時）

| サービス | 状態 | 備考 |
|---------|------|------|
| nginx | 稼働中 (自動起動) | ポート8080 |
| sp-form-receiver | 稼働中 | ポート8787、nohup で起動 |
| MailHog | 稼働中 | Docker コンテナ、ポート1025/8025 |

### 再起動後の起動手順

```bash
# 1. sp-form-receiver を起動
cd /home/yasuhiro/ドキュメント/fareast-hugo-site/server/sp-form-receiver
nohup npm start > /tmp/sp-form-receiver.log 2>&1 &

# 2. MailHog を起動（テストメール確認用）
docker run --rm -d --name mailhog -p 8025:8025 -p 1025:1025 mailhog/mailhog

# 3. nginx は自動起動済み（確認のみ）
sudo systemctl status nginx

# 4. 動作確認
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/healthz  # 200ならOK
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/         # 200ならOK
```

### アクセスURL一覧

| URL | 説明 |
|-----|------|
| http://127.0.0.1:8080/sp/ | 一次判定フォーム |
| http://127.0.0.1:8080/mypage/login | 進捗確認ログイン |
| http://127.0.0.1:8080/staff/ | スタッフ画面（Basic認証: staff） |
| http://127.0.0.1:8025 | MailHog UI（メール確認） |
