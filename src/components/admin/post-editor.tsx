"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  FileText,
  LoaderCircle,
  Send,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { useI18n } from "@/components/providers";
import type { Post, PostEnglish, PostInput, PostStatus } from "@/lib/types";
import { adminRequest, useUnsavedChanges } from "./api";
import { reconcileEnglishItems } from "./bilingual-items";
import { EnglishContentFields } from "./english-content-fields";
import {
  AdminError,
  AdminHeading,
  AdminLoading,
  ConfirmDialog,
  CoverUpload,
} from "./ui";

const blankPost: PostInput = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover: "",
  category: "",
  tags: [],
  status: "draft",
  featured: false,
  publishedAt: null,
  en: {},
};

const englishPostFields = [
  { name: "title", labelKey: "admin.postTitle", maxLength: 160 },
  { name: "excerpt", labelKey: "admin.excerpt", maxLength: 500, rows: 3 },
  { name: "category", labelKey: "admin.category", maxLength: 60 },
  {
    name: "content",
    labelKey: "admin.content",
    maxLength: 200000,
    markdown: true,
  },
] as const;

// 标签输入允许中文逗号，保存时统一去重，避免多种分隔符产生重复标签。
function splitTags(value: string) {
  return [
    ...new Set(
      value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

// 创建和编辑共用同一套表单，预览也复用前台 Markdown 的安全渲染规则。
export function PostEditor({ id }: { id?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<PostInput>(blankPost);
  const [tags, setTags] = useState("");
  const [baseline, setBaseline] = useState(
    JSON.stringify({ form: blankPost, tags: "" }),
  );
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState<PostStatus | null>(null);
  const [saved, setSaved] = useState(false);
  // 仅保存稳定文案 key，让已有校验提示在切换语言后立即采用当前语言。
  const [validationKey, setValidationKey] = useState("");
  const [attempt, setAttempt] = useState(0);
  const dirty = JSON.stringify({ form, tags }) !== baseline;
  const formRef = useRef<HTMLFormElement>(null);
  useUnsavedChanges(dirty || uploading, t("admin.unsavedChanges"));
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    adminRequest<Post>(`/api/admin/posts/${id}`, { signal: controller.signal })
      .then((post) => {
        if (controller.signal.aborted) return;
        const value: PostInput = {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          cover: post.cover,
          category: post.category,
          tags: post.tags,
          status: post.status,
          featured: post.featured,
          publishedAt: post.publishedAt,
          en: post.en || {},
        };
        const tagText = post.tags.join(", ");
        setForm(value);
        setTags(tagText);
        setBaseline(JSON.stringify({ form: value, tags: tagText }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, attempt]);
  // 所有输入更新统一清除上次成功提示，避免旧提示误导作者已保存新内容。
  function update<K extends keyof PostInput>(key: K, value: PostInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }
  // 英文内容独立合并到同一草稿对象，界面语言刷新不会替换任何正在编辑的原文。
  function updateEnglish<K extends keyof PostEnglish>(
    key: K,
    value: PostEnglish[K],
  ) {
    setForm((current) => ({ ...current, en: { ...current.en, [key]: value } }));
    setSaved(false);
  }
  // 按中文标签关联原译文，删除或重排时同步移动英文，改名与新增项使用中文回退。
  function updateTags(value: string) {
    const previousItems = splitTags(tags);
    const nextItems = splitTags(value);
    setTags(value);
    if (JSON.stringify(previousItems) !== JSON.stringify(nextItems)) {
      setForm((current) => ({
        ...current,
        en: {
          ...current.en,
          tags: reconcileEnglishItems(
            previousItems,
            nextItems,
            current.en?.tags || [],
          ),
        },
      }));
    }
    setSaved(false);
  }
  // 原生表单先验证必填项，发布时额外检查正文，随后再请作者确认公开范围。
  function prepareSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationKey("");
    setError(null);
    if (busy || uploading) return;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status: PostStatus =
      submitter?.value === "published" ? "published" : "draft";
    if (status === "published" && !form.content.trim()) {
      setValidationKey("admin.contentRequired");
      return;
    }
    if (
      splitTags(tags).length > 12 ||
      splitTags(tags).some((tag) => tag.length > 30)
    ) {
      setValidationKey("admin.tagsLimit");
      return;
    }
    setPending(status);
  }
  // 保留首次发布时间，成功写入后重置脏状态；服务端失败不会丢掉正在编辑的内容。
  async function save() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const payload: PostInput = {
      ...form,
      title: form.title.trim(),
      slug: form.slug.trim(),
      category: form.category.trim(),
      tags: splitTags(tags),
      status: pending,
    };
    try {
      const post = await adminRequest<Post>(
        id ? `/api/admin/posts/${id}` : "/api/admin/posts",
        { method: id ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      const nextForm: PostInput = {
        ...payload,
        en: post.en || payload.en || {},
        publishedAt: post.publishedAt,
      };
      setForm(nextForm);
      setBaseline(JSON.stringify({ form: nextForm, tags }));
      setSaved(true);
      if (!id) router.replace(`/admin/posts/${post.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
      setPending(null);
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
      <Link href="/admin/posts" className="admin-back-link">
        <ArrowLeft size={15} />
        {t("admin.backToPosts")}
      </Link>
      <AdminHeading
        title={id ? t("admin.editPost") : t("admin.newPost")}
        description={t("admin.editorDescription")}
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
          {t("admin.postSaved")}
          {form.status === "published" && (
            <Link
              target="_blank"
              href={`/blog/${form.slug}`}
              className="admin-text-link"
            >
              {t("admin.viewPost")}
            </Link>
          )}
        </div>
      )}
      <form
        ref={formRef}
        className="admin-editor-layout"
        onSubmit={prepareSave}
      >
        <div className="admin-editor-main">
          <section className="admin-panel admin-form-panel">
            <label className="admin-field admin-title-field">
              <span>{t("admin.postTitle")}</span>
              <input
                required
                maxLength={160}
                value={form.title}
                placeholder={t("admin.titlePlaceholder")}
                onChange={(event) => update("title", event.target.value)}
                disabled={busy}
              />
            </label>
            <label className="admin-field">
              <span>{t("admin.slug")}</span>
              <div className="admin-slug-input">
                <span>/blog/</span>
                <input
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={180}
                  value={form.slug}
                  placeholder={t("admin.slugPlaceholder")}
                  onChange={(event) => update("slug", event.target.value)}
                  disabled={busy}
                />
              </div>
              <small>{t("admin.slugHint")}</small>
            </label>
            <label className="admin-field">
              <span>{t("admin.excerpt")}</span>
              <textarea
                maxLength={500}
                rows={3}
                value={form.excerpt}
                onChange={(event) => update("excerpt", event.target.value)}
                placeholder={t("admin.excerptPlaceholder")}
                disabled={busy}
              />
              <small>{form.excerpt.length}/500</small>
            </label>
          </section>
          <section className="admin-panel admin-markdown-panel">
            <div className="admin-editor-tabs">
              <span>{t("admin.content")}</span>
              <div role="tablist" aria-label={t("admin.editorMode")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!preview}
                  className={!preview ? "admin-tab-active" : ""}
                  onClick={() => setPreview(false)}
                >
                  <FileText size={15} />
                  {t("admin.write")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={preview}
                  className={preview ? "admin-tab-active" : ""}
                  onClick={() => setPreview(true)}
                >
                  <Eye size={15} />
                  {t("admin.preview")}
                </button>
              </div>
            </div>
            {preview ? (
              <div className="admin-markdown-preview" role="tabpanel">
                {form.content ? (
                  <Markdown content={form.content} />
                ) : (
                  <p className="admin-hint">{t("admin.previewEmpty")}</p>
                )}
              </div>
            ) : (
              <label className="admin-editor-label" role="tabpanel">
                <span className="admin-sr-only">{t("admin.content")}</span>
                <textarea
                  className="admin-markdown-input"
                  value={form.content}
                  onChange={(event) => update("content", event.target.value)}
                  placeholder={t("admin.markdownPlaceholder")}
                  maxLength={200000}
                  disabled={busy}
                  spellCheck={false}
                />
              </label>
            )}
            <div className="admin-editor-foot">
              <span>{t("admin.markdownHint")}</span>
              <span>
                {form.content.length} {t("admin.characters")}
              </span>
            </div>
          </section>
          <EnglishContentFields
            fields={englishPostFields.map((field) => ({
              ...field,
              value: form.en?.[field.name] || "",
              fallback: form[field.name],
              onChange: (value) => updateEnglish(field.name, value),
            }))}
            arrayField={{
              labelKey: "admin.tags",
              sourceItems: splitTags(tags),
              values: form.en?.tags || [],
              maxLength: 30,
              onChange: (values) => updateEnglish("tags", values),
            }}
            disabled={busy}
          />
        </div>
        <aside className="admin-editor-side">
          <section className="admin-panel admin-form-panel">
            <div className="admin-form-section-title">
              <h2>{t("admin.publishSettings")}</h2>
              <span className={`admin-badge admin-badge-${form.status}`}>
                {t(`admin.${form.status}`)}
              </span>
            </div>
            <label className="admin-field">
              <span>{t("admin.category")}</span>
              <input
                required
                maxLength={60}
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                placeholder={t("admin.categoryPlaceholder")}
                disabled={busy}
              />
            </label>
            <label className="admin-field">
              <span>{t("admin.tags")}</span>
              <input
                value={tags}
                onChange={(event) => updateTags(event.target.value)}
                placeholder={t("admin.tagsPlaceholder")}
                disabled={busy}
              />
              <small>{t("admin.tagsHint")}</small>
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => update("featured", event.target.checked)}
                disabled={busy}
              />
              <span>
                {t("admin.featured")}
                <small>{t("admin.featuredHint")}</small>
              </span>
            </label>
            <div className="admin-publish-actions">
              <button
                type="submit"
                name="intent"
                value="draft"
                className="admin-button admin-button-secondary"
                disabled={busy || uploading}
              >
                {t(
                  form.status === "published"
                    ? "admin.saveAsDraft"
                    : "admin.saveDraft",
                )}
              </button>
              <button
                type="submit"
                name="intent"
                value="published"
                className="admin-button"
                disabled={busy || uploading}
              >
                {busy ? (
                  <LoaderCircle className="admin-spin" size={16} />
                ) : (
                  <Send size={16} />
                )}
                {t(
                  form.status === "published"
                    ? "admin.savePublished"
                    : "admin.publish",
                )}
              </button>
            </div>
            <p className="admin-hint">
              {dirty || !id ? t("admin.unsavedLabel") : t("admin.savedLabel")}
            </p>
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
      {pending && (
        <ConfirmDialog
          title={
            pending === "published"
              ? form.status === "published"
                ? t("admin.savePublishedTitle")
                : t("admin.publishTitle")
              : t("admin.saveDraftTitle")
          }
          description={
            pending === "published"
              ? t("admin.publishDescription")
              : form.status === "published"
                ? t("admin.unpublishDescription")
                : t("admin.saveDraftDescription")
          }
          confirm={
            pending === "published"
              ? t("admin.confirmPublish")
              : t("admin.saveDraft")
          }
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={save}
        />
      )}
    </>
  );
}
