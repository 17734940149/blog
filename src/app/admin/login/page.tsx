"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useI18n } from "@/components/providers";
import { adminRequest } from "@/components/admin/api";
import { AdminError, AdminPreferences } from "@/components/admin/ui";

const ADMIN_ACCOUNT = "guyueadmin";

// 登录页不提供公开注册，初始管理员由部署者在服务器安全创建。
export default function AdminLoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const passwordAction = t(passwordVisible ? "admin.hidePassword" : "admin.showPassword");
  useEffect(() => {
    setPasswordChanged(
      new URLSearchParams(window.location.search).get("password") === "changed",
    );
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    adminRequest("/api/auth/me", { signal: controller.signal })
      .then(() => {
        if (!controller.signal.aborted) router.replace("/admin");
      })
      .catch(() => {});
    return () => controller.abort();
  }, [router]);
  // 等待服务端写入安全会话 Cookie 后进入后台，错误保留在当前表单。
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ account: ADMIN_ACCOUNT, password }),
      });
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className="admin-login">
      <div className="admin-login-art" aria-hidden="true">
        <div className="admin-login-grid" />
        <div className="admin-login-orbit">
          <BrandLogo className="admin-login-logo" />
        </div>
        <p>GY</p>
        <span>{t("admin.loginArtNote")}</span>
      </div>
      <div className="admin-login-panel">
        <div className="admin-login-preferences">
          <AdminPreferences />
        </div>
        <Link href="/" className="admin-back-link">
          <ArrowLeft size={15} />
          {t("admin.backToSite")}
        </Link>
        <div className="admin-login-form-wrap">
          <span className="admin-login-emblem">
            <ShieldCheck size={24} />
          </span>
          <h1>{t("admin.loginTitle")}</h1>
          <p className="admin-login-intro">{t("admin.loginDescription")}</p>
          {passwordChanged && (
            <div className="admin-notice admin-notice-success" role="status">
              {t("admin.passwordChanged")}
            </div>
          )}
          {Boolean(error) && <AdminError error={error} />}
          <form onSubmit={login} className="admin-form">
            <label className="admin-field">
              <span>{t("admin.account")}</span>
              <input
                type="text"
                name="account"
                autoComplete="username"
                value={ADMIN_ACCOUNT}
                readOnly
              />
            </label>
            <div className="admin-field">
              <span>
                <label htmlFor="admin-login-password">{t("admin.password")}</label>
              </span>
              <div className="admin-login-password">
                <input
                  id="admin-login-password"
                  type={passwordVisible ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="admin-icon-button"
                  aria-label={passwordAction}
                  title={passwordAction}
                  aria-controls="admin-login-password"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  disabled={busy}
                >
                  {passwordVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="admin-button admin-login-submit"
              disabled={busy}
            >
              {busy ? <LoaderCircle size={17} className="admin-spin" /> : null}
              {busy ? t("admin.loggingIn") : t("admin.login")}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="admin-login-help">
            <h2>{t("admin.firstVisit")}</h2>
            <p>
              {t("admin.setupHint")} <code>python -m app.cli setup</code>
            </p>
            <p>
              {t("admin.passwordResetHint")}{" "}
              <code>python -m app.cli setup --reset-password</code>
            </p>
          </div>
        </div>
        <footer>{t("admin.loginFooter")}</footer>
      </div>
    </main>
  );
}
