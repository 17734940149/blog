"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/providers";
import { adminRequest } from "./api";
import { AdminError } from "./ui";

// 密码修改独立于公开资料，成功后服务端撤销所有登录会话并要求重新认证。
export function PasswordSettings({
  hasUnsavedChanges = false,
}: {
  hasUnsavedChanges?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // 本地校验只记文案 key，保留表单状态时仍能随当前语言重新渲染提示。
  const [validationKey, setValidationKey] = useState("");
  // 二次输入只在浏览器校验，不将多余的确认密码传给服务端。
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setValidationKey("");
    if (busy) return;
    if (newPassword !== confirmPassword) {
      setValidationKey("admin.passwordMismatch");
      return;
    }
    if (newPassword === currentPassword) {
      setValidationKey("admin.passwordSame");
      return;
    }
    if (hasUnsavedChanges && !window.confirm(t("admin.unsavedChanges"))) return;
    setBusy(true);
    try {
      await adminRequest("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.replace("/admin/login?password=changed");
      router.refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-settings-section admin-password-section">
      <div>
        <ShieldCheck size={23} />
        <h2>{t("admin.accountSecurity")}</h2>
        <p>{t("admin.accountSecurityHint")}</p>
      </div>
      <form className="admin-panel admin-form-panel" onSubmit={changePassword}>
        {Boolean(error) && <AdminError error={error} />}
        {validationKey && (
          <div className="admin-notice admin-notice-error" role="alert">
            {t(validationKey)}
          </div>
        )}
        <label className="admin-field">
          <span>{t("admin.currentPassword")}</span>
          <input
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={busy}
          />
        </label>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{t("admin.newPassword")}</span>
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={busy}
            />
            <small>{t("admin.passwordHint")}</small>
          </label>
          <label className="admin-field">
            <span>{t("admin.confirmPassword")}</span>
            <input
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <button
          type="submit"
          className="admin-button admin-button-secondary"
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle size={16} className="admin-spin" />
          ) : (
            <KeyRound size={16} />
          )}
          {busy ? t("admin.processing") : t("admin.changePassword")}
        </button>
      </form>
    </section>
  );
}
