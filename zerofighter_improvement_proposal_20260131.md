# 改善提案: sp-form-receiver メール送信機能

**作成日**: 2026-01-31
**作成元**: 自宅PC (fareast-hugo-site)
**対象サーバー**: zerofighter (10.0.1.54), server300 (10.0.1.61)

---

## 概要

自宅PCでの一次判定システム動作確認中に、メール送信機能に問題を発見しました。この問題は職場環境（zerofighter, server300）でも同様に発生する可能性があります。

---

## 発見した問題

### 症状

スタッフページ (`/staff/`) で「結果を送信」ボタンを押すと、以下のエラーが発生：

```
メール送信失敗: spawn /usr/sbin/sendmail ENOENT
```

### 原因

`server/sp-form-receiver/index.js` の `createTransport()` 関数が、SMTP認証情報（`SMTP_USER` と `SMTP_PASS`）が両方設定されている場合のみ SMTP を使用し、そうでない場合は `sendmail` コマンドにフォールバックしている。

MailHog や認証不要の SMTP サーバーを使用する場合、`SMTP_USER` と `SMTP_PASS` が空になるため、sendmail が使われてしまう。

### 該当コード（修正前）

```javascript
// server/sp-form-receiver/index.js 156行目付近
async function createTransport() {
  const host = process.env.SMTP_HOST?.trim(), port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS?.trim();
  if (host && port && user && pass) return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return nodemailer.createTransport({ sendmail: true, newline: "unix", path: "/usr/sbin/sendmail" });
}
```

---

## 改善提案

### 修正後のコード

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
- これにより、認証不要の SMTP サーバー（MailHog等）でも正常に動作する

---

## 適用手順

### 1. コードの修正

```bash
# zerofighter の場合
cd /home/zerofighter/ドキュメント/wordPress移行/hugo_fareast_site/server/sp-form-receiver

# 該当箇所を編集
# index.js の createTransport() 関数を上記の修正後コードに置き換える
```

### 2. サービスの再起動

```bash
# 現在のプロセスを停止
kill $(lsof -t -i :8787)

# 再起動
npm start
# または
nohup npm start > /tmp/sp-form-receiver.log 2>&1 &
```

### 3. 動作確認

1. スタッフページ (`/staff/`) にアクセス
2. 案件を選択し「結果を送信」をクリック
3. エラーなくメールが送信されることを確認

---

## 影響範囲

| 環境 | SMTP_USER/PASS | 修正前 | 修正後 |
|------|----------------|--------|--------|
| MailHog（ローカル開発） | 空 | sendmail エラー | SMTP で正常送信 |
| 認証なし SMTP | 空 | sendmail エラー | SMTP で正常送信 |
| 認証あり SMTP | 設定済み | 正常 | 正常（変更なし） |

---

## 備考

- この修正は後方互換性があり、既存の認証あり SMTP 設定には影響しない
- server300 の本番環境でも同様の修正が必要な可能性あり
- 自宅PC (fareast-hugo-site) では修正済み・動作確認済み

---

## 関連ファイル

- `server/sp-form-receiver/index.js` - createTransport() 関数
- `server/sp-form-receiver/.env` - SMTP 設定
