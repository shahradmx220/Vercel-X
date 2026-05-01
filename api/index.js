export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", 
  "proxy-authorization", "te", "trailer", "transfer-encoding", 
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto", 
  "x-forwarded-port"
]);

export default async function handler(req) {
  const url = new URL(req.url);

  // ۱. بررسی ست بودن دامنه مقصد
  if (!TARGET_BASE) {
    return new Response("Error: Please set TARGET_DOMAIN in Vercel Environment Variables.", { status: 500 });
  }

  try {
    // ۲. ساخت آدرس مقصد (ترکیب دامنه مقصد با مسیر فعلی)
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const outHeaders = new Headers();
    let clientIp = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for");

    // ۳. کپی کردن هدرها و حذف موارد غیرمجاز
    for (const [k, v] of req.headers) {
      if (STRIP_HEADERS.has(k.toLowerCase()) || k.toLowerCase().startsWith("x-vercel-")) continue;
      outHeaders.set(k, v);
    }

    // ۴. اضافه کردن User-Agent استاندارد برای عبور از فیلترهای احتمالی
    if (!outHeaders.has("user-agent")) {
      outHeaders.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    }

    if (clientIp) outHeaders.set("x-forwarded-for", clientIp.split(',')[0]);

    const hasBody = req.method !== "GET" && req.method !== "HEAD";

    // ۵. ارسال درخواست به مقصد
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: outHeaders,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    // ۶. برگرداندن پاسخ مقصد به کاربر
    const safeResponseHeaders = new Headers(response.headers);
    safeResponseHeaders.delete("server");
    safeResponseHeaders.delete("x-powered-by");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: safeResponseHeaders,
    });

  } catch (err) {
    console.error("Relay Error:", err);
    return new Response("Tunnel Error: Check if Target Domain is accessible.", { status: 502 });
  }
}
