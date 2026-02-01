# 作業記録 2026-01-31

## 概要

Phase1 公開最低ライン整備タスクを完了した。

---

## 1. Git同期問題の解決

### 状況
- Claude Code環境（zerofighter）: `master` ブランチ
- 自宅PC（yasuhiro）: `design/final` ブランチ（古いブランチ）
- 両環境でブランチが異なっていた

### 解決手順
1. 自宅PCで未追跡ファイル（古いバックアップ）を削除
   ```bash
   git clean -fd
   ```
2. `master` ブランチに切り替え
   ```bash
   git checkout master
   git pull origin master
   git submodule update --init --recursive
   ```

### 結果
- 両環境が `master` ブランチで同期完了
- Blowfishテーマ（サブモジュール）も v2.88.1 で一致

---

## 2. Phase1 公開最低ライン実装

### 参照ドキュメント
- `sp_phase1_public_minimum_tasks_20260130.md`

### 作業ブランチ
- `feat/sp-phase1-public-minimum`（後に `master` へマージ）

### 実装内容

#### 2.1 /sp フォーム修正 (`layouts/sp/list.html`)
- `action="#"` → `action="/api/sp-inquiry"`
- `method="POST"` 設定
- honeypot（`hp_company`）追加
- name属性の修正:
  - `email_sub` → `email_backup`
  - `has_logo` → `logo`
  - `ref_url` → `reference_url`
- CSS `.sp-honeypot` 追加（画面外に配置）

#### 2.2 完了ページ追加
- `content/sp/thanks.md` - コンテンツ
- `layouts/sp/thanks.html` - レイアウト

#### 2.3 受信API (`server/sp-form-receiver/`)
| ファイル | 内容 |
|----------|------|
| `package.json` | 依存関係（express, helmet, nodemailer, dotenv） |
| `.gitignore` | .env, data/ を除外 |
| `.env.example` | 設定例 |
| `index.js` | メイン処理 |

**API仕様**:
- `POST /api/sp-inquiry` でフォームデータ受信
- honeypotが入力されていたら保存しない（200で静かに捨てる）
- 必須項目検証（商標、商品・サービス、メール、メール確認）
- JSONファイルとして `data/` に永続保存
- 担当者にメール通知（ベストエフォート）
- 成功時は `303` で `/sp/thanks/` にリダイレクト

#### 2.4 運用例ファイル
- `ops/nginx/sp-form-receiver.conf.example`
- `ops/systemd/sp-form-receiver.service.example`

#### 2.5 テスト更新 (`tests/sp-page.test.js`)
追加テスト:
- フォーム送信設定（method, action）
- honeypot存在確認
- `/sp/thanks/` ページ生成・内容確認

**テスト結果**: 40/40 PASS

---

## 3. ローカル動作確認

### 3.1 API起動
```bash
cd hugo_fareast_site/server/sp-form-receiver
npm install
cp .env.example .env
# .env の ADMIN_EMAIL を設定
npm start
```

### 3.2 curlテスト

**正常送信テスト**:
```bash
curl -i -X POST http://127.0.0.1:8787/api/sp-inquiry \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "trademark_text=TEST商標" \
  --data-urlencode "goods_services=テスト商品" \
  --data-urlencode "email=test@example.com" \
  --data-urlencode "email_confirm=test@example.com"
```
結果: `303 See Other` → `/sp/thanks/` にリダイレクト、JSONファイル保存成功

**honeypotテスト**:
```bash
curl -i -X POST http://127.0.0.1:8787/api/sp-inquiry \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "hp_company=BOT_SPAM" \
  --data-urlencode "trademark_text=SPAM" \
  ...
```
結果: `200 OK` だがJSONファイルは保存されない（スパム対策成功）

### 3.3 メール送信
- この環境にはsendmailがインストールされていないため、メール送信は失敗
- ログに警告を出力し、処理は続行（ベストエフォート）
- 本番環境ではSMTP設定またはsendmailインストールが必要

---

## 4. コミット履歴

### コミット1: 7b0162e
```
feat: Phase1 public minimum (receiver + thanks + honeypot)

- /sp form: action="/api/sp-inquiry", method="POST"
- /sp form: honeypot (hp_company) added for spam protection
- /sp form: name attributes fixed (email_backup, logo, reference_url)
- /sp/thanks/: completion page added
- server/sp-form-receiver/: Node/Express API for form submission
- ops/: nginx and systemd example configs
- tests: 40 tests all passing
```

### コミット2: 633b5d3
```
fix: add dotenv and make email notification best-effort

- Add dotenv dependency for .env file loading
- Make email notification non-blocking (log error but continue)
- JSON persistence is mandatory, email is best-effort
```

---

## 5. 受け入れ判定

| 項目 | 状態 |
|------|------|
| `/sp/` の form action が `#` ではない | ✓ `/api/sp-inquiry` |
| `/api/sp-inquiry` が受けられ、JSON永続化される | ✓ テスト成功 |
| 担当通知メールが届く | △ sendmailなし（本番で設定要） |
| `/sp/thanks/` が存在し、送信成功時に遷移する | ✓ 303リダイレクト |
| honeypot が効いている | ✓ 保存されない |
| Jest のテストが全PASS | ✓ 40/40 |

---

## 6. 本番環境での残作業

1. **SMTP設定**（または sendmail インストール）
   - `.env` に SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS を設定

2. **Nginx プロキシ設定**
   - `ops/nginx/sp-form-receiver.conf.example` を参考に設定

3. **systemd でAPI常駐化**
   - `ops/systemd/sp-form-receiver.service.example` を参考に設定

---

## 7. 自宅PCでの同期コマンド

```bash
cd ~/ドキュメント/fareast-hugo-site
git pull origin master
```

---

## 8. 検討用本番環境（server300）構築

### 8.1 サーバー環境調査

#### サーバー構成

```
[外部インターネット]
        ↓
        ↓ (外部からアクセス可能)
        ↓
┌─────────────────────────────────────────┐
│  server300 (mypage-server)              │
│  IP: 10.0.1.61 / 10.0.1.150            │
│  役割: 検討用本番環境 (proxyサーバー)   │
│  ・Squid Proxy (ポート3128)             │
│  ・SSH (ポート2718)                     │
│  ・Samba (ポート139, 445)              │
└─────────────────────────────────────────┘
        ↓
        ↓ SSH経由で接続可能
        ↓
┌─────────────────────────────────────────┐
│  zerofighter                            │
│  IP: 10.0.1.54                          │
│  役割: 中継サーバー（開発環境）         │
│  ・Claude Code実行環境                  │
│  ・Hugoサイト開発                       │
└─────────────────────────────────────────┘
```

#### server300 スペック

| 項目 | 内容 |
|------|------|
| ホスト名 | mypage-server |
| OS | Ubuntu 24.04.3 LTS |
| IPアドレス | 10.0.1.150（プライマリ）, 10.0.1.61（セカンダリ） |
| ディスク | 915GB中 18GB使用（空き852GB） |
| Node.js | v24.5.0 |
| npm | 11.5.2 |

#### 接続コマンド

```bash
ssh -p 2718 server300@10.0.1.61
```

---

### 8.2 環境構築手順

#### Step 1: Nginxインストール

```bash
sudo apt update && sudo apt install -y nginx
```

#### Step 2: Hugo Extendedインストール

```bash
wget https://github.com/gohugoio/hugo/releases/download/v0.142.0/hugo_extended_0.142.0_linux-amd64.deb
sudo dpkg -i hugo_extended_0.142.0_linux-amd64.deb
rm hugo_extended_0.142.0_linux-amd64.deb
```

#### Step 3: サイトファイル転送（zerofighterから実行）

```bash
rsync -avz --progress -e "ssh -p 2718" \
  /home/zerofighter/ドキュメント/wordPress移行/hugo_fareast_site/ \
  server300@10.0.1.61:~/hugo_fareast_site/
```

#### Step 4: Hugoビルド

```bash
cd ~/hugo_fareast_site && hugo --minify
```

#### Step 5: パーミッション設定

```bash
chmod o+x /home/server300
chmod o+x /home/server300/hugo_fareast_site
```

#### Step 6: Nginx設定

```bash
sudo tee /etc/nginx/sites-available/hugo-fareast > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    root /home/server300/hugo_fareast_site/public;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/hugo-fareast /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

#### Step 7: sp-form-receiver セットアップ

```bash
cd ~/hugo_fareast_site/server/sp-form-receiver
npm install
cp .env.example .env
```

#### Step 8: systemdサービス設定

```bash
sudo tee /etc/systemd/system/sp-form-receiver.service > /dev/null << 'EOF'
[Unit]
Description=SP Form Receiver (Hugo /sp)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/server300/hugo_fareast_site/server/sp-form-receiver
ExecStart=/home/server300/.nvm/versions/node/v24.5.0/bin/node index.js
Restart=always
User=server300
Group=server300

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start sp-form-receiver
sudo systemctl enable sp-form-receiver
```

---

### 8.3 構築結果

| 項目 | 状態 |
|------|------|
| Nginx | ✓ 稼働中 |
| Hugo Extended | ✓ v0.142.0 インストール済み |
| Hugoサイト | ✓ ビルド済み・公開中 |
| sp-form-receiver API | ✓ systemdで常駐化・自動起動設定済み |
| フォーム送信テスト | ✓ 303リダイレクト成功、JSONファイル保存確認 |

### 8.4 アクセスURL

| URL | 内容 |
|-----|------|
| `http://10.0.1.61/` | トップページ |
| `http://10.0.1.61/sp/` | SPフォーム |
| `http://10.0.1.61/sp/thanks/` | 送信完了ページ |

---

### 8.5 今後の残作業

1. **SMTP設定**（メール通知を有効化する場合）
   - `.env` の `SMTP_*` を設定

2. **外部公開設定**（必要に応じて）
   - ドメイン設定
   - SSL証明書（Let's Encrypt等）

---

## 9. セキュリティ強化（4点セット）

参照ドキュメント: `server300（検討用本番）を「公開サーバとして安全な形」に寄せる（4点セット）.md`

### 9.1 タスク1: UFW設定（役割ベースに絞る）

#### 変更前
```
10.0.1.0/24 から全ポート許可（広すぎる）
```

#### 変更後
```
2718/tcp ALLOW IN 10.0.1.54  # SSH from zerofighter
80/tcp   ALLOW IN 124.211.197.9  # Web from specific IP
```

#### 実行コマンド
```bash
sudo ufw allow from 10.0.1.54 to any port 2718 proto tcp comment 'SSH from zerofighter'
sudo ufw allow from 124.211.197.9 to any port 80 proto tcp comment 'Web from specific IP'
sudo ufw delete 1  # 10.0.1.0/24の広い許可を削除
sudo ufw delete <番号>  # Anywhereの許可を削除
```

---

### 9.2 タスク2: 不要サービス停止

#### 停止したサービス
| サービス | ポート | 状態 |
|----------|--------|------|
| Squid | 3128 | ✓ 停止・無効化 |
| Samba (smbd/nmbd) | 139, 445 | ✓ 停止・無効化 |
| Avahi | 5353 | ✓ 停止・無効化 |
| CUPS | 631 | ✓ 停止・無効化 |

#### 実行コマンド
```bash
sudo systemctl disable --now squid
sudo systemctl disable --now smbd nmbd
sudo systemctl disable --now avahi-daemon
sudo systemctl disable --now cups
```

---

### 9.3 タスク3: Nginx /api最小化

#### 変更内容
- `/api/sp-inquiry` のみ許可（完全一致）
- POST限定（GET等は403）
- rate limit追加（10r/m, burst=5）
- `/api/` への他アクセスは404

#### nginx.conf追加（http {}内）
```nginx
limit_req_zone $binary_remote_addr zone=spform:10m rate=10r/m;
```

#### サイト設定（/etc/nginx/sites-available/hugo-fareast）
```nginx
server {
    listen 80;
    server_name _;

    root /home/server300/hugo_fareast_site/public;
    index index.html;

    location = /api/sp-inquiry {
        limit_req zone=spform burst=5 nodelay;
        proxy_pass http://127.0.0.1:8787/api/sp-inquiry;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 64k;
        limit_except POST { deny all; }
    }

    location ^~ /api/ {
        return 404;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

#### 動作確認結果
| テスト | 期待値 | 結果 |
|--------|--------|------|
| `/api/` | 404 | ✓ 404 |
| `GET /api/sp-inquiry` | 403 | ✓ 403 |
| `POST /api/sp-inquiry` | 303 | ✓ 303 |

---

### 9.4 タスク4: SMTP設定（メール通知）

#### 9.4.1 実施した作業

1. **Postfixインストール**
   ```bash
   sudo apt update && sudo apt install -y postfix mailutils
   ```
   - 初期設定: "Local only"
   - 後に "Internet Site" に再設定

2. **.env設定**
   ```
   ADMIN_EMAIL=patentattorney@kxd.biglobe.ne.jp
   MAIL_FROM=noreply@mypage-server.fareastpatent.internal
   ```

3. **Postfix再設定（Internet Site）**
   ```bash
   sudo dpkg-reconfigure postfix
   ```
   - `inet_interfaces = all` に変更

#### 9.4.2 試行錯誤の履歴

| 試行 | 送信元 | 結果 |
|------|--------|------|
| Postfix (Local only) | - | 外部配送不可（bounced） |
| Postfix (Internet Site) + Gmail From | `zerofighta@gmail.com` | `status=sent` だが配信されず（SPF認証失敗） |
| Postfix (Internet Site) + internal | `noreply@mypage-server.fareastpatent.internal` | `553 unable to verify address` で拒否 |
| **lolipop SMTP** | `info@ahirutokyo.com` | **✓ 成功** |

#### 9.4.3 最終解決策：外部SMTP認証

**Postfixを停止し、lolipop SMTPを使用**

```bash
sudo systemctl disable --now postfix
```

#### 9.4.4 最終設定ファイル

**server300:/home/server300/hugo_fareast_site/server/sp-form-receiver/.env**
```
PORT=8787
DATA_DIR=./data

# 通知先・送信元
ADMIN_EMAIL=info@ahirutokyo.com
MAIL_FROM=info@ahirutokyo.com

# lolipop SMTP
SMTP_HOST=smtp.lolipop.jp
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=m10204904-info
SMTP_PASS=（秘匿）

# メール送信失敗時は500を返す
MAIL_REQUIRED=true
```

#### 9.4.5 index.js変更（MAIL_REQUIRED対応）

```javascript
const mailRequired = String(process.env.MAIL_REQUIRED || "").toLowerCase() === "true";
// メール送信失敗時、mailRequired=true なら 500 を返す
```

#### 9.4.6 メール受信確認

- **受信日時**: 2026/01/31 13:55:55
- **件名**: 一次判定 /sp 受付: ahirutokyo宛テスト
- **送信元**: info@ahirutokyo.com
- **宛先**: info@ahirutokyo.com
- **結果**: ✓ 正常受信

---

### 9.5 4点セット完了状況

| タスク | 内容 | 状態 |
|--------|------|------|
| タスク1 | UFWを役割ベースに絞る | ✓ 完了 |
| タスク2 | 不要サービス停止 | ✓ 完了 |
| タスク3 | Nginx /api最小化 | ✓ 完了 |
| タスク4 | SMTP設定 | ✓ 完了 |

---

### 9.6 本番運用時の注意事項

1. **ADMIN_EMAIL変更時**
   - 現在は開発用（`info@ahirutokyo.com`）
   - 本番用（`patentattorney@kxd.biglobe.ne.jp`）に送信する場合、BIGLOBE SMTPを使用するか、別の対策が必要

2. **秘密情報の管理**
   - `.env` はリポジトリに含めない（`.gitignore`済み）
   - SMTP_PASSは安全に管理

---

## 10. 仕上げ（secret/dataの運用整形）

参照ドキュメント: `server300仕上げ.md`

### 10.1 A. secret（.env）をroot管理へ移行

#### 実施内容

```bash
sudo mkdir -p /etc/sp-form-receiver
sudo cp /home/server300/hugo_fareast_site/server/sp-form-receiver/.env /etc/sp-form-receiver/sp-form-receiver.env
sudo chown root:root /etc/sp-form-receiver/sp-form-receiver.env
sudo chmod 600 /etc/sp-form-receiver/sp-form-receiver.env
```

#### systemd変更

`/etc/systemd/system/sp-form-receiver.service` に追加:
```
EnvironmentFile=/etc/sp-form-receiver/sp-form-receiver.env
```

---

### 10.2 B. 受領データを /var/lib に移設

#### 実施内容

```bash
sudo mkdir -p /var/lib/sp-form-receiver/data
sudo chown -R server300:server300 /var/lib/sp-form-receiver
sudo chmod -R 700 /var/lib/sp-form-receiver
```

#### env更新

```
DATA_DIR=/var/lib/sp-form-receiver/data
```

#### 動作確認

- 303リダイレクト成功
- JSONファイルが `/var/lib/sp-form-receiver/data/` に保存される
- メール通知成功

---

### 10.3 C. UFW（zerofighterから80許可追加）

```bash
sudo ufw allow from 10.0.1.54 to any port 80 proto tcp comment 'Web test from zerofighter'
```

#### 最終UFW状態

| ルール | 説明 |
|--------|------|
| 2718/tcp from 10.0.1.54 | SSH from zerofighter |
| 80/tcp from 124.211.197.9 | Web from specific IP |
| 80/tcp from 10.0.1.54 | Web test from zerofighter |

---

### 10.4 最終ディレクトリ構成

| パス | 用途 | パーミッション |
|------|------|----------------|
| `/etc/sp-form-receiver/sp-form-receiver.env` | 秘密情報（SMTP_PASS等） | root:root 600 |
| `/var/lib/sp-form-receiver/data/` | 受領データ（JSON） | server300:server300 700 |
| `/home/server300/hugo_fareast_site/` | Hugoサイト・APIコード | server300:server300 |

---

### 10.5 Phase2準備（方針）

| 項目 | 方針 |
|------|------|
| 受付番号 | thanks画面に表示（yyyymmdd-ランダム） |
| アクセスキー | メールで送る（URLに載せない） |
| 保存 | SQLite推奨 |
| ハッシュ | access_keyは平文保存せず、ハッシュで保存 |

---

## 11. Phase2-Commit1（受付番号＋アクセスキー即発行 / SQLite）

参照ドキュメント: `ClaudeCode依頼：Phase2-Commit1（受付番号＋アクセスキー即発行SQLite）.md`

### 11.1 実装概要

| 項目 | 内容 |
|------|------|
| DB | SQLite（better-sqlite3） |
| DBファイル | `/var/lib/sp-form-receiver/spform.db` |
| 受付番号 | `yyyymmdd-ランダム6文字(hex)` 例: `20260131-240fdc` |
| アクセスキー | 24文字（紛らわしい文字除外）、scryptでハッシュ保存 |

---

### 11.2 DBスキーマ

```sql
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  trademark_text TEXT NOT NULL,
  goods_services TEXT NOT NULL,
  email_backup TEXT,
  logo TEXT,
  usage_status TEXT,
  reference_url TEXT,
  access_key_hash TEXT NOT NULL,
  access_key_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
```

---

### 11.3 index.js 変更点

#### 追加インポート
```javascript
const Database = require("better-sqlite3");
```

#### 追加関数
| 関数 | 説明 |
|------|------|
| `generateReceiptId()` | 受付番号生成（yyyymmdd-hex6桁） |
| `generateAccessKey()` | アクセスキー生成（24文字、紛らわしい文字除外） |
| `hashAccessKey(accessKey)` | scryptでハッシュ化（salt + hash） |
| `initDatabase()` | DB接続 |

#### 処理フロー変更
1. receipt_id / access_key 生成
2. access_key をscryptでハッシュ化
3. SQLiteにINSERT
4. JSON保存（既存互換・バックアップ用）
5. ユーザー宛メール（receipt_id + access_key）
6. 担当宛メール（receipt_id + 入力内容、access_keyなし）
7. 303リダイレクト → `/sp/thanks/?rid=<receipt_id>`

---

### 11.4 thanks.html 変更点

#### 追加機能
- URLクエリ `?rid=` から受付番号を読み取り
- 受付番号を画面に表示（形式チェック付き）
- `<meta name="referrer" content="no-referrer">` 追加（Referrer漏洩防止）
- 外部リソースは使用しない

#### 表示例
```
┌─────────────────────────────┐
│      ✓ 受付完了             │
│                             │
│    ┌─────────────────┐      │
│    │   受付番号        │      │
│    │ 20260131-240fdc │      │
│    └─────────────────┘      │
│                             │
│  一次判定のお申し込みを...  │
└─────────────────────────────┘
```

---

### 11.5 メールテンプレート

#### ユーザー宛
```
件名: 【受付番号のご案内】一次判定お申込み

一次判定のお申込みありがとうございます。

受付番号: 20260131-240fdc
アクセスキー: ************************

※アクセスキーは再発行できませんので、大切に保管してください。
※今後の進捗確認に必要となります。

--
FarEast国際特許事務所
```

#### 担当宛
```
件名: 一次判定 受付 [20260131-240fdc]: Phase2テスト商標

一次判定の申込みを受領しました。

受付番号: 20260131-240fdc
受領日時: 2026-01-31T06:08:02.801Z
IP: ...
UA: ...

--- 入力内容 ---
商標（文字）: Phase2テスト商標
商品・サービス: テスト商品サービス
メール: info@ahirutokyo.com
...

JSON保存先: /var/lib/sp-form-receiver/data/...
```

---

### 11.6 動作確認結果

#### curlテスト
```bash
curl -i -X POST http://127.0.0.1/api/sp-inquiry \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'trademark_text=Phase2テスト商標' \
  --data-urlencode 'goods_services=テスト商品サービス' \
  --data-urlencode 'email=info@ahirutokyo.com' \
  --data-urlencode 'email_confirm=info@ahirutokyo.com'
```

#### 結果
```
HTTP/1.1 303 See Other
Location: /sp/thanks/?rid=20260131-240fdc
```

#### journalctlログ
```
[db] inserted receipt_id=20260131-240fdc
[saved] /var/lib/sp-form-receiver/data/2026-01-31T06-08-02-905Z_015848736cb4.json
[mail] user notification sent to info@ahirutokyo.com
[mail] admin notification sent to info@ahirutokyo.com
```

#### メール受信確認
- **受信日時**: 2026/01/31 15:08:04
- **件名**: 【受付番号のご案内】 一次判定お申込み
- **受付番号**: 20260131-240fdc
- **アクセスキー**: 54jTFPWjL4zvBMzTCCTAfCMp（24文字）

---

### 11.7 DoD（完了定義）達成状況

| 項目 | 状態 |
|------|------|
| /sp送信で receipt_id と access_key を発行 | ✅ |
| access_key は平文保存しない（ハッシュ保存） | ✅ scrypt使用 |
| ユーザー宛に receipt_id + access_key をメール送信 | ✅ 受信確認済み |
| 担当宛に receipt_id を含めて通知 | ✅ |
| /sp/thanks/ に receipt_id を表示 | ✅ |
| MAIL_REQUIRED=true でメール失敗時500 | ✅ |
| 既存Phase1仕様を壊さない | ✅ JSON保存・303遷移維持 |

---

### 11.8 今後の残作業（Phase2-Commit2以降）

1. **進捗確認ページ**（受付番号＋アクセスキーで認証）→ Commit2で実装完了
2. **担当者管理画面**（受付一覧・ステータス更新）
3. **本番メールアドレスへの切り替え**

---

## 12. Phase2-Commit2（進捗確認ページ / 受付番号＋アクセスキー認証）

参照ドキュメント: `phase2_commit2_mypage_progress_20260131.md`

### 12.1 実装概要

| 項目 | 内容 |
|------|------|
| 認証方式 | 受付番号＋アクセスキー（scrypt検証 + timingSafeEqual） |
| セッション | 署名付きcookie（HMAC-SHA256、24時間有効） |
| ステータス管理 | SQLite（status, status_updated_at, status_note カラム追加） |

---

### 12.2 DB拡張（マイグレーション）

```sql
ALTER TABLE inquiries ADD COLUMN status TEXT NOT NULL DEFAULT 'received';
ALTER TABLE inquiries ADD COLUMN status_updated_at TEXT;
ALTER TABLE inquiries ADD COLUMN status_note TEXT;
```

起動時に自動マイグレーション（カラム存在チェック後に追加）。

---

### 12.3 追加URL一覧

| URL | メソッド | 機能 |
|-----|----------|------|
| `/mypage/login` | GET | ログインフォーム表示 |
| `/mypage/login` | POST | 認証（受付番号＋アクセスキー） |
| `/mypage/logout` | POST | ログアウト（Cookie削除） |
| `/mypage/` | GET | 進捗確認ページ |

---

### 12.4 ステータス日本語ラベル

| 値 | 表示 |
|----|------|
| `received` | 受付済み |
| `reviewing` | 確認中 |
| `result_sent` | 結果送付済み |
| `closed` | 完了 |

---

### 12.5 index.js 追加機能

#### 追加関数
| 関数 | 説明 |
|------|------|
| `verifyAccessKey(inputKey, storedHash, storedSalt)` | scrypt + timingSafeEqual で検証 |
| `createSessionToken(receiptId)` | 署名付きセッショントークン生成 |
| `verifySessionToken(token)` | トークン検証（改ざん・期限チェック） |
| `parseCookies(cookieHeader)` | Cookie解析 |
| `loginPageHtml(error)` | ログインフォームHTML生成 |
| `mypageHtml(inquiry)` | 進捗表示ページHTML生成 |

#### セキュリティ対策
- Cookie: `HttpOnly; SameSite=Lax; Path=/mypage; Max-Age=86400`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- Referrer-Policy: `no-referrer`
- 外部リソース読み込みなし

---

### 12.6 CLIスクリプト

**ファイル**: `server/sp-form-receiver/scripts/staff_update_status.js`

**使い方**:
```bash
# ステータス更新
node scripts/staff_update_status.js 20260131-240fdc reviewing

# メモ付き更新
node scripts/staff_update_status.js 20260131-240fdc result_sent "結果をメール送信済み"
```

**出力例**:
```
Updated: 20260131-240fdc
  Previous status: received
  New status: reviewing
  Updated at: 2026-01-31T06:34:35.975Z
```

---

### 12.7 Nginx設定変更

#### nginx.conf追加
```nginx
limit_req_zone $binary_remote_addr zone=mypage:10m rate=30r/m;
```

#### sites-available/hugo-fareast 追加
```nginx
# /mypage (Phase2-Commit2追加)
location ^~ /mypage {
    limit_req zone=mypage burst=10 nodelay;
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 64k;
    limit_except GET POST { deny all; }
}
```

---

### 12.8 環境変数追加

**/etc/sp-form-receiver/sp-form-receiver.env**:
```
# Session secret for /mypage
SESSION_SECRET=633095e6cf17ae621416a3e471cbe3b37c1b6dafe992e1965fe0e2b2173dc38d
```

---

### 12.9 動作確認結果

#### /mypage/login 表示
```bash
curl -s http://127.0.0.1/mypage/login | head -5
# → ログインフォームHTML表示OK
```

#### 正しい認証でログイン
```
HTTP/1.1 303 See Other
Set-Cookie: sp_session=...; HttpOnly; SameSite=Lax; Path=/mypage; Max-Age=86400
Location: /mypage/
```

#### 誤った認証
```html
<p style="color:#dc2626">受付番号またはアクセスキーが正しくありません。</p>
```

#### 進捗表示ページ
```html
<span class="status-badge status-received">受付済み</span>
```

#### CLIステータス更新後
```html
<span class="status-badge status-reviewing">確認中</span>
```

#### ログアウト
```
HTTP/1.1 303 See Other
Set-Cookie: sp_session=; ... Max-Age=0
Location: /mypage/login
```

#### 既存フロー維持
```
POST /api/sp-inquiry → 303 → /sp/thanks/?rid=20260131-9ebb30
```

#### journalctlログ
```
[mypage] login success for receipt_id=20260131-240fdc
[mypage] login failed for receipt_id=20260131-240fdc
[db] inserted receipt_id=20260131-9ebb30
[mail] user notification sent to info@ahirutokyo.com
[mail] admin notification sent to info@ahirutokyo.com
```

---

### 12.10 DoD（完了定義）達成状況

| 項目 | 状態 |
|------|------|
| /mypage/ で受付番号＋アクセスキーでログイン | ✅ |
| ログイン後、進捗ステータス表示 | ✅ |
| access_key は平文保存しない（scryptハッシュ検証） | ✅ |
| セッションはcookie（HttpOnly, SameSite）で保持 | ✅ |
| ログアウトできる | ✅ |
| ブルートフォース対策（Nginx rate limit） | ✅ 30r/m |
| 既存の /sp → /api/sp-inquiry 挙動維持 | ✅ |

---

### 12.11 今後の残作業（Phase2-Commit3以降）

1. **簡易スタッフ画面**（一覧・検索・ステータス更新）→ Commit3で実装完了
2. **結果テンプレート**（Red/Yellow/Green）をDBに保存してmypage表示 → Commit3で実装完了
3. **本番メールアドレスへの切り替え**

---

## 13. Phase2-Commit3（スタッフ画面 + 結果テンプレ Red/Yellow/Green）

参照ドキュメント: `phase2_commit3_staff_and_result_templates_20260131.md`

### 13.1 実装概要

| 項目 | 内容 |
|------|------|
| スタッフ画面 | LAN限定 + Basic認証で保護 |
| 結果テンプレ | Red/Yellow/Green + 自由記述 |
| 衝突耐性 | receipt_id を hex6 → hex10 に変更 |

---

### 13.2 DB拡張（マイグレーション）

```sql
ALTER TABLE inquiries ADD COLUMN result_level TEXT;
ALTER TABLE inquiries ADD COLUMN result_body TEXT;
ALTER TABLE inquiries ADD COLUMN result_updated_at TEXT;
ALTER TABLE inquiries ADD COLUMN result_sent_at TEXT;
```

起動時に自動マイグレーション。

---

### 13.3 追加URL一覧（/staff）

| URL | メソッド | 機能 |
|-----|----------|------|
| `/staff/` | GET | 案件一覧（ステータス絞り込み可） |
| `/staff/inquiry/:rid` | GET | 案件詳細 |
| `/staff/inquiry/:rid/status` | POST | ステータス更新 |
| `/staff/inquiry/:rid/result` | POST | 結果保存（level + body） |
| `/staff/inquiry/:rid/send-result` | POST | 結果メール送信 |

---

### 13.4 結果レベルラベル

| 値 | 表示 | 色 |
|----|------|-----|
| `red` | Red（登録困難） | #dc2626 |
| `yellow` | Yellow（要検討） | #d97706 |
| `green` | Green（登録可能性あり） | #059669 |

---

### 13.5 receipt_id 形式変更

#### 変更前（hex6）
```
20260131-240fdc
```

#### 変更後（hex10）
```
20260131-3e050d5109
```

#### 形式チェック（両対応）
```javascript
/^[0-9]{8}-[0-9a-f]{6}(?:[0-9a-f]{4})?$/
```

---

### 13.6 /mypage 結果表示

結果が設定されている場合、/mypage/ に以下を表示：
- 判定ラベル（色付き）
- 結果本文
- 結果送付日（result_sent_at がある場合）
- 無料精査(B)への案内

---

### 13.7 Nginx設定変更

#### sites-available/hugo-fareast 追加
```nginx
# /staff (LAN + Basic認証)
location ^~ /staff {
    allow 10.0.1.54;
    allow 10.0.1.61;
    allow 127.0.0.1;
    deny all;

    auth_basic "Staff Only";
    auth_basic_user_file /etc/nginx/.htpasswd_staff;

    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    limit_except GET POST { deny all; }
}
```

#### htpasswd作成
```bash
sudo htpasswd -c /etc/nginx/.htpasswd_staff staff
```

---

### 13.8 動作確認結果

#### /staff/ 一覧表示
```
案件一覧: 3件表示（ステータス絞り込み可）
```

#### 案件詳細表示
```
- 案件詳細セクション
- ステータス更新セクション
- 結果設定セクション
- 結果送信セクション
```

#### 結果保存
```
HTTP/1.1 303 See Other
Location: /staff/inquiry/20260131-240fdc?msg=結果を保存しました
```

#### /mypage 結果表示
```html
<h2 style="color:#d97706">Yellow（要検討）</h2>
<div>商標「Phase2テスト商標」について調査しました...（本文）</div>
```

#### 結果メール送信
```
HTTP/1.1 303 See Other
Location: /staff/inquiry/20260131-240fdc?msg=結果をメール送信しました
```

#### journalctlログ
```
[staff] result saved: 20260131-240fdc -> yellow
[staff] result mail sent to info@ahirutokyo.com for 20260131-240fdc
```

#### 二重送信防止
```
Location: ?msg=error:既に送信済みです。再送する場合はチェックを入れてください
```

#### 既存フロー維持
```
POST /api/sp-inquiry → 303 → /sp/thanks/?rid=20260131-3e050d5109
```

#### LAN + Basic認証
```
HTTP/1.1 401 Authorization Required（認証なしでアクセス時）
```

---

### 13.9 DoD（完了定義）達成状況

| 項目 | 状態 |
|------|------|
| スタッフが案件一覧・検索・詳細表示できる | ✅ |
| スタッフがステータス更新できる | ✅ |
| スタッフが結果（Red/Yellow/Green + 本文）を保存できる | ✅ |
| スタッフが結果をユーザーへメール送信できる | ✅ |
| /mypage に結果が表示される | ✅ |
| access_key は平文保存しない（既存維持） | ✅ |
| 既存の /sp → /api/sp-inquiry 挙動維持 | ✅ |
| staff領域は LAN限定 + Basic認証で保護 | ✅ |
| 二重送信防止 | ✅ |
| receipt_id 衝突耐性向上（hex10） | ✅ |

---

### 13.10 今後の残作業（Phase2-Commit4以降）

1. **結果テンプレの定型文化**（Red/Yellow/Green ごとの定型文 + 一部編集）→ Commit4で実装完了
2. **結果送付後の無料精査(B)への導線強化** → Commit4で実装完了
3. **本番メールアドレスへの切り替え**
4. **SSL/HTTPS対応**

---

## 14. Phase2-Commit4（結果テンプレ定型文化 + 無料精査(B)導線強化）

参照ドキュメント: `phase2_commit4_template_standardization_and_b_cta_20260131.md`

### 14.1 実装概要

| 項目 | 内容 |
|------|------|
| 定型テンプレ | Red/Yellow/Green ごとの定型文 + 変数差し込み |
| B依頼CTA | /mypage から無料精査(B)を依頼可能 |
| 安全性改善 | Cache-Control, Cookie Secure条件付与 |

---

### 14.2 DB拡張（マイグレーション）

```sql
ALTER TABLE inquiries ADD COLUMN b_requested_at TEXT;
ALTER TABLE inquiries ADD COLUMN b_request_note TEXT;
```

ステータス値追加：`b_requested`（無料精査(B)希望）

---

### 14.3 結果テンプレート定型文

#### Red（登録困難）
```
商標「{{trademark_text}}」について、指定商品・サービス「{{goods_services}}」での
登録可能性を調査いたしました。

調査の結果、類似する先行商標が複数存在しており、現状では登録が困難と判断されます。

商標の変更や指定商品・サービスの見直しをご検討いただくか、詳細な精査（無料精査B）
をご依頼いただくことをお勧めいたします。

受付番号: {{receipt_id}}
```

#### Yellow（要検討）
```
商標「{{trademark_text}}」について、指定商品・サービス「{{goods_services}}」での
登録可能性を調査いたしました。

調査の結果、類似性が微妙な先行商標が存在しており、登録の可否は審査官の判断に
委ねられる状況です。

登録の可能性を高めるための対策を検討するため、詳細な精査（無料精査B）をご依頼
いただくことをお勧めいたします。

受付番号: {{receipt_id}}
```

#### Green（登録可能性あり）
```
商標「{{trademark_text}}」について、指定商品・サービス「{{goods_services}}」での
登録可能性を調査いたしました。

調査の結果、現時点で登録を妨げる可能性の高い先行商標は発見されませんでした。
登録の可能性は比較的高いと判断されます。

出願手続きを進められる場合は、詳細な精査（無料精査B）をご依頼いただき、
出願戦略をご相談ください。

受付番号: {{receipt_id}}
```

---

### 14.4 追加URL一覧

| URL | メソッド | 機能 |
|-----|----------|------|
| `/mypage/request-b` | POST | 無料精査(B)依頼 |

---

### 14.5 /mypage CTA表示

#### 結果送付後（B未依頼）
```html
<div class="card" style="border-left:4px solid #1d4ed8;background:#eff6ff">
  <h2>無料精査(B)のご案内</h2>
  <p>一次判定の結果を踏まえ、より詳細な調査・出願戦略のご相談を無料で承ります。</p>
  <ul>
    <li>類似商標の詳細分析</li>
    <li>登録可能性を高める対策</li>
    <li>出願手続きのご案内</li>
  </ul>
  <form method="POST" action="/mypage/request-b">
    <textarea name="note" placeholder="ご要望・ご質問（任意）"></textarea>
    <button class="btn btn-success">無料精査(B)を依頼する</button>
  </form>
</div>
```

#### B依頼済み
```html
<div class="card" style="border-left:4px solid #059669;background:#f0fdf4">
  <h2>無料精査(B) - 受付済み</h2>
  <p>ご依頼を受け付けました。担当者より詳細についてご連絡いたします。</p>
  <p>依頼日: 2026/1/31</p>
</div>
```

---

### 14.6 B依頼通知メール（スタッフ宛）

```
件名: 無料精査(B)希望 [20260131-240fdc]

無料精査(B)の依頼がありました。

受付番号: 20260131-240fdc
商標: Phase2テスト商標
商品/サービス: テスト商品サービス
メール: info@ahirutokyo.com
依頼日時: 2026-01-31T09:07:31.625Z
備考: ロゴの類似性について詳しく知りたいです

スタッフ画面: /staff/inquiry/20260131-240fdc
```

---

### 14.7 セキュリティ改善

| 項目 | 内容 |
|------|------|
| Cache-Control | `no-store, no-cache, must-revalidate, private`（/mypage, /staff） |
| Cookie Secure | HTTPS時に自動付与（X-Forwarded-Proto判定） |
| result_body バリデーション | 80〜1500文字制限 |
| HTMLエスケープ | 全表示箇所で徹底 |

---

### 14.8 動作確認結果

#### テンプレ挿入ボタン
```
スタッフ画面に Green/Yellow/Red ボタン表示
→ クリックで自動入力、文字数カウンタ更新
```

#### B依頼
```
POST /mypage/request-b
→ 303 → /mypage/?msg=b_requested
→ DB更新: status='b_requested', b_requested_at設定
→ スタッフ通知メール送信
```

#### B依頼済み表示
```
/mypage に「無料精査(B) - 受付済み」カード表示
依頼ボタン非表示（二重登録防止）
```

#### journalctlログ
```
[mypage] B requested for 20260131-240fdc
[mail] B request notification sent to info@ahirutokyo.com
```

#### 既存フロー維持
```
POST /api/sp-inquiry → 303 → /sp/thanks/?rid=20260131-672c22dc05
```

---

### 14.9 DoD（完了定義）達成状況

| 項目 | 状態 |
|------|------|
| /staff の結果入力が定型文ベースで速く・ブレなく作れる | ✅ |
| /mypage に無料精査(B)の明確なCTAがある | ✅ |
| B依頼でスタッフに通知され、案件に履歴が残る | ✅ |
| 既存の /sp → /api/sp-inquiry → thanks を壊さない | ✅ |
| /mypage 認証、/staff の動作を壊さない | ✅ |
| HTML表示はエスケープ（XSS防止） | ✅ |
| Cookie/キャッシュの安全性を一段上げる | ✅ |

---

### 14.10 今後の残作業（Phase2-Commit5以降）

1. **本番メールアドレスへの切り替え**（SPF/DKIM含む）
2. **SSL/HTTPS対応**（Let's Encrypt）
3. **ドメイン設定**

---

## 15. Git同期 + 自宅PC再現用ファイル作成

### 15.1 作業概要

| 項目 | 内容 |
|------|------|
| 参照ドキュメント | `claude_code_git_sync_and_home_repro_20260131.md` |
| 作業目的 | zerofighterでGit同期し、自宅PCでPhase2実装を再現できるようにする |
| 自宅PC作業ディレクトリ | `/home/yasuhiro/ドキュメント/fareast-hugo-site` |

---

### 15.2 リポジトリ構成確認

```
/home/zerofighter/ドキュメント/wordPress移行/hugo_fareast_site/
├── .git/                    # メインリポジトリ
├── server/sp-form-receiver/ # Node.js API（Phase2実装）
├── docs/                    # ドキュメント
├── ops/nginx/               # nginx設定例
├── layouts/                 # Hugo テンプレート
├── content/                 # Hugo コンテンツ
└── public/                  # Hugo 生成物
```

---

### 15.3 server300からPhase2実装を取得

```bash
ssh -p 2718 server300@10.0.1.61 "cat /home/server300/hugo_fareast_site/server/sp-form-receiver/index.js"
ssh -p 2718 server300@10.0.1.61 "cat /home/server300/hugo_fareast_site/server/sp-form-receiver/package.json"
```

取得した内容をzerofighter側のリポジトリに反映。

---

### 15.4 作成・更新したファイル

#### 更新ファイル

| ファイル | サイズ | 内容 |
|----------|--------|------|
| `server/sp-form-receiver/index.js` | 35KB | Phase2-Commit1〜4の全実装 |
| `server/sp-form-receiver/package.json` | 328B | better-sqlite3 追加 |

#### 新規ファイル

| ファイル | サイズ | 内容 |
|----------|--------|------|
| `server/sp-form-receiver/.env.local.example` | 881B | ローカル用env（MailHog設定） |
| `docs/home_repro_20260131.md` | 5.4KB | 自宅PC再現手順書 |
| `ops/nginx/hugo-fareast.local-8080.conf.example` | 2.5KB | ローカル用nginx設定 |

---

### 15.5 index.js 主要機能一覧（Phase2実装）

| 機能 | エンドポイント | 説明 |
|------|---------------|------|
| フォーム受付 | `POST /api/sp-inquiry` | 受付番号・アクセスキー発行、DB保存、メール送信 |
| 進捗確認ログイン | `GET/POST /mypage/login` | 受付番号＋アクセスキー認証 |
| 進捗表示 | `GET /mypage/` | ステータス・結果表示 |
| ログアウト | `POST /mypage/logout` | セッション破棄 |
| B依頼 | `POST /mypage/request-b` | 無料精査(B)依頼、スタッフ通知 |
| スタッフ一覧 | `GET /staff/` | 案件一覧（ステータス絞り込み） |
| スタッフ詳細 | `GET /staff/inquiry/:rid` | 案件詳細表示 |
| ステータス更新 | `POST /staff/inquiry/:rid/status` | ステータス変更 |
| 結果保存 | `POST /staff/inquiry/:rid/result` | Red/Yellow/Green + 本文 |
| 結果送信 | `POST /staff/inquiry/:rid/send-result` | ユーザーへメール送信 |

---

### 15.6 .env.local.example 内容

```env
SESSION_SECRET=your-session-secret-here-generate-with-openssl
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

ポイント:
- `DB_PATH=./data/spform.db` でローカルDB使用
- `MAIL_REQUIRED=false` でメール失敗時も続行
- MailHog: `docker run --rm -p 8025:8025 -p 1025:1025 mailhog/mailhog`

---

### 15.7 Gitコミット・プッシュ

```bash
cd /home/zerofighter/ドキュメント/wordPress移行/hugo_fareast_site

git add server/sp-form-receiver/index.js \
        server/sp-form-receiver/package.json \
        server/sp-form-receiver/.env.local.example \
        docs/home_repro_20260131.md \
        ops/nginx/hugo-fareast.local-8080.conf.example

git commit -m "feat: Phase2 implementation + home reproduction guide

- Phase2-Commit1~4: receipt_id/access_key, /mypage, /staff, result templates, B request CTA
- Add home_repro_20260131.md: step-by-step guide for local setup
- Add nginx config example for local development (port 8080)
- Add .env.local.example with MailHog settings

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git push origin master
```

#### 結果

```
[master d51a7d5] feat: Phase2 implementation + home reproduction guide
 5 files changed, 796 insertions(+), 117 deletions(-)

To github.com:morino-kuma-san/fareast-hugo-site.git
   633b5d3..d51a7d5  master -> master
```

---

### 15.8 最終コミット情報

| 項目 | 値 |
|------|-----|
| ブランチ | `master` |
| コミットSHA | `d51a7d512ae29fd1ed39cbd4a986b4ab19cab1b4` |
| リモート | `origin/master` |
| 状態 | clean |

---

### 15.9 自宅PCでのgit pull手順

```bash
cd /home/yasuhiro/ドキュメント/fareast-hugo-site
git checkout master
git pull origin master
git submodule update --init --recursive
git status
git log --oneline -3
```

期待される出力:
```
d51a7d5 feat: Phase2 implementation + home reproduction guide
633b5d3 fix: add dotenv and make email notification best-effort
7b0162e feat: Phase1 public minimum (receiver + thanks + honeypot)
```

---

### 15.10 自宅PC再現用URL一覧

| URL | 説明 |
|-----|------|
| `http://127.0.0.1:8080/sp/` | 一次判定フォーム |
| `http://127.0.0.1:8080/sp/thanks/?rid=...` | 送信完了ページ |
| `http://127.0.0.1:8080/mypage/login` | 進捗確認ログイン |
| `http://127.0.0.1:8080/mypage/` | 進捗確認ページ |
| `http://127.0.0.1:8080/staff/` | スタッフ画面（Basic認証） |
| `http://127.0.0.1:8025` | MailHog UI |

詳細は `docs/home_repro_20260131.md` を参照。

---

### 15.11 今後の作業

1. 自宅PCで `git pull origin master`
2. `docs/home_repro_20260131.md` に従って環境構築
3. 動作確認（フォーム送信 → メール確認 → ログイン → 結果送信 → B依頼）

---

*以上*

---

## sp-form-receiver メール送信機能改善（追記）

**作業日時**: 2026-01-31
**作業者**: Claude Code
**参照ドキュメント**: zerofighter_improvement_proposal_20260131.md

### 問題の概要

スタッフページ (`/staff/`) で「結果を送信」ボタンを押すと、以下のエラーが発生：

```
メール送信失敗: spawn /usr/sbin/sendmail ENOENT
```

**原因**: `createTransport()` 関数が `SMTP_USER` と `SMTP_PASS` が両方設定されている場合のみ SMTP を使用し、そうでない場合は `sendmail` コマンドにフォールバックしていた。MailHog や認証不要の SMTP サーバーを使用する場合に問題が発生。

### 修正内容

**対象ファイル**:
- zerofighter: `/home/zerofighter/ドキュメント/wordPress移行/hugo_fareast_site/server/sp-form-receiver/index.js`
- server300: `/home/server300/hugo_fareast_site/server/sp-form-receiver/index.js`

**修正前**:
```javascript
async function createTransport() {
  const host = process.env.SMTP_HOST?.trim(), port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS?.trim();
  if (host && port && user && pass) return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return nodemailer.createTransport({ sendmail: true, newline: "unix", path: "/usr/sbin/sendmail" });
}
```

**修正後**:
```javascript
async function createTransport() {
  const host = process.env.SMTP_HOST?.trim(), port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS?.trim();
  if (host && port) {
    const opts = { host, port, secure };
    if (user && pass) opts.auth = { user, pass };
    return nodemailer.createTransport(opts);
  }
  return nodemailer.createTransport({ sendmail: true, newline: "unix", path: "/usr/sbin/sendmail" });
}
```

### 変更点

- `SMTP_HOST` と `SMTP_PORT` が設定されていれば SMTP を使用
- `SMTP_USER` と `SMTP_PASS` は設定されている場合のみ認証を行う
- これにより、認証不要の SMTP サーバー（MailHog等）でも正常に動作

### 作業ステップ

1. **zerofighter（10.0.1.54）の修正**
   - `index.js` の `createTransport()` 関数を修正
   - `npm install` を実行（better-sqlite3 モジュール不足のため）
   - `/var/lib/sp-form-receiver` ディレクトリを作成（sudo）
   - サービス再起動 → 正常起動確認（PID: 603552）

2. **server300（10.0.1.61）の修正**
   - SSH接続: `ssh -p 2718 server300@10.0.1.61`
   - `index.js` の `createTransport()` 関数を修正（135-141行目）
   - サービス再起動 → 正常起動確認（PID: 235081）

### 完了状況

| 環境 | 修正 | 再起動 | ステータス |
|------|------|--------|------------|
| zerofighter（10.0.1.54） | ✅ 完了 | ✅ 起動中 | 正常 |
| server300（10.0.1.61） | ✅ 完了 | ✅ 起動中 | 正常 |

### 影響範囲

| 環境 | SMTP_USER/PASS | 修正前 | 修正後 |
|------|----------------|--------|--------|
| MailHog（ローカル開発） | 空 | sendmail エラー | SMTP で正常送信 |
| 認証なし SMTP | 空 | sendmail エラー | SMTP で正常送信 |
| 認証あり SMTP | 設定済み | 正常 | 正常（変更なし） |


---

## Hugo Docker化作業（追記）

**作業日時**: 2026-01-31
**作業者**: Claude Code
**参照ドキュメント**: 01_work_servers_zerofighter_claude_code.md

### 概要

Hugo/Node 等のツール差分を Docker に閉じ込め、zerofighter と server300 で同じ手順で動くようにする作業。

### 完了した作業

#### ステップ 0: 前提確認

| 項目 | zerofighter (10.0.1.54) | server300 (10.0.1.61) |
|------|-------------------------|------------------------|
| OS | Ubuntu 24.04.3 LTS | Ubuntu 24.04.3 LTS |
| git | 2.43.0 ✅ | 2.43.0 ✅ |
| hugo | 0.152.2 extended | 0.142.0 extended |
| node | 24.3.0 | 未インストール |
| docker | 未インストール→29.2.0 | 未インストール→29.2.0 |
| UID/GID | 1000/1000 | 1000/1000 |

- Hugo プロジェクト場所: `/home/zerofighter/ドキュメント/wordPress移行/hugo_fareast_site`

#### ステップ 1: Docker 導入

両サーバーに Docker Engine 29.2.0 + Docker Compose 5.0.2 をインストール完了。

#### ステップ 2: Docker化ファイル作成（zerofighter）

作成したファイル：
- `docker/entrypoint.sh` - npm 依存関係処理用
- `docker/Dockerfile` - Hugo 0.152.2 extended 固定
- `compose.yml` - ローカル開発用設定
- `.env.example` - 環境変数テンプレート
- `.gitignore` 更新 - `.docker-cache/` 追加

Git コミット & プッシュ完了：
- ブランチ: `dockerize-hugo`
- コミット: `8f22738` "Dockerize Hugo dev environment (compose + pinned Hugo version)"

ビルド & 起動テスト：
- zerofighter: ✅ HTTP 200 OK
- ファイル所有権: ✅ root にならない

#### ステップ 3: server300 へ反映

- GitHub SSH 接続不可のため、scp でファイルをコピー
- `.env` 作成（HUGO_ENVIRONMENT=server300）
- Docker ビルド & 起動テスト: ✅ HTTP 200 OK
- ファイル所有権: ✅ root にならない

### 未完了の作業

#### server300 の GitHub SSH 接続設定

**問題**: server300 から GitHub への SSH 接続ができない

**状況**:
- SSH キー存在: `/home/server300/.ssh/id_ed25519`
- 公開鍵: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINnM6Irsau8uOp0grdPJBT63qzP8e9hvNrF5H5gEJIHz server300@server300`
- GitHub に公開鍵登録済み
- SSH キーにパスフレーズが設定されているが、パスフレーズが不明

**再開時の手順**:
1. server300 にログイン: `ssh -p 2718 server300@10.0.1.61`
2. SSH エージェントを起動してキーを追加:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   # パスフレーズを入力
   ```
3. GitHub 接続テスト:
   ```bash
   ssh -T git@github.com
   ```
4. 成功したら git fetch/pull で dockerize-hugo ブランチを取得

**代替案（パスフレーズが不明な場合）**:
- 新しい SSH キーを生成して GitHub に登録:
  ```bash
  ssh-keygen -t ed25519 -C "server300@server300" -f ~/.ssh/id_ed25519_new
  cat ~/.ssh/id_ed25519_new.pub
  # 公開鍵を GitHub に登録
  ```

### 現在の状態

| サーバー | Docker | Hugo コンテナ | GitHub SSH |
|----------|--------|--------------|------------|
| zerofighter (10.0.1.54) | ✅ 29.2.0 | ✅ 起動可能 | ✅ 接続可能 |
| server300 (10.0.1.61) | ✅ 29.2.0 | ✅ 起動可能 | ❌ パスフレーズ不明 |

### 運用コマンド

```bash
# 起動
docker compose up -d

# 停止
docker compose down

# ログ確認
docker compose logs -f

# 再ビルド
docker compose up -d --build
```

### ssh ポートフォワードでブラウザ閲覧

```bash
# zerofighter を見る
ssh zerofighter@10.0.1.54 -L 1313:127.0.0.1:1313
# ブラウザで http://localhost:1313/

# server300 を見る
ssh -p 2718 server300@10.0.1.61 -L 1314:127.0.0.1:1313
# ブラウザで http://localhost:1314/
```

### 備考

- zerofighter に gh CLI 2.86.0 をインストール済み
- Caddy リポジトリの GPG キーが期限切れ（別途対応必要）

