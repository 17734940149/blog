"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useI18n } from "@/components/providers";
import type { AdminUser } from "@/lib/types";
import { adminRequest } from "./api";
import { AdminError, AdminLoading, AdminPreferences } from "./ui";

const navigation = [
  { href: "/admin", key: "overview", icon: LayoutDashboard },
  { href: "/admin/posts", key: "posts", icon: FileText },
  { href: "/admin/projects", key: "projects", icon: FolderKanban },
  { href: "/admin/settings", key: "settings", icon: Settings },
];

// 后台单独验证会话，未经认证时不渲染业务页面；API 本身仍在服务端鉴权。
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const isLogin = pathname === "/admin/login";
  useEffect(() => {
    if (isLogin) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    setError(null);
    adminRequest<AdminUser>("/api/auth/me", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setUser(result);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause.status === 401) {
          setUser(null);
          router.replace("/admin/login");
        } else setError(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [isLogin, router, attempt]);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  // 成功注销后再离开后台，避免网络失败时误报退出。
  async function logout() {
    if (!window.confirm(t("admin.logoutConfirm"))) return;
    setLoggingOut(true);
    try {
      await adminRequest("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.replace("/admin/login");
      router.refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setLoggingOut(false);
    }
  }
  if (isLogin) return <div className="admin-root">{children}</div>;
  if (checking)
    return (
      <div className="admin-root">
        <AdminLoading />
      </div>
    );
  if (!user)
    return (
      <div className="admin-root admin-auth-state">
        {error ? (
          <AdminError
            error={error}
            retry={() => setAttempt((value) => value + 1)}
          />
        ) : (
          <AdminLoading />
        )}
      </div>
    );
  return (
    <div className="admin-root admin-shell">
      <div className="admin-mobile-bar">
        <Link href="/admin" className="admin-brand">
          <BrandLogo className="admin-brand-logo" />
          {t("admin.workspace")}
        </Link>
        <button
          className="admin-icon-button"
          aria-label={mobileOpen ? t("admin.closeMenu") : t("admin.openMenu")}
          aria-expanded={mobileOpen}
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
        >
          {mobileOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
      </div>
      {mobileOpen && (
        <button
          className="admin-sidebar-overlay"
          aria-label={t("admin.closeMenu")}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`admin-sidebar ${mobileOpen ? "admin-sidebar-open" : ""}`}
      >
        <Link href="/admin" className="admin-brand">
          <span className="admin-brand-symbol">
            <BrandLogo className="admin-brand-logo" />
          </span>
          <span>
            {t("admin.workspace")}
            <small>GY</small>
          </span>
        </Link>
        <div className="admin-sidebar-label">
          {t("admin.contentManagement")}
        </div>
        <nav aria-label={t("admin.navigation")}>
          {navigation.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`admin-nav-link ${(href === "/admin" ? pathname === href : pathname.startsWith(href)) ? "admin-nav-active" : ""}`}
            >
              <Icon size={18} />
              {t(`admin.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/" target="_blank" className="admin-nav-link">
            {t("admin.viewSite")}
            <ArrowUpRight size={16} />
          </Link>
          <AdminPreferences />
          <div className="admin-account">
            <span className="admin-avatar">
              {(user.account ?? user.email).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{t("admin.administrator")}</strong>
              <small>{user.account ?? user.email}</small>
            </div>
            <button
              type="button"
              className="admin-icon-button"
              onClick={logout}
              disabled={loggingOut}
              aria-label={t("admin.logout")}
              title={t("admin.logout")}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main id="main-content" className="admin-main">
        {Boolean(error) && <AdminError error={error} />}
        {children}
      </main>
    </div>
  );
}
