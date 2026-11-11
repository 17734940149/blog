"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { useI18n } from "@/components/providers";
import type { SettingsEnglish, SiteSettings } from "@/lib/types";
import {
  adminRequest,
  useAdminResource,
  useUnsavedChanges,
} from "@/components/admin/api";
import { AdminError, AdminHeading, AdminLoading } from "@/components/admin/ui";
import { PasswordSettings } from "@/components/admin/password-settings";
import { HomeProfileFields } from "@/components/admin/profile-fields";
import { EnglishContentFields } from "@/components/admin/english-content-fields";
import { CapabilityFields } from "@/components/admin/capability-fields";

const englishSettingsFields: {
  name: keyof SettingsEnglish;
  labelKey: string;
  maxLength: number;
  rows?: number;
  markdown?: boolean;
}[] = [
  { name: "title", labelKey: "admin.siteTitle", maxLength: 80 },
  { name: "tagline", labelKey: "admin.tagline", maxLength: 160 },
  {
    name: "description",
    labelKey: "admin.siteDescription",
    maxLength: 500,
    rows: 3,
  },
  { name: "author", labelKey: "admin.author", maxLength: 80 },
  { name: "role", labelKey: "admin.homeCardRole", maxLength: 160 },
  { name: "bio", labelKey: "admin.bio", maxLength: 500, rows: 3 },
  { name: "currently", labelKey: "admin.currently", maxLength: 500, rows: 3 },
  { name: "skills", labelKey: "admin.homeCardSkills", maxLength: 1500, rows: 5 },
  { name: "purpose", labelKey: "admin.homeCardPurpose", maxLength: 1000, rows: 3 },
  {
    name: "about",
    labelKey: "admin.aboutContent",
    maxLength: 50000,
    markdown: true,
  },
];

// 站点资料按用途分组，空的联系方式会由前台自动隐藏。
export default function AdminSettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, loading, error, reload } = useAdminResource<SiteSettings>(
    "/api/admin/settings",
  );
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (data) {
      setForm(data);
      setBaseline(JSON.stringify(data));
    }
  }, [data]);
  useUnsavedChanges(
    Boolean(form && JSON.stringify(form) !== baseline),
    t("admin.unsavedChanges"),
  );
  // 修改资料后清除上一次保存提示，避免误以为新内容已经生效。
  function update(key: Exclude<keyof SiteSettings, "en">, value: string) {
    setForm((current) => (current ? { ...current, [key]: value } : null));
    setSaved(false);
  }
  // 英文资料留在独立子对象中，完整保存时保留未修改的中文资料与共用联系方式。
  function updateEnglish(key: keyof SettingsEnglish, value: string) {
    setForm((current) =>
      current ? { ...current, en: { ...current.en, [key]: value } } : null,
    );
    setSaved(false);
  }
  // 服务端保存后刷新公开页面的数据，使标题和个人介绍立即采用最新资料。
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await adminRequest<SiteSettings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setForm(result);
      setBaseline(JSON.stringify(result));
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setSaveError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AdminHeading
        title={t("admin.settings")}
        description={t("admin.settingsDescription")}
      />
      <p className="admin-hint">
        {t("admin.bilingualChinese")} · {t("admin.bilingualSourceHint")}
      </p>
      {loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError error={error} retry={reload} />
      ) : (
        form && (
          <form className="admin-settings-form" onSubmit={save}>
            {Boolean(saveError) && <AdminError error={saveError} />}
            {saved && (
              <div className="admin-notice admin-notice-success" role="status">
                <Check size={18} />
                {t("admin.settingsSaved")}
              </div>
            )}
            <section className="admin-settings-section">
              <div>
                <h2>{t("admin.siteIdentity")}</h2>
                <p>{t("admin.siteIdentityHint")}</p>
              </div>
              <div className="admin-panel admin-form-panel">
                <label className="admin-field">
                  <span>{t("admin.siteTitle")}</span>
                  <input
                    required
                    maxLength={80}
                    value={form.title}
                    onChange={(event) => update("title", event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="admin-field">
                  <span>{t("admin.tagline")}</span>
                  <input
                    maxLength={160}
                    value={form.tagline}
                    onChange={(event) => update("tagline", event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="admin-field">
                  <span>{t("admin.siteDescription")}</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={form.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                    disabled={busy}
                  />
                  <small>{t("admin.seoHint")}</small>
                </label>
              </div>
            </section>
            <HomeProfileFields values={form} onChange={update} disabled={busy} />
            <section className="admin-settings-section">
              <div>
                <h2>{t("admin.profile")}</h2>
                <p>{t("admin.profileHint")}</p>
              </div>
              <div className="admin-panel admin-form-panel">
                <label className="admin-field">
                  <span>{t("admin.author")}</span>
                  <input
                    required
                    maxLength={80}
                    value={form.author}
                    onChange={(event) => update("author", event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="admin-field">
                  <span>{t("admin.bio")}</span>
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={form.bio}
                    onChange={(event) => update("bio", event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="admin-field">
                  <span>{t("admin.publicEmail")}</span>
                  <input
                    type="email"
                    maxLength={254}
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="admin-field">
                  <span>{t("admin.githubProfile")}</span>
                  <input
                    type="url"
                    maxLength={2048}
                    placeholder={t("admin.githubPlaceholder")}
                    value={form.github}
                    onChange={(event) => update("github", event.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="admin-field">
                  <span>{t("admin.currently")}</span>
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={form.currently}
                    onChange={(event) =>
                      update("currently", event.target.value)
                    }
                    disabled={busy}
                  />
                </label>
              </div>
            </section>
            <section className="admin-settings-section">
              <div>
                <h2>{t("admin.aboutContent")}</h2>
                <p>{t("admin.aboutContentHint")}</p>
              </div>
              <div className="admin-panel admin-markdown-panel">
                <div className="admin-editor-tabs">
                  <span>{t("admin.markdown")}</span>
                  <div>
                    <button
                      type="button"
                      className={!preview ? "admin-tab-active" : ""}
                      onClick={() => setPreview(false)}
                    >
                      {t("admin.write")}
                    </button>
                    <button
                      type="button"
                      className={preview ? "admin-tab-active" : ""}
                      onClick={() => setPreview(true)}
                    >
                      {t("admin.preview")}
                    </button>
                  </div>
                </div>
                {preview ? (
                  <div className="admin-markdown-preview">
                    <Markdown content={form.about} />
                  </div>
                ) : (
                  <label className="admin-editor-label">
                    <span className="admin-sr-only">
                      {t("admin.aboutContent")}
                    </span>
                    <textarea
                      className="admin-markdown-input admin-about-input"
                      maxLength={50000}
                      value={form.about}
                      onChange={(event) => update("about", event.target.value)}
                      disabled={busy}
                    />
                  </label>
                )}
              </div>
            </section>
            <EnglishContentFields
              fields={englishSettingsFields.map((field) => ({
                ...field,
                value: form.en?.[field.name] || "",
                fallback: form[field.name],
                onChange: (value) => updateEnglish(field.name, value),
              }))}
              disabled={busy}
              // 能力有可排序的行结构，复用中文编辑器，其他英文字段沿用通用表单。
              renderField={(field) =>
                field.name === "skills" ? (
                  <CapabilityFields
                    value={field.value}
                    onChange={field.onChange}
                    disabled={busy}
                    lang="en"
                  />
                ) : undefined
              }
            />
            <div className="admin-settings-save">
              <span className="admin-hint">{t("admin.settingsSaveHint")}</span>
              <button className="admin-button" type="submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={17} className="admin-spin" />
                ) : (
                  <Save size={17} />
                )}
                {busy ? t("admin.saving") : t("admin.saveSettings")}
              </button>
            </div>
          </form>
        )
      )}
      <PasswordSettings
        hasUnsavedChanges={Boolean(form && JSON.stringify(form) !== baseline)}
      />
    </>
  );
}
