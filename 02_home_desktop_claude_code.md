# FILE: 02_home_desktop_claude_code.md
> 対象: 自宅デスクトップ ubuntu パソコン  
> 実行者: 自宅デスクトップ上の Claude Code  
> 目的: 職場サーバと同じ Docker 環境で Hugo を動かし、環境差分の事故を無くす。  
> 方針:  
> - Docker 化ファイルは Git から取得  
> - 自宅固有値は `.env` に置き、Git 管理しない（上書き事故防止）

---

## 0. 事前確認（自宅）
```bash
set -eux
hostname
lsb_release -a || cat /etc/os-release
uname -a
id
docker --version || true
docker compose version || true
```

---

## 1. Docker 導入（未導入なら）
### 1-1. Docker Engine + Compose plugin
```bash
set -eux
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  ${VERSION_CODENAME} stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 1-2. docker グループ付与
```bash
set -eux
sudo usermod -aG docker "$USER"
newgrp docker <<'EOF'
docker run --rm hello-world
EOF
```

---

## 2. リポジトリ更新（Docker 化ブランチ/変更を取得）
```bash
cd /path/to/your/hugo-repo
git fetch origin

# 職場側で dockerize-hugo ブランチを作った場合:
git checkout dockerize-hugo
git pull
```

> すでに main/master にマージ済みなら、そのブランチを pull してください。

---

## 3. 自宅用 `.env` 作成（最重要：Git管理しない）
```bash
cd /path/to/your/hugo-repo
cp -n .env.example .env
mkdir -p .docker-cache

uid="$(id -u)"; gid="$(id -g)"
perl -0777 -i -pe "s/^UID=.*/UID=${uid}/m; s/^GID=.*/GID=${gid}/m" .env

# 自宅用の環境名（必要に応じて）
perl -0777 -i -pe "s/^HUGO_ENVIRONMENT=.*/HUGO_ENVIRONMENT=home/m" .env

# 自宅は localhost 想定
perl -0777 -i -pe "s|^HUGO_BASEURL=.*|HUGO_BASEURL=http://localhost:1313/|m" .env
perl -0777 -i -pe "s/^BIND_IP=.*/BIND_IP=127.0.0.1/m" .env
perl -0777 -i -pe "s/^HOST_PORT=.*/HOST_PORT=1313/m" .env
```

---

## 4. ビルド & 起動（自宅）
```bash
cd /path/to/your/hugo-repo
docker compose build
docker compose up
```

ブラウザで確認:
- `http://localhost:1313/`

---

## 5. よくある躓き（自宅）
### 5-1. node_modules が必要なのにビルドされない
- `package-lock.json` があるのに `node_modules` が無い場合、entrypoint が `npm ci` を走らせます。
- それでも失敗するなら一度だけ強制:
```bash
FORCE_NPM_CI=1 docker compose up --build
```

### 5-2. 生成物の所有者が root になる
- compose は `user: "${UID}:${GID}"` で回す設計です。
- `.env` の UID/GID が正しいか確認:
```bash
cat .env | egrep '^(UID|GID)='
id
```

---

## 6. 完了条件（チェックリスト）
- [ ] `docker compose up` で Hugo が起動し、`http://localhost:1313/` が表示される
- [ ] `.env` が Git 追跡されていない（`git status` で出ない）
- [ ] 生成物（resources/node_modules 等）が root 所有になっていない

