"use client";

import { useI18n } from "@/components/providers";
import type { SiteSettings } from "@/lib/types";

type HomeProfileKey = "role" | "avatar" | "skills" | "purpose";

// 名片资料独立分组，但继续由父表单统一保存，避免出现两套未保存状态。
export function HomeProfileFields({
  values,
  onChange,
  disabled,
}: {
  values: Pick<SiteSettings, HomeProfileKey>;
  onChange: (key: HomeProfileKey, value: string) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className="admin-settings-section">
      <div>
        <h2>{t("admin.homeCardTitle")}</h2>
        <p>{t("admin.homeCardHint")}</p>
      </div>
      <div className="admin-panel admin-form-panel">
        <label className="admin-field">
          <span>{t("admin.homeCardRole")}</span>
          <input
            maxLength={160}
            value={values.role || ""}
            onChange={(event) => onChange("role", event.target.value)}
            disabled={disabled}
          />
          <small>{t("admin.homeCardRoleHint")}</small>
        </label>
        <label className="admin-field">
          <span>{t("admin.homeCardAvatar")}</span>
          <input
            type="text"
            inputMode="url"
            maxLength={2048}
            placeholder={t("admin.urlPlaceholder")}
            value={values.avatar || ""}
            onChange={(event) => onChange("avatar", event.target.value)}
            disabled={disabled}
          />
          <small>{t("admin.homeCardAvatarHint")}</small>
        </label>
        <label className="admin-field">
          <span>{t("admin.homeCardSkills")}</span>
          <textarea
            rows={5}
            maxLength={1500}
            placeholder={t("admin.homeCardSkillsPlaceholder")}
            value={values.skills || ""}
            onChange={(event) => onChange("skills", event.target.value)}
            disabled={disabled}
          />
          <small>{t("admin.homeCardSkillsHint")}</small>
        </label>
        <label className="admin-field">
          <span>{t("admin.homeCardPurpose")}</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={values.purpose || ""}
            onChange={(event) => onChange("purpose", event.target.value)}
            disabled={disabled}
          />
          <small>{t("admin.homeCardPurposeHint")}</small>
        </label>
      </div>
    </section>
  );
}
