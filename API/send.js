import { isAllowedOrigin, isRateLimited, isValidImage, isValidChatId, setSecurityHeaders } from "./_security.js";

export const config = { api: { bodyParser: false, sizeLimit: "8mb" } };

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!isAllowedOrigin(req)) return res.status(403).json({ ok: false, error: "forbidden" });
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (isRateLimited(req)) return res.status(429).json({ ok: false, error: "rate limit" });
  if (!isValidImage(req)) return res.status(400).json({ ok: false, error: "invalid file" });

  const BOT_TOKEN = process.env.BOT_TOKEN || "";
  const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return res.status(500).json({ ok: false, error: "not configured" });

  const target = String((req.query && req.query.target) || "");
  const caption = String((req.query && req.query.caption) || "").slice(0, 800);
  const role = String((req.query && req.query.role) || "user");
  const chatId = role === "admin" ? ADMIN_CHAT_ID : (target && isValidChatId(target) ? target : ADMIN_CHAT_ID);

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuffer = Buffer.concat(chunks);
    if (bodyBuffer.length > 8 * 1024 * 1024) return res.status(413).json({ ok: false, error: "too large" });

    const incomingCT = req.headers["content-type"] || "";
    const m = incomingCT.match(/boundary=(.+)$/);
    if (!m) return res.status(400).json({ ok: false, error: "no boundary" });
    const incomingBoundary = m[1];

    const boundary = "----VelaBoundary" + Date.now();
    const contentType = `multipart/form-data; boundary=${boundary}`;
    const parts = [];
    const pushField = (n, v) => parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`));
    pushField("chat_id", chatId);
    if (caption) pushField("caption", caption);
    pushField("parse_mode", "HTML");

    const fm = bodyBuffer.toString("binary").match(new RegExp(`--${incomingBoundary}\\r\\nContent-Disposition: form-data; name="photo"; filename="([^"]+)"\\r\\nContent-Type: ([^\\r]+)\\r\\n\\r\\n`, "i"));
    if (!fm) return res.status(400).json({ ok: false, error: "no photo" });

    const filename = fm[1], mime = fm[2];
    const headerEnd = bodyBuffer.indexOf("\r\n\r\n", bodyBuffer.indexOf(Buffer.from(`filename="${filename}"`))) + 4;
    const fileEnd = bodyBuffer.indexOf(Buffer.from(`\r\n--${incomingBoundary}`), headerEnd);
    const fileBuffer = bodyBuffer.slice(headerEnd, fileEnd);

    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const finalBody = Buffer.concat(parts);
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST", headers: { "content-type": contentType }, body: finalBody
    });
    const tgData = await tgRes.json();
    return res.status(200).json({ ok: tgData.ok || false, description: tgData.ok ? "sent" : (tgData.description || "failed") });
  } catch (err) {
    console.error("[vela/send]", err.message);
    return res.status(500).json({ ok: false, error: "server error" });
  }
}
