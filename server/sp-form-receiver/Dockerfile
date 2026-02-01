# sp-form-receiver Dockerfile
FROM node:20-bookworm-slim

# better-sqlite3 のビルドに必要なパッケージ
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係を先にコピーしてキャッシュ効率を上げる
COPY package*.json ./

RUN npm ci --only=production

# アプリケーションコードをコピー
COPY index.js ./

# データディレクトリ作成
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["node", "index.js"]
