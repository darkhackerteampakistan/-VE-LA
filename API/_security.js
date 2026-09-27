const ALLOWED_ORIGINS = [
  "https://ve-la-iota.vercel.app/",
  "http://localhost:3000",
  "http://localhost:5173"
];

export function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  if (!origin && !referer) return true;
  const check = origin || referer;
  for (const allowed of ALLOWED_ORIGINS) if (check.startsWith(allowed)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app/.test(check)) return true;
  return false;
}

const RATE_STORE = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;

export function isRateLimited(req) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.headers["x-real-ip"] || "unknown";
  const now = Date.now();
  const entry = RATE_STORE.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) { RATE_STORE.set(ip, { start: now, count: 1 }); return false; }
  entry.count++;
  if (RATE_STORE.size > 1000) { for (const [k, v] of RATE_STORE.entries()) { if (now - v.start > RATE_WINDOW_MS * 2) RATE_STORE.delete(k); } }
  return entry.count > RATE_MAX;
}

export function isValidImage(req) {
  const ct = req.headers["content-type"] || "";
  if (!ct.startsWith("multipart/form-data")) return false;
  const len = parseInt(req.headers["content-length"] || "0", 10);
  if (len > 8 * 1024 * 1024) return false;
  return true;
}

export function isValidChatId(id) { return /^-?\d{6,15}$/.test(String(id || "")); }

export function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}
