import { cookies } from "next/headers";
import { cache } from "react";
import type { ApiSuccess } from "@/lib/types";

// 同次页面请求复用资料读取结果，不同请求不共享语言，避免显示其他访客的语言内容。
export const serverResource = cache(async function serverResource<T>(
  path: string,
): Promise<ApiSuccess<T>> {
  const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
  const locale = (await cookies()).get("locale")?.value === "en" ? "en" : "zh";
  const response = await fetch(`${base}/api${path}`, {
    cache: "no-store",
    headers: { "Accept-Language": locale },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${path}`);
  return (await response.json()) as ApiSuccess<T>;
});

// 页面统一从响应信封读取内容，语言选择由后端处理，前端无需维护重复回退逻辑。
export async function serverApi<T>(path: string): Promise<T> {
  return (await serverResource<T>(path)).data;
}
