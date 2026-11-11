import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 保持浏览器同源访问 Python 服务，管理员 cookie 不必跨域传递。
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
  const url = `${base}/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  ["host", "connection", "content-length", "transfer-encoding"].forEach((key) =>
    headers.delete(key),
  );
  // 不信任浏览器传入的代理标识；限速统一使用可信连接地址。
  headers.delete("x-forwarded-for");
  headers.delete("x-real-ip");
  headers.set(
    "Accept-Language",
    request.cookies.get("locale")?.value === "en" ? "en" : "zh",
  );
  try {
    const init = {
      method: request.method,
      headers,
      cache: "no-store" as const,
      redirect: "manual" as const,
      ...(request.method !== "GET" && request.method !== "HEAD"
        ? { body: request.body, duplex: "half" }
        : {}),
      signal: AbortSignal.timeout(30_000),
    };
    const upstream = await fetch(url, init);
    const responseHeaders = new Headers(upstream.headers);
    [
      "connection",
      "transfer-encoding",
      "content-encoding",
      "content-length",
    ].forEach((key) => responseHeaders.delete(key));
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "服务暂时不可用，请稍后重试", code: "SERVICE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
};
