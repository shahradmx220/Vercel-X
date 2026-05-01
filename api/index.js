export const config = { runtime: "edge" };

// تنظیمات امنیتی
const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");
const SECRET_PATH = process.env.SECRET_PATH || "my-secret-tunnel"; // یک کلمه عبور برای مسیر

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", 
  "proxy-authorization", "te", "trailer", "transfer-encoding", 
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto", 
  "x-forwarded-port", "cf-ray", "cf-connecting-ip"
]);

export default async function handler(req) {
  const url = new URL(req.url);
  
  // ۱. لایه امنیتی: اگر مسیر شامل کلمه رمز نباشد، ورسل فکر می‌کند این یک سایت معمولی است
  if (!url.pathname.includes(SECRET_PATH)) {
    return new Response("<html><body><h1>Welcome to my Portfolio</h1><p>Under construction.</p></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" }
    });
  }

  if (!TARGET_BASE) {
    return new Response("Gateway Config Error", { status: 500 });
  }

  try {
    // ۲. استخراج مسیر واقعی و حذف بخش امنیتی از URL برای ارسال به مقصد
    const cleanPath = url.pathname.replace(`/${SECRET_PATH}`, "");
    const targetUrl = TARGET_BASE + cleanPath + url.search;

    const outHeaders = new Headers();
    let clientIp = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for");

    for (const [k, v] of req.headers) {
      if (STRIP_HEADERS.has(k.toLowerCase()) || k.toLowerCase().startsWith("x-vercel-")) continue;
      outHeaders.set(k, v);
    }

    // ۳. جعل هویت (User-Agent رندوم برای جلوگیری از شناسایی الگو)
    if (!outHeaders.has("user-agent")) {
        outHeaders.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    }

    if (clientIp) outHeaders.set("x-forwarded-for", clientIp.split(',')[0]);

    const hasBody = req.method !== "GET" && req.method !== "HEAD";

    // ۴. ارسال درخواست به صورت Stream با تنظیمات پیشرفته
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: outHeaders,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    // ۵. اصلاح هدرهای بازگشتی برای جلوگیری از نشت اطلاعات سرور اصلی
    const safeResponseHeaders = new Headers(response.headers);
    safeResponseHeaders.delete("server");
    safeResponseHeaders.delete("x-powered-by");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: safeResponseHeaders,
    });

  } catch (err) {
    console.error("Stealth Relay Error:", err);
    return new Response("Service Unavailable", { status: 503 });
  }
}