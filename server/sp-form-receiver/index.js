require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");

// --- ユーティリティ ---
function nowIso() { return new Date().toISOString(); }
function safeStr(v) { return String(v ?? "").trim(); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function escapeHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function isValidReceiptId(rid) { return /^[0-9]{8}-[0-9a-f]{6}(?:[0-9a-f]{4})?$/.test(rid); }
function generateReceiptId() {
  const now = new Date();
  const yyyy = now.getFullYear(), mm = String(now.getMonth()+1).padStart(2,"0"), dd = String(now.getDate()).padStart(2,"0");
  return `${yyyy}${mm}${dd}-${crypto.randomBytes(5).toString("hex")}`;
}
function generateAccessKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let key = ""; const bytes = crypto.randomBytes(24);
  for (let i = 0; i < 24; i++) key += chars[bytes[i] % chars.length];
  return key;
}
function hashAccessKey(accessKey) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { hash: crypto.scryptSync(accessKey, salt, 64).toString("hex"), salt };
}
function verifyAccessKey(inputKey, storedHash, storedSalt) {
  try {
    const inputHash = crypto.scryptSync(inputKey, storedSalt, 64);
    return crypto.timingSafeEqual(inputHash, Buffer.from(storedHash, "hex"));
  } catch { return false; }
}

// --- セッション ---
const SESSION_SECRET = (process.env.SESSION_SECRET || "default-secret-change-me").trim();
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000;

function createSessionToken(receiptId, isSecure = false) {
  const exp = Date.now() + SESSION_MAX_AGE;
  const payload = JSON.stringify({ receipt_id: receiptId, exp });
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64") + "." + sig;
}
function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split("."); if (parts.length !== 2) return null;
  try {
    const [payloadB64, sig] = parts;
    const payload = Buffer.from(payloadB64, "base64").toString("utf8");
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return data.receipt_id;
  } catch { return false; }
}
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach(c => { const [key,...v] = c.split("="); if (key) cookies[key.trim()] = v.join("=").trim(); });
  return cookies;
}
function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || req.secure;
}

// --- ラベル ---
const STATUS_LABELS = { received:"受付済み", reviewing:"確認中", result_sent:"結果送付済み", b_requested:"無料精査(B)希望", closed:"完了" };
const RESULT_LABELS = { red:"Red（登録困難）", yellow:"Yellow（要検討）", green:"Green（登録可能性あり）" };
const RESULT_COLORS = { red:"#dc2626", yellow:"#d97706", green:"#059669" };

// --- 結果テンプレート ---
const RESULT_TEMPLATES = {
  red: `商標「{{trademark_text}}」について、指定商品・サービス「{{goods_services}}」での登録可能性を調査いたしました。

調査の結果、類似する先行商標が複数存在しており、現状では登録が困難と判断されます。

商標の変更や指定商品・サービスの見直しをご検討いただくか、詳細な精査（無料精査B）をご依頼いただくことをお勧めいたします。

受付番号: {{receipt_id}}`,

  yellow: `商標「{{trademark_text}}」について、指定商品・サービス「{{goods_services}}」での登録可能性を調査いたしました。

調査の結果、類似性が微妙な先行商標が存在しており、登録の可否は審査官の判断に委ねられる状況です。

登録の可能性を高めるための対策を検討するため、詳細な精査（無料精査B）をご依頼いただくことをお勧めいたします。

受付番号: {{receipt_id}}`,

  green: `商標「{{trademark_text}}」について、指定商品・サービス「{{goods_services}}」での登録可能性を調査いたしました。

調査の結果、現時点で登録を妨げる可能性の高い先行商標は発見されませんでした。登録の可能性は比較的高いと判断されます。

出願手続きを進められる場合は、詳細な精査（無料精査B）をご依頼いただき、出願戦略をご相談ください。

受付番号: {{receipt_id}}`
};

function applyTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
}

// --- DB ---
function initDatabase() {
  const dbPath = process.env.DB_PATH || "/var/lib/sp-form-receiver/spform.db";
  const db = new Database(dbPath);

  // テーブル作成（存在しない場合）
  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY,
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
    )
  `);

  const columns = db.prepare("PRAGMA table_info(inquiries)").all();
  const columnNames = columns.map(c => c.name);
  const migrations = [
    ["status", "ALTER TABLE inquiries ADD COLUMN status TEXT NOT NULL DEFAULT 'received'"],
    ["status_updated_at", "ALTER TABLE inquiries ADD COLUMN status_updated_at TEXT"],
    ["status_note", "ALTER TABLE inquiries ADD COLUMN status_note TEXT"],
    ["result_level", "ALTER TABLE inquiries ADD COLUMN result_level TEXT"],
    ["result_body", "ALTER TABLE inquiries ADD COLUMN result_body TEXT"],
    ["result_updated_at", "ALTER TABLE inquiries ADD COLUMN result_updated_at TEXT"],
    ["result_sent_at", "ALTER TABLE inquiries ADD COLUMN result_sent_at TEXT"],
    ["b_requested_at", "ALTER TABLE inquiries ADD COLUMN b_requested_at TEXT"],
    ["b_request_note", "ALTER TABLE inquiries ADD COLUMN b_request_note TEXT"]
  ];
  for (const [col, sql] of migrations) {
    if (!columnNames.includes(col)) { db.exec(sql); console.log(`[migration] Added: ${col}`); }
  }
  return db;
}

const mailRequired = String(process.env.MAIL_REQUIRED || "").toLowerCase() === "true";

async function createTransport() {
  const host = process.env.SMTP_HOST?.trim(), port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS?.trim();
  if (host && port && user && pass) return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return nodemailer.createTransport({ sendmail: true, newline: "unix", path: "/usr/sbin/sendmail" });
}

// === スタイル ===
function baseStyle() {
  return `*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.7;background:#f8fafc;color:#0f172a}.container{max-width:900px;margin:0 auto;padding:24px}.card{background:#fff;border:1px solid rgba(15,23,42,.12);border-radius:12px;box-shadow:0 4px 12px rgba(15,23,42,.06);padding:24px;margin-bottom:20px}h1{margin:0 0 20px;font-size:22px}h2{margin:0 0 16px;font-size:18px}table{width:100%;border-collapse:collapse}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0}th{background:#f1f5f9;font-weight:600}a{color:#1d4ed8;text-decoration:none}a:hover{text-decoration:underline}.btn{display:inline-block;padding:10px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none}.btn:hover{background:#1e40af}.btn:disabled{background:#94a3b8;cursor:not-allowed}.btn-secondary{background:#64748b}.btn-secondary:hover{background:#475569}.btn-danger{background:#dc2626}.btn-danger:hover{background:#b91c1c}.btn-success{background:#059669}.btn-success:hover{background:#047857}.btn-sm{padding:6px 12px;font-size:12px}label{display:block;margin-bottom:6px;font-weight:600}input[type=text],textarea,select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;margin-bottom:12px}textarea{min-height:150px;resize:vertical}.msg-success{padding:12px;background:#d1fae5;color:#059669;border-radius:8px;margin-bottom:16px}.msg-error{padding:12px;background:#fee2e2;color:#dc2626;border-radius:8px;margin-bottom:16px}.char-count{font-size:12px;color:#64748b;text-align:right}`;
}

// === mypage HTML ===
function loginPageHtml(error = "") {
  const errorHtml = error ? `<div class="msg-error">${escapeHtml(error)}</div>` : "";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>進捗確認ログイン</title><style>${baseStyle()}.login-container{max-width:420px}</style></head><body><div class="container login-container"><div class="card"><h1>進捗確認</h1>${errorHtml}<form method="POST" action="/mypage/login"><label>受付番号</label><input type="text" name="receipt_id" placeholder="例: 20260131-240fdc" required><label>アクセスキー</label><input type="text" name="access_key" placeholder="メールに記載の24文字" required><button type="submit" class="btn" style="width:100%">ログイン</button></form><p style="margin-top:16px;font-size:13px;color:#64748b">※受付番号とアクセスキーはメールに記載されています。</p></div></div></body></html>`;
}

function mypageHtml(inquiry, msg = "") {
  const statusLabel = STATUS_LABELS[inquiry.status] || inquiry.status;
  const updatedAt = inquiry.status_updated_at ? new Date(inquiry.status_updated_at).toLocaleDateString("ja-JP") : "-";
  const msgHtml = msg === "b_requested" ? '<div class="msg-success">無料精査(B)のご依頼を受け付けました。担当者よりご連絡いたします。</div>' : "";

  let resultHtml = "";
  if (inquiry.result_level && inquiry.result_body) {
    const levelLabel = RESULT_LABELS[inquiry.result_level] || inquiry.result_level;
    const levelColor = RESULT_COLORS[inquiry.result_level] || "#475569";
    const sentAt = inquiry.result_sent_at ? new Date(inquiry.result_sent_at).toLocaleDateString("ja-JP") : null;
    resultHtml = `<div class="card" style="border-left:4px solid ${levelColor}"><h2 style="color:${levelColor}">${escapeHtml(levelLabel)}</h2><div style="white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;font-size:14px">${escapeHtml(inquiry.result_body)}</div>${sentAt ? `<p style="font-size:13px;color:#64748b;margin-top:12px">結果送付日: ${sentAt}</p>` : ""}</div>`;
  }

  // B依頼CTA
  let bCtaHtml = "";
  if (inquiry.b_requested_at) {
    bCtaHtml = `<div class="card" style="border-left:4px solid #059669;background:#f0fdf4"><h2 style="color:#059669">無料精査(B) - 受付済み</h2><p>ご依頼を受け付けました。担当者より詳細についてご連絡いたします。</p><p style="font-size:13px;color:#64748b">依頼日: ${new Date(inquiry.b_requested_at).toLocaleDateString("ja-JP")}</p></div>`;
  } else if (inquiry.result_sent_at) {
    bCtaHtml = `<div class="card" style="border-left:4px solid #1d4ed8;background:#eff6ff"><h2 style="color:#1d4ed8">無料精査(B)のご案内</h2><p>一次判定の結果を踏まえ、より詳細な調査・出願戦略のご相談を<strong>無料</strong>で承ります。</p><ul style="margin:12px 0;padding-left:20px;font-size:14px"><li>類似商標の詳細分析</li><li>登録可能性を高める対策</li><li>出願手続きのご案内</li></ul><form method="POST" action="/mypage/request-b" style="margin-top:16px"><label>ご要望・ご質問（任意）</label><textarea name="note" maxlength="300" placeholder="特にご確認されたい点があればご記入ください" style="min-height:80px"></textarea><button type="submit" class="btn btn-success" style="width:100%">無料精査(B)を依頼する</button></form></div>`;
  }

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>進捗確認</title><style>${baseStyle()}.mypage-container{max-width:640px}</style></head><body><div class="container mypage-container">${msgHtml}<div class="card"><h1>進捗確認</h1><table><tr><th style="width:40%">受付番号</th><td style="font-family:monospace;font-weight:700">${escapeHtml(inquiry.receipt_id)}</td></tr><tr><th>ステータス</th><td>${escapeHtml(statusLabel)}</td></tr><tr><th>最終更新</th><td>${escapeHtml(updatedAt)}</td></tr></table></div>${resultHtml}${bCtaHtml}<form method="POST" action="/mypage/logout" style="text-align:center;margin-top:24px"><button type="submit" class="btn btn-secondary">ログアウト</button></form></div></body></html>`;
}

// === staff HTML ===
function staffListHtml(inquiries, statusFilter) {
  const rows = inquiries.map(inq => {
    const statusLabel = STATUS_LABELS[inq.status] || inq.status;
    const date = new Date(inq.created_at).toLocaleDateString("ja-JP");
    const tm = escapeHtml(inq.trademark_text.substring(0, 25)) + (inq.trademark_text.length > 25 ? "..." : "");
    return `<tr><td><a href="/staff/inquiry/${inq.receipt_id}">${inq.receipt_id}</a></td><td>${tm}</td><td>${escapeHtml(statusLabel)}</td><td>${date}</td></tr>`;
  }).join("");
  const options = ["", "received", "reviewing", "result_sent", "b_requested", "closed"].map(s => {
    const label = s ? (STATUS_LABELS[s] || s) : "すべて";
    return `<option value="${s}" ${s === statusFilter ? "selected" : ""}>${label}</option>`;
  }).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>スタッフ - 案件一覧</title><style>${baseStyle()}</style></head><body><div class="container"><h1>案件一覧</h1><form method="GET" style="margin-bottom:20px"><label>ステータス絞り込み</label><select name="status" onchange="this.form.submit()">${options}</select></form><div class="card"><table><thead><tr><th>受付番号</th><th>商標</th><th>ステータス</th><th>受付日</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>データがありません</td></tr>"}</tbody></table></div></div></body></html>`;
}

function staffDetailHtml(inq, msg = "") {
  const statusLabel = STATUS_LABELS[inq.status] || inq.status;
  const resultLabel = inq.result_level ? (RESULT_LABELS[inq.result_level] || inq.result_level) : "未設定";
  const msgHtml = msg.startsWith("error:") ? `<div class="msg-error">${escapeHtml(msg.slice(6))}</div>` : (msg ? `<div class="msg-success">${escapeHtml(msg)}</div>` : "");
  const statusOptions = ["received","reviewing","result_sent","b_requested","closed"].map(s => `<option value="${s}" ${s===inq.status?"selected":""}>${STATUS_LABELS[s]}</option>`).join("");
  const resultOptions = ["","green","yellow","red"].map(r => `<option value="${r}" ${r===inq.result_level?"selected":""}>${r ? RESULT_LABELS[r] : "-- 選択 --"}</option>`).join("");
  const alreadySent = !!inq.result_sent_at;
  const sentWarning = alreadySent ? `<p style="color:#d97706;font-size:13px">※既に送信済み（${new Date(inq.result_sent_at).toLocaleString("ja-JP")}）</p>` : "";
  const bInfo = inq.b_requested_at ? `<div class="card" style="background:#f0fdf4;border-left:4px solid #059669"><h2 style="color:#059669">無料精査(B) 依頼あり</h2><p>依頼日時: ${new Date(inq.b_requested_at).toLocaleString("ja-JP")}</p>${inq.b_request_note ? `<p>備考: ${escapeHtml(inq.b_request_note)}</p>` : ""}</div>` : "";

  // テンプレートJS
  const templatesJson = JSON.stringify({
    red: applyTemplate(RESULT_TEMPLATES.red, { receipt_id: inq.receipt_id, trademark_text: inq.trademark_text, goods_services: inq.goods_services }),
    yellow: applyTemplate(RESULT_TEMPLATES.yellow, { receipt_id: inq.receipt_id, trademark_text: inq.trademark_text, goods_services: inq.goods_services }),
    green: applyTemplate(RESULT_TEMPLATES.green, { receipt_id: inq.receipt_id, trademark_text: inq.trademark_text, goods_services: inq.goods_services })
  });

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>案件詳細 - ${inq.receipt_id}</title><style>${baseStyle()}</style></head><body><div class="container">
  <p><a href="/staff/">&larr; 一覧に戻る</a></p>${msgHtml}${bInfo}
  <div class="card"><h1>案件詳細</h1><table>
    <tr><th>受付番号</th><td style="font-family:monospace">${inq.receipt_id}</td></tr>
    <tr><th>受付日時</th><td>${new Date(inq.created_at).toLocaleString("ja-JP")}</td></tr>
    <tr><th>ステータス</th><td>${escapeHtml(statusLabel)}</td></tr>
    <tr><th>商標（文字）</th><td>${escapeHtml(inq.trademark_text)}</td></tr>
    <tr><th>商品・サービス</th><td>${escapeHtml(inq.goods_services)}</td></tr>
    <tr><th>メール</th><td>${escapeHtml(inq.email)}</td></tr>
    <tr><th>予備メール</th><td>${escapeHtml(inq.email_backup || "-")}</td></tr>
    <tr><th>ロゴ</th><td>${escapeHtml(inq.logo || "-")}</td></tr>
    <tr><th>使用状況</th><td>${escapeHtml(inq.usage_status || "-")}</td></tr>
    <tr><th>参考URL</th><td>${escapeHtml(inq.reference_url || "-")}</td></tr>
  </table></div>

  <div class="card"><h2>ステータス更新</h2>
    <form method="POST" action="/staff/inquiry/${inq.receipt_id}/status">
      <label>ステータス</label><select name="status">${statusOptions}</select>
      <label>メモ（内部用）</label><input type="text" name="status_note" value="${escapeHtml(inq.status_note || "")}">
      <button type="submit" class="btn">更新</button>
    </form>
  </div>

  <div class="card"><h2>結果設定</h2>
    <div style="margin-bottom:16px">
      <span style="font-size:13px;color:#64748b">テンプレ挿入:</span>
      <button type="button" class="btn btn-sm btn-success" onclick="insertTemplate('green')">Green</button>
      <button type="button" class="btn btn-sm" style="background:#d97706" onclick="insertTemplate('yellow')">Yellow</button>
      <button type="button" class="btn btn-sm btn-danger" onclick="insertTemplate('red')">Red</button>
    </div>
    <form method="POST" action="/staff/inquiry/${inq.receipt_id}/result">
      <label>判定</label><select name="result_level" id="result_level">${resultOptions}</select>
      <label>結果本文 <span id="charCount" class="char-count">0文字</span></label>
      <textarea name="result_body" id="result_body" placeholder="80〜1500字" oninput="updateCharCount()">${escapeHtml(inq.result_body || "")}</textarea>
      <button type="submit" class="btn">結果を保存</button>
    </form>
  </div>

  <div class="card"><h2>結果送信</h2>
    <p>現在の結果: <strong>${escapeHtml(resultLabel)}</strong></p>${sentWarning}
    <form method="POST" action="/staff/inquiry/${inq.receipt_id}/send-result">
      ${alreadySent ? '<label><input type="checkbox" name="resend" value="1"> 再送する</label>' : ''}
      <button type="submit" class="btn btn-danger" ${!inq.result_level || !inq.result_body ? 'disabled title="結果を先に保存"' : ''}>結果をメール送信</button>
    </form>
  </div>
</div>
<script>
var templates = ${templatesJson};
function insertTemplate(level) {
  document.getElementById('result_level').value = level;
  document.getElementById('result_body').value = templates[level];
  updateCharCount();
}
function updateCharCount() {
  var len = document.getElementById('result_body').value.length;
  document.getElementById('charCount').textContent = len + '文字';
}
updateCharCount();
</script>
</body></html>`;
}

// === Main ===
async function main() {
  const app = express();
  const db = initDatabase();

  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc:["'self'"], scriptSrc:["'self'","'unsafe-inline'"], styleSrc:["'self'","'unsafe-inline'"], imgSrc:["'self'","data:"], formAction:["'self'"] } },
    referrerPolicy: { policy: "no-referrer" }
  }));
  app.use(express.urlencoded({ extended: false, limit: "50kb" }));

  // キャッシュ禁止ミドルウェア（/mypage, /staff）
  app.use((req, res, next) => {
    if (req.path.startsWith("/mypage") || req.path.startsWith("/staff")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    }
    next();
  });

  app.get("/healthz", (_, res) => res.status(200).send("ok"));

  // ========== /mypage ==========
  app.get("/mypage/login", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(loginPageHtml());
  });

  app.post("/mypage/login", (req, res) => {
    const receiptId = safeStr(req.body.receipt_id), accessKey = safeStr(req.body.access_key);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!isValidReceiptId(receiptId)) return res.status(400).send(loginPageHtml("受付番号またはアクセスキーが正しくありません。"));
    const inquiry = db.prepare("SELECT access_key_hash, access_key_salt FROM inquiries WHERE receipt_id = ?").get(receiptId);
    if (!inquiry || !verifyAccessKey(accessKey, inquiry.access_key_hash, inquiry.access_key_salt)) {
      console.log(`[mypage] login failed for ${receiptId}`);
      return res.status(400).send(loginPageHtml("受付番号またはアクセスキーが正しくありません。"));
    }
    const token = createSessionToken(receiptId);
    const secure = isSecureRequest(req);
    res.setHeader("Set-Cookie", `sp_session=${token}; HttpOnly; SameSite=Lax; Path=/mypage; Max-Age=${SESSION_MAX_AGE/1000}${secure?"; Secure":""}`);
    console.log(`[mypage] login success for ${receiptId}`);
    return res.redirect(303, "/mypage/");
  });

  app.post("/mypage/logout", (req, res) => {
    const secure = isSecureRequest(req);
    res.setHeader("Set-Cookie", `sp_session=; HttpOnly; SameSite=Lax; Path=/mypage; Max-Age=0${secure?"; Secure":""}`);
    return res.redirect(303, "/mypage/login");
  });

  app.get("/mypage/", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const receiptId = verifySessionToken(cookies.sp_session);
    if (!receiptId) return res.redirect(303, "/mypage/login");
    const inquiry = db.prepare("SELECT receipt_id, status, status_updated_at, result_level, result_body, result_sent_at, b_requested_at FROM inquiries WHERE receipt_id = ?").get(receiptId);
    if (!inquiry) { res.setHeader("Set-Cookie", "sp_session=; HttpOnly; SameSite=Lax; Path=/mypage; Max-Age=0"); return res.redirect(303, "/mypage/login"); }
    const msg = safeStr(req.query.msg);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(mypageHtml(inquiry, msg));
  });

  app.get("/mypage", (_, res) => res.redirect(301, "/mypage/"));

  // B依頼
  app.post("/mypage/request-b", async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const receiptId = verifySessionToken(cookies.sp_session);
    if (!receiptId) return res.redirect(303, "/mypage/login");

    const inquiry = db.prepare("SELECT receipt_id, email, trademark_text, goods_services, b_requested_at FROM inquiries WHERE receipt_id = ?").get(receiptId);
    if (!inquiry) return res.redirect(303, "/mypage/login");
    if (inquiry.b_requested_at) return res.redirect(303, "/mypage/?msg=b_requested"); // 既に依頼済み

    const note = safeStr(req.body.note).substring(0, 300);
    const now = nowIso();

    db.prepare("UPDATE inquiries SET b_requested_at = ?, b_request_note = ?, status = 'b_requested', status_updated_at = ? WHERE receipt_id = ?").run(now, note, now, receiptId);
    console.log(`[mypage] B requested for ${receiptId}`);

    // スタッフ通知
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim();
    if (adminEmail) {
      try {
        const mailFrom = (process.env.MAIL_FROM || "no-reply@example.com").trim();
        const transport = await createTransport();
        await transport.sendMail({
          from: mailFrom, to: adminEmail,
          subject: `無料精査(B)希望 [${receiptId}]`,
          text: `無料精査(B)の依頼がありました。\n\n受付番号: ${receiptId}\n商標: ${inquiry.trademark_text}\n商品/サービス: ${inquiry.goods_services}\nメール: ${inquiry.email}\n依頼日時: ${now}\n${note ? `備考: ${note}\n` : ""}\nスタッフ画面: /staff/inquiry/${receiptId}\n`
        });
        console.log(`[mail] B request notification sent to ${adminEmail}`);
      } catch (e) { console.error(`[mail] B request notification failed:`, e.message); }
    }

    return res.redirect(303, "/mypage/?msg=b_requested");
  });

  // ========== /staff ==========
  app.get("/staff/", (req, res) => {
    const statusFilter = safeStr(req.query.status);
    let sql = "SELECT receipt_id, trademark_text, status, created_at FROM inquiries";
    const params = [];
    if (statusFilter) { sql += " WHERE status = ?"; params.push(statusFilter); }
    sql += " ORDER BY created_at DESC LIMIT 100";
    const inquiries = db.prepare(sql).all(...params);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(staffListHtml(inquiries, statusFilter));
  });

  app.get("/staff", (_, res) => res.redirect(301, "/staff/"));

  app.get("/staff/inquiry/:rid", (req, res) => {
    const rid = safeStr(req.params.rid);
    if (!isValidReceiptId(rid)) return res.status(400).send("Invalid receipt_id");
    const inq = db.prepare("SELECT * FROM inquiries WHERE receipt_id = ?").get(rid);
    if (!inq) return res.status(404).send("Not found");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(staffDetailHtml(inq, safeStr(req.query.msg)));
  });

  app.post("/staff/inquiry/:rid/status", (req, res) => {
    const rid = safeStr(req.params.rid), status = safeStr(req.body.status), statusNote = safeStr(req.body.status_note);
    if (!isValidReceiptId(rid)) return res.status(400).send("Invalid");
    if (!["received","reviewing","result_sent","b_requested","closed"].includes(status)) return res.status(400).send("Invalid status");
    db.prepare("UPDATE inquiries SET status = ?, status_updated_at = ?, status_note = ? WHERE receipt_id = ?").run(status, nowIso(), statusNote, rid);
    console.log(`[staff] status: ${rid} -> ${status}`);
    return res.redirect(303, `/staff/inquiry/${rid}?msg=ステータスを更新しました`);
  });

  app.post("/staff/inquiry/:rid/result", (req, res) => {
    const rid = safeStr(req.params.rid), resultLevel = safeStr(req.body.result_level), resultBody = safeStr(req.body.result_body);
    if (!isValidReceiptId(rid)) return res.status(400).send("Invalid");
    if (resultLevel && !["red","yellow","green"].includes(resultLevel)) return res.status(400).send("Invalid level");
    if (resultBody && (resultBody.length < 80 || resultBody.length > 1500)) {
      return res.redirect(303, `/staff/inquiry/${rid}?msg=error:結果本文は80〜1500文字で入力してください（現在${resultBody.length}文字）`);
    }
    db.prepare("UPDATE inquiries SET result_level = ?, result_body = ?, result_updated_at = ? WHERE receipt_id = ?").run(resultLevel || null, resultBody || null, nowIso(), rid);
    console.log(`[staff] result: ${rid} -> ${resultLevel}`);
    return res.redirect(303, `/staff/inquiry/${rid}?msg=結果を保存しました`);
  });

  app.post("/staff/inquiry/:rid/send-result", async (req, res) => {
    const rid = safeStr(req.params.rid), resend = safeStr(req.body.resend) === "1";
    if (!isValidReceiptId(rid)) return res.status(400).send("Invalid");
    const inq = db.prepare("SELECT email, trademark_text, result_level, result_body, result_sent_at FROM inquiries WHERE receipt_id = ?").get(rid);
    if (!inq) return res.status(404).send("Not found");
    if (!inq.result_level || !inq.result_body) return res.redirect(303, `/staff/inquiry/${rid}?msg=error:結果を先に保存してください`);
    if (inq.result_body.length < 80) return res.redirect(303, `/staff/inquiry/${rid}?msg=error:結果本文が短すぎます（80文字以上）`);
    if (inq.result_sent_at && !resend) return res.redirect(303, `/staff/inquiry/${rid}?msg=error:既に送信済みです。再送はチェックを入れてください`);

    const levelLabel = RESULT_LABELS[inq.result_level] || inq.result_level;
    const mailFrom = (process.env.MAIL_FROM || "no-reply@example.com").trim();
    const text = `一次判定の結果をお知らせいたします。\n\n受付番号: ${rid}\n判定: ${levelLabel}\n\n--- 結果 ---\n${inq.result_body}\n\n---\n\n【無料精査(B)のご案内】\n一次判定の結果を踏まえ、より詳細な調査・出願戦略のご相談を無料で承ります。\nご希望の場合は、進捗確認ページにログインして「無料精査(B)を依頼する」ボタンからお申し込みください。\n\n※本判定は簡易調査に基づくものであり、最終的な登録可否を保証するものではありません。\n\n--\nFarEast国際特許事務所\n`;

    try {
      const transport = await createTransport();
      await transport.sendMail({ from: mailFrom, to: inq.email, subject: `一次判定結果 [${rid}]`, text });
      console.log(`[staff] result mail sent to ${inq.email} for ${rid}`);
      db.prepare("UPDATE inquiries SET result_sent_at = ?, status = 'result_sent', status_updated_at = ? WHERE receipt_id = ?").run(nowIso(), nowIso(), rid);
      return res.redirect(303, `/staff/inquiry/${rid}?msg=結果をメール送信しました`);
    } catch (err) {
      console.error(`[staff] result mail failed:`, err.message);
      return res.redirect(303, `/staff/inquiry/${rid}?msg=error:メール送信失敗: ${err.message}`);
    }
  });

  // ========== /api/sp-inquiry ==========
  app.post("/api/sp-inquiry", async (req, res) => {
    try {
      if (safeStr(req.body.hp_company)) return res.status(200).send("ok");
      const trademark_text = safeStr(req.body.trademark_text), goods_services = safeStr(req.body.goods_services);
      const email = safeStr(req.body.email), email_confirm = safeStr(req.body.email_confirm);
      if (!trademark_text || !goods_services || !email || !email_confirm) return res.status(400).send("required fields missing");
      if (!isEmail(email) || !isEmail(email_confirm) || email !== email_confirm) return res.status(400).send("email mismatch");
      const email_backup = safeStr(req.body.email_backup), logo = safeStr(req.body.logo);
      const usage_status = safeStr(req.body.usage_status), reference_url = safeStr(req.body.reference_url);

      let receipt_id;
      for (let i = 0; i < 5; i++) { receipt_id = generateReceiptId(); if (!db.prepare("SELECT 1 FROM inquiries WHERE receipt_id = ?").get(receipt_id)) break; if (i === 4) return res.status(500).send("internal error"); }
      const access_key = generateAccessKey();
      const { hash: access_key_hash, salt: access_key_salt } = hashAccessKey(access_key);
      const created_at = nowIso(), ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "", user_agent = req.headers["user-agent"] || "";

      db.prepare("INSERT INTO inquiries (receipt_id, email, trademark_text, goods_services, email_backup, logo, usage_status, reference_url, access_key_hash, access_key_salt, created_at, ip, user_agent, status, status_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'received',?)").run(receipt_id, email, trademark_text, goods_services, email_backup, logo, usage_status, reference_url, access_key_hash, access_key_salt, created_at, ip, user_agent, created_at);
      console.log(`[db] inserted ${receipt_id}`);

      const payload = { received_at: created_at, receipt_id, ip, user_agent, form: { trademark_text, goods_services, email, email_backup, logo, usage_status, reference_url } };
      const dataDir = process.env.DATA_DIR?.trim() || "./data", absDataDir = path.resolve(__dirname, dataDir);
      fs.mkdirSync(absDataDir, { recursive: true });
      const fileName = `${created_at.replace(/[:.]/g, "-")}_${crypto.randomBytes(6).toString("hex")}.json`;
      fs.writeFileSync(path.join(absDataDir, fileName), JSON.stringify(payload, null, 2), "utf8");
      console.log(`[saved] ${fileName}`);

      const adminEmail = (process.env.ADMIN_EMAIL || "").trim(), mailFrom = (process.env.MAIL_FROM || "no-reply@example.com").trim();
      const transport = await createTransport();
      try {
        await transport.sendMail({ from: mailFrom, to: email, subject: "【受付番号のご案内】一次判定お申込み", text: `一次判定のお申込みありがとうございます。\n\n受付番号: ${receipt_id}\nアクセスキー: ${access_key}\n\n※アクセスキーは再発行できませんので、大切に保管してください。\n※進捗確認: /mypage/ にてご確認いただけます。\n\n--\nFarEast国際特許事務所\n` });
        console.log(`[mail] user sent to ${email}`);
      } catch (e) { console.error(`[mail] user failed:`, e.message); if (mailRequired) return res.status(500).send("mail failed"); }
      if (adminEmail) {
        try { await transport.sendMail({ from: mailFrom, to: adminEmail, subject: `一次判定 受付 [${receipt_id}]: ${trademark_text}`, text: `受付番号: ${receipt_id}\n商標: ${trademark_text}\n商品: ${goods_services}\nメール: ${email}\n` }); console.log(`[mail] admin sent`); }
        catch (e) { console.error(`[mail] admin failed:`, e.message); if (mailRequired) return res.status(500).send("admin mail failed"); }
      } else if (mailRequired) return res.status(500).send("ADMIN_EMAIL not configured");
      return res.redirect(303, `/sp/thanks/?rid=${encodeURIComponent(receipt_id)}`);
    } catch (e) { console.error(e); return res.status(500).send("internal error"); }
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 8787;
  app.listen(port, "127.0.0.1", () => { console.log(`[sp-form-receiver] listening on http://127.0.0.1:${port}`); if (mailRequired) console.log(`[sp-form-receiver] MAIL_REQUIRED=true`); });
}

main().catch(e => { console.error(e); process.exit(1); });
