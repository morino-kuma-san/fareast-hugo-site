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

<!-- ここに回答を追記してください -->

