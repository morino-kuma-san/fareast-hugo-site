# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

ARG HUGO_VERSION=0.152.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl jq git tzdata \
  && rm -rf /var/lib/apt/lists/*

# Hugo Extended を GitHub Releases API から取得してインストール
RUN set -eux; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64)   arch_pat="amd64|64bit" ;; \
    arm64)   arch_pat="arm64|ARM64" ;; \
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  api="https://api.github.com/repos/gohugoio/hugo/releases/tags/v${HUGO_VERSION}"; \
  # まず .deb を優先して探す（あれば apt で導入）
  url_deb="$(curl -fsSL "$api" | jq -r --arg ap "$arch_pat" \
    '.assets[].browser_download_url as $u | .assets[] | select(.name|test("extended";"i")) \
     | select(.name|test("linux";"i")) | select(.name|test($ap;"i")) | select(.name|test("\\.deb$";"i")) \
     | .browser_download_url' | head -n1)"; \
  if [ -n "${url_deb:-}" ] && [ "$url_deb" != "null" ]; then \
    echo "Downloading Hugo (deb): $url_deb"; \
    curl -fsSL -o /tmp/hugo.deb "$url_deb"; \
    apt-get update; \
    apt-get install -y /tmp/hugo.deb; \
    rm -f /tmp/hugo.deb; \
  else \
    # .tar.gz にフォールバック
    url_tgz="$(curl -fsSL "$api" | jq -r --arg ap "$arch_pat" \
      '.assets[] | select(.name|test("extended";"i")) \
       | select(.name|test("linux";"i")) | select(.name|test($ap;"i")) | select(.name|test("tar\\.gz$";"i")) \
       | .browser_download_url' | head -n1)"; \
    echo "Downloading Hugo (tgz): $url_tgz"; \
    test -n "$url_tgz" && test "$url_tgz" != "null"; \
    curl -fsSL -o /tmp/hugo.tgz "$url_tgz"; \
    tar -C /tmp -xzf /tmp/hugo.tgz; \
    # tar の中身に hugo バイナリがいる前提
    mv /tmp/hugo /usr/local/bin/hugo; \
    chmod +x /usr/local/bin/hugo; \
    rm -f /tmp/hugo.tgz; \
  fi; \
  hugo version

WORKDIR /work

ENV TZ=Asia/Tokyo
ENV HUGO_CACHEDIR=/cache/hugo

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]
