import { NextRequest, NextResponse } from "next/server";
import { translator } from "./lang";

// 管理页的通行与拒绝结果都依赖当前会话，禁止浏览器或代理复用其他请求的认证结果。
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

// 统一回到固定站内登录地址，既避免未登录页面先渲染，也不接收外部重定向目标。
function loginRedirect(request: NextRequest): NextResponse {
  return noStore(NextResponse.redirect(new URL("/admin/login", request.url)));
}

// 页面门禁必须由后端确认真实会话；Cookie 存在或格式正确都不能代替数据库中的有效认证。
export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname === "/admin/login") {
    return noStore(NextResponse.next());
  }
  const token = request.cookies.get("stacknote_session")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return loginRedirect(request);
  }
  try {
    const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
    const response = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: `stacknote_session=${token}` },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 200) return noStore(NextResponse.next());
    if (response.status === 401 || response.status === 403) {
      return loginRedirect(request);
    }
  } catch {
    // 服务异常时不能猜测会话仍有效，保持关闭入口并使用已有语言包解释暂时不可用。
  }
  const locale = request.cookies.get("locale")?.value === "en" ? "en" : "zh";
  return noStore(
    NextResponse.json(
      { error: translator(locale)("admin.networkError"), code: "SERVICE_UNAVAILABLE" },
      { status: 503 },
    ),
  );
}

export const config = { matcher: "/admin/:path*" };
