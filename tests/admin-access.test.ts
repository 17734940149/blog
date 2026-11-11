import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../src/proxy";

// 只构造请求对象，不启动服务器或写入会话，使拒绝访问的测试不会影响正在体验的账户。
function request(path: string, token?: string, locale = "zh"): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { Cookie: `${token === undefined ? "" : `stacknote_session=${token}; `}locale=${locale}; unrelated=ignored` },
  });
}

test("门禁只匹配管理页面，公开页面与后台 API 保持各自的访问规则", () => {
  for (const url of ["/admin", "/admin/posts", "/admin/posts/example", "/admin/login"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true, url);
  }
  for (const url of ["/", "/blog", "/projects", "/administrator", "/api/auth/me", "/api/admin/posts", "/_next/static/app.js"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false, url);
  }
});

test("无 Cookie 或令牌格式无效时直接跳登录，不访问后端", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("无效令牌不应访问后端");
  });
  for (const token of [undefined, "", "present", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64)]) {
    const response = await proxy(request("/admin/settings", token));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/admin/login");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("只有精确登录地址可放行，避免循环跳转或前缀绕过", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("登录页不依赖后端健康状态");
  });
  const login = await proxy(request("/admin/login?password=changed", "invalid"));
  assert.equal(login.headers.get("x-middleware-next"), "1");
  assert.equal(login.headers.get("Cache-Control"), "no-store");
  assert.equal(login.headers.get("location"), null);
  const nested = await proxy(request("/admin/login/nested"));
  assert.equal(nested.status, 307);
  assert.equal(fetchMock.mock.callCount(), 0);
});

for (const status of [401, 403]) {
  test(`伪造或失效令牌经后端拒绝 ${status} 后仍跳登录`, async (context) => {
    const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response(null, { status }));
    const response = await proxy(request("/admin/posts", "f".repeat(64)));
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/admin/login");
    assert.equal(response.headers.get("x-middleware-next"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });
}

test("有效会话必须由内部 me 返回 200 才放行且只转发认证 Cookie", async (context) => {
  const token = "a".repeat(64);
  const fetchMock = context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("Cookie"), `stacknote_session=${token}`);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "manual");
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json({ data: { id: "test-admin", email: "owner@example.test" } });
  });
  const response = await proxy(request("/admin/projects", token));
  assert.equal(fetchMock.mock.callCount(), 1);
  const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
  assert.equal(fetchMock.mock.calls[0].arguments[0], `${base}/api/auth/me`);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

for (const status of [500, 503, 302, 204]) {
  test(`后端异常或非预期状态 ${status} 不放行管理页`, async (context) => {
    context.mock.method(globalThis, "fetch", async () => new Response(null, { status }));
    const response = await proxy(request("/admin", "a".repeat(64)));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-middleware-next"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).code, "SERVICE_UNAVAILABLE");
  });
}

test("认证服务超时后关闭入口且保留明确的请求时限", async (context) => {
  context.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    assert.equal(milliseconds, 5_000);
    return AbortSignal.abort(new DOMException("Test timeout", "TimeoutError"));
  });
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    throw new Error("认证请求应已超时");
  });
  const response = await proxy(request("/admin/settings", "a".repeat(64)));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("x-middleware-next"), null);
});

test("连接失败返回既有英文错误文案，不暴露内部错误详情", async (context) => {
  context.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Internal host failed: private-backend:8000");
  });
  const response = await proxy(request("/admin/settings", "a".repeat(64), "en"));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "SERVICE_UNAVAILABLE");
  assert.ok(body.error.startsWith("Can't connect to the server."));
  assert.ok(!body.error.includes("private-backend"));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
