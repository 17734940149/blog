"use client";

import Link from "next/link";
import { useLocaleSwitch } from "@/components/use-locale-switch";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  FileText,
  Languages,
  LoaderCircle,
  Moon,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { useI18n } from "@/components/providers";
import { AdminApiError, adminErrorMessage, adminRequest } from "./api";

// 同一标题结构用于各管理模块，保证操作入口在窄屏也保持一致。
export function AdminHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="admin-heading-actions">{action}</div>}
    </header>
  );
}

// 加载过程明确告知状态，避免空白页被误认为没有内容。
export function AdminLoading() {
  const { t } = useI18n();
  return (
    <div className="admin-state" role="status">
      <LoaderCircle className="admin-spin" size={25} />
      <p>{t("admin.loading")}</p>
    </div>
  );
}

// 失败状态附带重试入口，让临时网络故障无需刷新整个后台。
export function AdminError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="admin-notice admin-notice-error" role="alert">
      <AlertCircle size={19} />
      <div>
        <p>{adminErrorMessage(error, t)}</p>
        {error instanceof AdminApiError &&
        error.status === 401 &&
        error.code !== "INVALID_CREDENTIALS" ? (
          <Link href="/admin/login" className="admin-text-link">
            {t("admin.loginAgain")}
          </Link>
        ) : (
          retry && (
            <button className="admin-text-button" type="button" onClick={retry}>
              {t("admin.retry")}
            </button>
          )
        )}
      </div>
    </div>
  );
}

// 空列表提供下一步操作，区分“尚未创建”和“请求失败”。
export function AdminEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-state admin-empty">
      <FileText size={30} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

// 使用浏览器原生对话框管理焦点与键盘关闭，减少确认操作的无障碍隐患。
export function ConfirmDialog({
  title,
  description,
  confirm,
  busy,
  dangerous,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirm: string;
  busy?: boolean;
  dangerous?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <button
        className="admin-dialog-close admin-icon-button"
        type="button"
        onClick={onCancel}
        disabled={busy}
        aria-label={t("admin.cancel")}
      >
        <X size={19} />
      </button>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="admin-dialog-actions">
        <button
          autoFocus
          className="admin-button admin-button-secondary"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          {t("admin.cancel")}
        </button>
        <button
          className={`admin-button ${dangerous ? "admin-button-danger" : ""}`}
          type="button"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && <LoaderCircle size={16} className="admin-spin" />}
          {busy ? t("admin.processing") : confirm}
        </button>
      </div>
    </dialog>
  );
}

// 封面上传复用相同校验和反馈，文章与项目无需各自实现文件请求。
export function CoverUpload({
  value,
  onChange,
  onError,
  onBusyChange,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (error: unknown) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  // 上传期间禁用文件输入，防止重复上传覆盖最后一次选择。
  async function uploadFile(file: File, input: HTMLInputElement) {
    if (uploadRef.current) return;
    if (file.size > 5 * 1024 * 1024) {
      onError(new AdminApiError("", "UPLOAD_TOO_LARGE", 413));
      input.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onError(new AdminApiError("", "INVALID_IMAGE", 400));
      input.value = "";
      return;
    }
    uploadRef.current = true;
    setUploading(true);
    onBusyChange?.(true);
    const form = new FormData();
    form.set("file", file);
    try {
      const result = await adminRequest<{ url: string }>("/api/admin/uploads", {
        method: "POST",
        body: form,
      });
      onChange(result.url);
    } catch (error) {
      onError(error);
    } finally {
      input.value = "";
      setUploading(false);
      onBusyChange?.(false);
      uploadRef.current = false;
    }
  }
  return (
    <div className="admin-cover-upload">
      {value ? (
        <div className="admin-cover-preview">
          <img src={value} alt={t("admin.coverPreview")} />
          <button
            className="admin-icon-button"
            type="button"
            disabled={disabled || uploading}
            onClick={() => onChange("")}
            aria-label={t("admin.removeCover")}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="admin-cover-placeholder">
          <Upload size={23} />
          <span>{t("admin.noCover")}</span>
        </div>
      )}
      <label className="admin-button admin-button-secondary admin-upload-label">
        {uploading ? (
          <LoaderCircle size={16} className="admin-spin" />
        ) : (
          <Upload size={16} />
        )}
        {uploading ? t("admin.uploading") : t("admin.uploadCover")}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || uploading}
          aria-label={t("admin.uploadCover")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file, event.target);
          }}
        />
      </label>
      <p className="admin-hint">{t("admin.uploadHint")}</p>
    </div>
  );
}

// 后台保留与前台一致的语言及主题切换，偏好只保存在本站浏览器。
export function AdminPreferences() {
  const { locale, t } = useI18n();
  const { switchLocale, pending } = useLocaleSwitch();
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);
  // 切换仅更新显示偏好，不影响管理员会话与编辑内容。
  function toggleTheme() {
    const next = !light;
    document.documentElement.dataset.theme = next ? "light" : "dark";
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {
      /* 隐私设置禁止持久化时仍保留本次切换。 */
    }
    setLight(next);
  }
  return (
    <div className="admin-preferences">
      <button
        className="admin-icon-button"
        type="button"
        onClick={switchLocale}
        disabled={pending}
        aria-busy={pending}
        aria-label={t(
          pending
            ? "common.switchingLanguage"
            : locale === "zh"
              ? "common.switchToEnglish"
              : "common.switchToChinese",
        )}
        title={t(
          pending
            ? "common.switchingLanguage"
            : locale === "zh"
              ? "common.switchToEnglish"
              : "common.switchToChinese",
        )}
      >
        <Languages size={16} />
      </button>
      <button
        className="admin-icon-button"
        type="button"
        onClick={toggleTheme}
        aria-label={t("admin.switchTheme")}
        title={t("admin.switchTheme")}
      >
        {light ? <Moon size={17} /> : <Sun size={17} />}
      </button>
    </div>
  );
}
