const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const nodemailer = require("nodemailer");

function nowIso() {
  return new Date().toISOString();
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isEmail(v) {
  // 厳密ではなく最小限（Phase1）
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function createTransport() {
  const host = process.env.SMTP_HOST && process.env.SMTP_HOST.trim();
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER && process.env.SMTP_USER.trim();
  const pass = process.env.SMTP_PASS && process.env.SMTP_PASS.trim();

  if (host && port && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
  }

  // fallback: sendmail（SMTPが未設定の場合）
  return nodemailer.createTransport({
    sendmail: true,
    newline: "unix",
    path: "/usr/sbin/sendmail"
  });
}

async function main() {
  const app = express();

  app.use(helmet());
  app.use(express.urlencoded({ extended: false, limit: "50kb" }));

  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });

  app.post("/api/sp-inquiry", async (req, res) => {
    try {
      const hp = safeStr(req.body.hp_company);
      if (hp) {
        // bot っぽい：成功っぽく返して静かに捨てる
        return res.status(200).send("ok");
      }

      const trademark_text = safeStr(req.body.trademark_text);
      const goods_services = safeStr(req.body.goods_services);
      const email = safeStr(req.body.email);
      const email_confirm = safeStr(req.body.email_confirm);

      if (!trademark_text || !goods_services || !email || !email_confirm) {
        return res.status(400).send("required fields missing");
      }
      if (!isEmail(email) || !isEmail(email_confirm) || email !== email_confirm) {
        return res.status(400).send("email mismatch");
      }

      const payload = {
        received_at: nowIso(),
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
        user_agent: req.headers["user-agent"] || "",
        form: {
          trademark_text,
          goods_services,
          email,
          email_backup: safeStr(req.body.email_backup),
          logo: safeStr(req.body.logo),
          usage_status: safeStr(req.body.usage_status),
          reference_url: safeStr(req.body.reference_url)
        }
      };

      const dataDir = process.env.DATA_DIR ? process.env.DATA_DIR.trim() : "./data";
      const absDataDir = path.resolve(__dirname, dataDir);
      fs.mkdirSync(absDataDir, { recursive: true });

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rnd = crypto.randomBytes(6).toString("hex");
      const fileName = `${stamp}_${rnd}.json`;
      const absPath = path.join(absDataDir, fileName);

      fs.writeFileSync(absPath, JSON.stringify(payload, null, 2), "utf8");

      const adminEmail = (process.env.ADMIN_EMAIL || "").trim();
      if (!adminEmail) {
        // 受領はできているが通知できないのは事故なので 500 にする（=気づける）
        return res.status(500).send("ADMIN_EMAIL missing");
      }

      const mailFrom = (process.env.MAIL_FROM || "no-reply@example.com").trim();
      const subject = `一次判定 /sp 受付: ${trademark_text}`;
      const text =
        `一次判定の申込みを受領しました。\n\n` +
        `受領日時: ${payload.received_at}\n` +
        `IP: ${payload.ip}\n` +
        `UA: ${payload.user_agent}\n\n` +
        `商標（文字）: ${payload.form.trademark_text}\n` +
        `商品・サービス: ${payload.form.goods_services}\n` +
        `メール: ${payload.form.email}\n` +
        `予備メール: ${payload.form.email_backup}\n` +
        `ロゴ: ${payload.form.logo}\n` +
        `使用状況: ${payload.form.usage_status}\n` +
        `参考URL: ${payload.form.reference_url}\n\n` +
        `保存先: ${absPath}\n`;

      const transport = await createTransport();
      await transport.sendMail({
        from: mailFrom,
        to: adminEmail,
        subject,
        text
      });

      // 送信完了ページへ
      return res.redirect(303, "/sp/thanks/");
    } catch (e) {
      console.error(e);
      return res.status(500).send("internal error");
    }
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 8787;
  app.listen(port, "127.0.0.1", () => {
    console.log(`[sp-form-receiver] listening on http://127.0.0.1:${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
