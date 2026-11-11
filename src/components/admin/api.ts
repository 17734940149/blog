"use client";

import { useCallback, useEffect, useState } from "react";

// 保存错误码，界面才能按语言展示常见错误，同时保留服务端的具体原因。
export class AdminApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// 后台统一通过同源接口访问，认证 Cookie 不暴露给页面脚本。
export async function adminRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AdminApiError(
      result.error || "",
      result.code || "REQUEST_FAILED",
      response.status,
    );
  return result.data as T;
}

// 常见错误采用稳定错误码映射，业务数据和未知服务端错误不做错误翻译。
export function adminErrorMessage(error: unknown, t: (key: string) => string) {
  if (error instanceof AdminApiError) {
    const keys: Record<string, string> = {
      INVALID_CREDENTIALS: "invalidCredentials",
      UNAUTHORIZED: "sessionExpired",
      SETUP_REQUIRED: "setupRequired",
      RATE_LIMITED: "rateLimited",
      VALIDATION_ERROR: "validationError",
      SLUG_CONFLICT: "slugConflict",
      NOT_FOUND: "notFound",
      FILE_TOO_LARGE: "fileTooLarge",
      UPLOAD_TOO_LARGE: "fileTooLarge",
      INVALID_FILE: "invalidFile",
      INVALID_IMAGE: "invalidFile",
      FORBIDDEN: "forbidden",
      SERVICE_UNAVAILABLE: "networkError",
      CONFLICT: "slugConflict",
    };
    if (keys[error.code]) return t(`admin.${keys[error.code]}`);
    if (error.status === 401) return t("admin.sessionExpired");
    if (error.status === 429) return t("admin.rateLimited");
    return error.message || t("admin.requestFailed");
  }
  return t("admin.networkError");
}

// 集中处理加载、失败和重试，避免每张管理页面重复异步状态逻辑。
export function useAdminResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    adminRequest<T>(url, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, version]);
  return { data, setData, loading, error, reload };
}

// 未保存的编辑离开前提醒，防止侧栏跳转或刷新导致写作内容丢失。
export function useUnsavedChanges(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const beforeNavigate = (event: MouseEvent) => {
      const target =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !target ||
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const url = new URL(target.href, window.location.href);
      if (
        url.href === window.location.href ||
        (url.hash && url.pathname === window.location.pathname)
      )
        return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [dirty, message]);
}
