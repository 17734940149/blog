"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, LoaderCircle, Save } from "lucide-react";
import { useI18n } from "@/components/providers";
import type {
  Project,
  ProjectEnglish,
  ProjectInput,
  ProjectStatus,
} from "@/lib/types";
import { adminRequest, useUnsavedChanges } from "./api";
import { AdminError, AdminHeading, AdminLoading, CoverUpload } from "./ui";
import { reconcileEnglishItems } from "./bilingual-items";
import { EnglishContentFields } from "./english-content-fields";

const blankProject: ProjectInput = {
  title: "",
  description: "",
  url: "",
  githubUrl: "",
  stack: [],
  status: "building",
  cover: "",
  en: {},
};

const englishProjectFields = [
  { name: "title", labelKey: "admin.projectTitle", maxLength: 120 },
  {
    name: "description",
    labelKey: "admin.projectDescription",
    maxLength: 1000,
    rows: 5,
  },
] as const;

// 原技术栈的去重规则同时供保存和英文对照输入使用，避免两处显示不同的项序。
function splitStack(value: string) {
  return [
    ...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)),
  ];
}

// 创建与修改使用同一份项目输入规则，技术栈保持可读的逗号分隔输入。
export function ProjectEditor({ id }: { id?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<ProjectInput>(blankProject);
  const [stack, setStack] = useState("");
  const [baseline, setBaseline] = useState(
    JSON.stringify({ form: blankProject, stack: "" }),
  );
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // 状态保留文案 key 而非译文，避免语言切换后继续显示上一次语言的错误。
  const [validationKey, setValidationKey] = useState("");
  const [attempt, setAttempt] = useState(0);
  useUnsavedChanges(
    uploading || JSON.stringify({ form, stack }) !== baseline,
    t("admin.unsavedChanges"),
  );
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    adminRequest<Project>(`/api/admin/projects/${id}`, {
      signal: controller.signal,
    })
      .then((project) => {
        if (controller.signal.aborted) return;
        const value: ProjectInput = {
          title: project.title,
          description: project.description,
          url: project.url,
          githubUrl: project.githubUrl,
          stack: project.stack,
          status: project.status,
          cover: project.cover,
          en: project.en || {},
        };
        const stackText = project.stack.join(", ");
        setForm(value);
        setStack(stackText);
        setBaseline(JSON.stringify({ form: value, stack: stackText }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, attempt]);
  // 修改后立即隐藏旧的保存提示，让状态与当前表单一致。
  function update<K extends keyof ProjectInput>(
    key: K,
    value: ProjectInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }
  // 只更新英文子对象，保持中文源稿与共用的链接、封面、状态不受界面语言影响。
  function updateEnglish<K extends keyof ProjectEnglish>(
    key: K,
    value: ProjectEnglish[K],
  ) {
    setForm((current) => ({ ...current, en: { ...current.en, [key]: value } }));
    setSaved(false);
  }
  // 技术栈用原中文项匹配英文，避免插入、删除或重排后沿用错误位置的英文名称。
  function updateStack(value: string) {
    const previousItems = splitStack(stack);
    const nextItems = splitStack(value);
    setStack(value);
    if (JSON.stringify(previousItems) !== JSON.stringify(nextItems)) {
      setForm((current) => ({
        ...current,
        en: {
          ...current.en,
          stack: reconcileEnglishItems(
            previousItems,
            nextItems,
            current.en?.stack || [],
          ),
        },
      }));
    }
    setSaved(false);
  }
  // 使用完整对象保存，避免技术栈、封面和项目状态在编辑时意外丢失。
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setValidationKey("");
    if (busy || uploading) return;
    const tags = splitStack(stack);
    if (tags.length > 16 || tags.some((tag) => tag.length > 40)) {
      setValidationKey("admin.stackLimit");
      return;
    }
    setBusy(true);
    const payload = { ...form, title: form.title.trim(), stack: tags };
    try {
      const project = await adminRequest<Project>(
        id ? `/api/admin/projects/${id}` : "/api/admin/projects",
        { method: id ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      const nextForm: ProjectInput = {
        ...payload,
        en: project.en || payload.en || {},
      };
      setForm(nextForm);
      setBaseline(JSON.stringify({ form: nextForm, stack }));
      setSaved(true);
      if (!id) router.replace(`/admin/projects/${project.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <AdminLoading />;
  if (id && error && !form.title)
    return (
      <AdminError
        error={error}
        retry={() => setAttempt((value) => value + 1)}
      />
    );
  return (
    <>
      <Link href="/admin/projects" className="admin-back-link">
        <ArrowLeft size={15} />
        {t("admin.backToProjects")}
      </Link>
      <AdminHeading
        title={id ? t("admin.editProject") : t("admin.newProject")}
        description={t("admin.projectEditorDescription")}
      />
      <p className="admin-hint">
        {t("admin.bilingualChinese")} · {t("admin.bilingualSourceHint")}
      </p>
      {Boolean(error) && <AdminError error={error} />}
      {validationKey && (
        <div className="admin-notice admin-notice-error" role="alert">
          {t(validationKey)}
        </div>
      )}
      {saved && (
        <div className="admin-notice admin-notice-success" role="status">
          <Check size={18} />
          {t("admin.projectSaved")}
        </div>
      )}
      <form className="admin-editor-layout" onSubmit={save}>
        <div className="admin-editor-main">
          <section className="admin-panel admin-form-panel admin-project-form">
            <label className="admin-field">
              <span>{t("admin.projectTitle")}</span>
              <input
                required
                maxLength={120}
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="admin-field">
              <span>{t("admin.projectDescription")}</span>
              <textarea
                rows={5}
                maxLength={1000}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="admin-field">
              <span>{t("admin.projectUrl")}</span>
              <input
                type="url"
                maxLength={2048}
                placeholder={t("admin.urlPlaceholder")}
                value={form.url}
                onChange={(event) => update("url", event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="admin-field">
              <span>{t("admin.githubUrl")}</span>
              <input
                type="url"
                maxLength={2048}
                placeholder={t("admin.githubPlaceholder")}
                value={form.githubUrl}
                onChange={(event) => update("githubUrl", event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="admin-field">
              <span>{t("admin.stack")}</span>
              <input
                value={stack}
                placeholder={t("admin.stackPlaceholder")}
                onChange={(event) => updateStack(event.target.value)}
                disabled={busy}
              />
              <small>{t("admin.stackHint")}</small>
            </label>
          </section>
          <EnglishContentFields
            fields={englishProjectFields.map((field) => ({
              ...field,
              value: form.en?.[field.name] || "",
              onChange: (value) => updateEnglish(field.name, value),
            }))}
            arrayField={{
              labelKey: "admin.stack",
              sourceItems: splitStack(stack),
              values: form.en?.stack || [],
              maxLength: 40,
              onChange: (values) => updateEnglish("stack", values),
            }}
            disabled={busy}
          />
        </div>
        <aside className="admin-editor-side">
          <section className="admin-panel admin-form-panel">
            <h2>{t("admin.projectSettings")}</h2>
            <label className="admin-field">
              <span>{t("admin.projectStatus")}</span>
              <select
                value={form.status}
                onChange={(event) =>
                  update("status", event.target.value as ProjectStatus)
                }
                disabled={busy}
              >
                <option value="building">{t("admin.building")}</option>
                <option value="online">{t("admin.online")}</option>
                <option value="archived">{t("admin.archived")}</option>
              </select>
              <small>{t("admin.projectStatusHint")}</small>
            </label>
            <button
              className="admin-button"
              type="submit"
              disabled={busy || uploading}
            >
              {busy ? (
                <LoaderCircle size={16} className="admin-spin" />
              ) : (
                <Save size={16} />
              )}
              {busy ? t("admin.saving") : t("admin.saveProject")}
            </button>
          </section>
          <section className="admin-panel admin-form-panel">
            <h2>{t("admin.cover")}</h2>
            <CoverUpload
              value={form.cover}
              onChange={(url) => update("cover", url)}
              onError={setError}
              onBusyChange={setUploading}
              disabled={busy}
            />
          </section>
        </aside>
      </form>
    </>
  );
}
