import { ArrowUpRight, Github } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import type { SiteSettings } from "@/lib/types";

// 邮箱与箭头共享邮件入口，点击任一处即可联系作者，地址仍可直接选择复制。
export async function ProfileLinks({
  settings,
}: {
  settings: Pick<SiteSettings, "github" | "email">;
}) {
  const { t } = await getI18n();
  return (
    <div className="profile-links">
      {settings.github && (
        <a href={settings.github} target="_blank" rel="noopener noreferrer">
          <Github size={16} aria-hidden="true" />
          {t("overview.github")}
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
      {settings.email && (
        <a className="profile-email" href={`mailto:${settings.email}`} aria-label={`${t("common.email")}: ${settings.email}`}>
          <span>{settings.email}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
      {!settings.github && !settings.email && (
        <small>{t("about.noContact")}</small>
      )}
    </div>
  );
}
