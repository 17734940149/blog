"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CapabilityIcon } from "@/components/capability-icon";
import { useI18n } from "@/components/providers";
import {
  capabilityIconNames,
  parseCapabilities,
  serializeCapabilities,
  type CapabilityGroup,
  type CapabilityIconName,
} from "@/lib/profile";

type CapabilityDraft = CapabilityGroup & { id: number };
const maxLength = 1500;

// 草稿使用独立标识，删除或换序时保留输入框身份，避免光标跳到另一项。
function createDrafts(value: string): CapabilityDraft[] {
  return parseCapabilities(value).map((group, id) => ({ ...group, id }));
}

// 中英文共用行编辑器，但继续提交原字符串，避免为资料增加第二套保存流程。
export function CapabilityFields({
  value,
  onChange,
  disabled,
  lang,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  lang?: string;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const hintId = useId();
  const titleHintId = useId();
  const [drafts, setDrafts] = useState(() => createDrafts(value));
  const [limitReached, setLimitReached] = useState(false);
  const lastValueRef = useRef(value);
  const nextIdRef = useRef(drafts.length);
  const length = serializeCapabilities(drafts).length;

  useEffect(() => {
    // 只解析外部加载的数据；自身回传的字符串会丢失空白草稿，不能用它重建输入。
    if (value === lastValueRef.current) return;
    const nextDrafts = createDrafts(value);
    lastValueRef.current = value;
    nextIdRef.current = nextDrafts.length;
    setDrafts(nextDrafts);
    setLimitReached(false);
  }, [value]);

  // 总长度按实际保存格式计算，把图标前缀和换行也纳入限制，避免保存时才被接口拒绝。
  function updateDrafts(nextDrafts: CapabilityDraft[]) {
    const nextValue = serializeCapabilities(nextDrafts);
    if (nextValue.length > maxLength) {
      setLimitReached(true);
      return;
    }
    setDrafts(nextDrafts);
    setLimitReached(false);
    lastValueRef.current = nextValue;
    onChange(nextValue);
  }

  // 局部更新保留原始输入，名称和内容中的临时空白不会因为序列化而打断编辑。
  function updateDraft(id: number, patch: Partial<CapabilityGroup>) {
    updateDrafts(
      drafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  // 新行先保留在本地，即使名称尚未填写，也不会被公开展示的解析规则过滤掉。
  function addDraft() {
    updateDrafts([
      ...drafts,
      { id: nextIdRef.current++, icon: "lightbulb", title: "", description: "" },
    ]);
  }

  // 删除直接同步到父表单，让原有未保存提醒与统一保存按钮继续生效。
  function removeDraft(id: number) {
    updateDrafts(drafts.filter((draft) => draft.id !== id));
  }

  // 提供明确的换序按钮，使鼠标、触屏和键盘都能调整首页展示顺序。
  function moveDraft(index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= drafts.length) return;
    const nextDrafts = [...drafts];
    [nextDrafts[index], nextDrafts[targetIndex]] = [
      nextDrafts[targetIndex],
      nextDrafts[index],
    ];
    updateDrafts(nextDrafts);
  }

  return (
    <div className="admin-capability-fields" aria-labelledby={headingId}>
      <div className="admin-capability-heading">
        <span id={headingId}>{t("admin.homeCardSkills")}</span>
        <button
          type="button"
          className="admin-button admin-button-secondary"
          onClick={addDraft}
          disabled={disabled}
        >
          <Plus size={15} aria-hidden="true" />
          {t("admin.capabilityRows.add")}
        </button>
      </div>
      {drafts.length ? (
        <div className="admin-capability-list">
          {drafts.map((draft, index) => (
            <fieldset className="admin-capability-row" key={draft.id}>
              <legend className="admin-sr-only">
                {t("admin.homeCardSkills")} {index + 1}
              </legend>
              <div className="admin-capability-row-main">
                <label className="admin-field admin-capability-icon-field">
                  <span>
                    <CapabilityIcon name={draft.icon} size={14} />
                    {t("admin.capabilityRows.icon")}
                  </span>
                  <select
                    value={draft.icon}
                    onChange={(event) =>
                      updateDraft(draft.id, {
                        icon: event.target.value as CapabilityIconName,
                      })
                    }
                    disabled={disabled}
                  >
                    {capabilityIconNames.map((name) => (
                      <option value={name} key={name}>
                        {t(`admin.capabilityRows.icons.${name}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field admin-capability-title-field">
                  <span>{t("admin.capabilityRows.title")}</span>
                  <input
                    required
                    lang={lang}
                    maxLength={maxLength}
                    pattern={"(?=.*\\S)[^:：]*"}
                    value={draft.title}
                    onChange={(event) =>
                      updateDraft(draft.id, { title: event.target.value })
                    }
                    aria-describedby={`${titleHintId} ${hintId}`}
                    disabled={disabled}
                  />
                </label>
                <div className="admin-capability-actions">
                  <button
                    type="button"
                    className="admin-icon-button"
                    title={t("admin.capabilityRows.moveUp")}
                    aria-label={`${t("admin.capabilityRows.moveUp")} ${index + 1}`}
                    onClick={() => moveDraft(index, -1)}
                    disabled={disabled || index === 0}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button"
                    title={t("admin.capabilityRows.moveDown")}
                    aria-label={`${t("admin.capabilityRows.moveDown")} ${index + 1}`}
                    onClick={() => moveDraft(index, 1)}
                    disabled={disabled || index === drafts.length - 1}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button admin-danger-text"
                    title={t("admin.capabilityRows.remove")}
                    aria-label={`${t("admin.capabilityRows.remove")} ${index + 1}`}
                    onClick={() => removeDraft(draft.id)}
                    disabled={disabled}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <label className="admin-field">
                <span>{t("admin.capabilityRows.description")}</span>
                <input
                  lang={lang}
                  maxLength={maxLength}
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft(draft.id, { description: event.target.value })
                  }
                  aria-describedby={hintId}
                  disabled={disabled}
                />
              </label>
            </fieldset>
          ))}
        </div>
      ) : (
        <p className="admin-hint">{t("admin.capabilityRows.empty")}</p>
      )}
      <p id={titleHintId} className="admin-hint">
        {t("admin.capabilityRows.titleHint")}
      </p>
      <p
        id={hintId}
        className={`admin-hint${limitReached ? " admin-danger-text" : ""}`}
        role={limitReached ? "status" : undefined}
      >
        {t(limitReached ? "admin.capabilityRows.limit" : "admin.capabilityRows.hint")} · {length}/{maxLength}
      </p>
    </div>
  );
}
