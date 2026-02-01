# FILE: 04_next_steps_home_desktop_claude_code.md
> 対象: 自宅デスクトップ ubuntu（yasuhiro-iMac）  
> 実行者: 自宅PCの Claude Code  
> 目的:  
> 1) 現在 nohup で上げている sp-form-receiver / mailhog を Compose 管理に寄せる  
> 2) 「フォーム送信は nginx 側（8080）」の構成を Docker で再現できるようにする（任意）

---

## A. 現状の整理（既にできていること）
- Hugo(Docker): 1313 OK
- nginx(host): 8080 OK（APIプロキシあり）
- sp-form-receiver: nohup で起動（8787）
- mailhog: docker run で起動（1025/8025）

ここまでOK。

---

## B. sp-form-receiver と mailhog を Compose に寄せる（優先）
> 目的は「再起動後の起動手順を docker compose 1発に近づける」こと。

### B-1. 最新を pull
```bash
cd ~/ドキュメント/fareast-hugo-site
git checkout dockerize-hugo
git pull
```

### B-2. `.env` に必要な値があれば追記（Git管理しない）
- SP_FORM_PORT=8787
- MAILHOG_WEB_PORT=8025
- MAILHOG_SMTP_PORT=1025
など（職場側が `.env.example` を拡張したらそれに合わせる）

### B-3. Compose 起動（profile）
```bash
cd ~/ドキュメント/fareast-hugo-site
docker compose --profile api --profile dev up -d --build
docker compose ps
```

### B-4. 既存 nohup sp-form-receiver を停止（切替後）
Compose で API が正常なら、nohup のプロセスを止める（重複起動を防ぐ）。
```bash
ps aux | grep sp-form-receiver | grep -v grep || true
# 見つかったPIDを kill
```

---

## C. nginx をどうするか（自宅は “Docker化すると移植性が上がる”）
現状は host nginx が 8080 で API を proxy している。移植性を最大化するなら：

- nginx 設定ファイルを repo に置く（template化）
- nginx コンテナを compose に追加（profile: ["gateway"]）
- 8080 をコンテナ nginx が担当し、/sp や /api を sp-form-receiver へ、その他を hugo へ

ただし、いま困っていなければ **B（api/dev の compose 化）までで十分**。

---

## D. 自宅での確認（ヘルスチェック）
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1313/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/healthz || true
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8025/
```

フォーム送信は今まで通り nginx 側（8080）で実施：
```bash
curl -I http://127.0.0.1:8080/sp/ || true
```

---

## 完了条件
- [ ] `docker compose --profile api --profile dev up -d` で、Hugo + sp-form-receiver + mailhog が揃って起動
- [ ] nohup 起動が不要になった（重複起動がない）
- [ ] フォーム送信テストが従来通り成功（nginx 経由）
