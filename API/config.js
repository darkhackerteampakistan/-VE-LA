import { isAllowedOrigin, isRateLimited, setSecurityHeaders } from "./_security.js";

export default function handler(req, res) {
  setSecurityHeaders(res);
  if (!isAllowedOrigin(req)) return res.status(403).json({ error: "forbidden" });
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  if (isRateLimited(req)) return res.status(429).json({ error: "too many requests" });
  return res.status(200).json({
    recaptchaKey: process.env.RECAPTCHA_SITE_KEY || "",
    hasBot: !!(process.env.BOT_TOKEN),
    sendEnabled: true
  });
}
