"use client";

import { useState } from "react";
import { ChevronDown, Eye, FileText } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { useI18n } from "@/components/providers";

type EnglishField = {
  name: string;
  labelKey: string;
  value: string;
  maxLength: number;
  rows?: number;
  markdown?: boolean;
  fallback?: string;
  onChange: (value: string) => void;
};

type EnglishArrayField = {
  labelKey: string;
  sourceItems: string[];
  values: string[];
  maxLength: number;
  onChange: (values: string[]) => void;
};

// 英文字段与中文源稿分开维护，预览复用既有 Markdown 渲染以保持安全规则一致。
function EnglishTextField({
  field,
  disabled,
}: {
  field: EnglishField;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(false);
  if (field.markdown) {
    const content = field.value.trim() ? field.value : field.fallback || "";
    return (
      <section className="admin-panel admin-markdown-panel">
        <div className="admin-editor-tabs">
          <span>{t(field.labelKey)}</span>
          <div role="group" aria-label={t("admin.bilingualEnglishPreview")}>
            <button
              type="button"
              aria-pressed={!preview}
              className={!preview ? "admin-tab-active" : ""}
              onClick={() => setPreview(false)}
            >
              <FileText size={15} />
              {t("admin.write")}
            </button>
            <button
              type="button"
              aria-pressed={preview}
              className={preview ? "admin-tab-active" : ""}
              onClick={() => setPreview(true)}
            >
              <Eye size={15} />
              {t("admin.preview")}
            </button>
          </div>
        </div>
        {preview ? (
          <div className="admin-markdown-preview">
            {content ? (
              <Markdown content={content} />
            ) : (
              <p className="admin-hint">{t("admin.previewEmpty")}</p>
            )}
          </div>
        ) : (
          <label className="admin-editor-label">
            <span className="admin-sr-only">
              {t(field.labelKey)} · {t("admin.bilingualEnglish")}
            </span>
            <textarea
              lang="en"
              className="admin-markdown-input"
              value={field.value}
              maxLength={field.maxLength}
              onChange={(event) => field.onChange(event.target.value)}
              disabled={disabled}
              spellCheck={false}
            />
          </label>
        )}
      </section>
    );
  }
  return (
    <label className="admin-field">
      <span>{t(field.labelKey)}</span>
      {field.rows ? (
        <textarea
          lang="en"
          rows={field.rows}
          maxLength={field.maxLength}
          value={field.value}
          onChange={(event) => field.onChange(event.target.value)}
          disabled={disabled}
        />
      ) : (
        <input
          lang="en"
          maxLength={field.maxLength}
          value={field.value}
          onChange={(event) => field.onChange(event.target.value)}
          disabled={disabled}
        />
      )}
    </label>
  );
}

// 为每个中文标签保留一个英文输入槽，空槽不会被过滤，避免后续翻译与原项错位。
function EnglishArrayFields({
  field,
  disabled,
}: {
  field: EnglishArrayField;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const count = Math.max(field.sourceItems.length, field.values.length);
  // 补齐前置空槽再更新目标位置，允许只填写后面的标签而保留前项的中文回退。
  function updateItem(index: number, value: string) {
    const next = Array.from(
      { length: Math.max(field.values.length, index + 1) },
      (_, itemIndex) => field.values[itemIndex] || "",
    );
    next[index] = value;
    field.onChange(next);
  }
  return (
    <div className="admin-form-panel">
      <h3>{t(field.labelKey)}</h3>
      <p className="admin-hint">{t("admin.bilingualArrayHint")}</p>
      {Array.from({ length: count }, (_, index) => (
        <label className="admin-field" key={index}>
          <span>
            {index + 1}. {field.sourceItems[index] || t(field.labelKey)}
          </span>
          <input
            lang="en"
            maxLength={field.maxLength}
            value={field.values[index] || ""}
            onChange={(event) => updateItem(index, event.target.value)}
            disabled={disabled}
          />
        </label>
      ))}
    </div>
  );
}

// 三种内容表单共享默认收起的英文区，既能手动维护译文，也不会挤占中文编辑空间。
export function EnglishContentFields({
  fields,
  arrayField,
  disabled,
}: {
  fields: EnglishField[];
  arrayField?: EnglishArrayField;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <details className="admin-panel admin-bilingual-fields">
      <summary className="admin-panel-heading admin-bilingual-summary">
        <span>{t("admin.bilingualEnglish")}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      <div className="admin-form-panel">
        <p className="admin-hint">{t("admin.bilingualHint")}</p>
        {fields.map((field) => (
          <EnglishTextField key={field.name} field={field} disabled={disabled} />
        ))}
        {arrayField && (
          <EnglishArrayFields field={arrayField} disabled={disabled} />
        )}
      </div>
    </details>
  );
}
