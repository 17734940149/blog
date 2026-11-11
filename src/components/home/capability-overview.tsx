import { CodeXml, Figma, Lightbulb, Rocket } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import type { CapabilityGroup } from "@/lib/profile";

const capabilitySections = [
  { key: "product", Icon: Lightbulb },
  { key: "design", Icon: Figma },
  { key: "development", Icon: CodeXml },
  { key: "delivery", Icon: Rocket },
] as const;

// 四个能力方向承接需求到上线的完整过程；后台技术栈只作实践补充，避免再次取代产品与设计能力。
export async function CapabilityOverview({ groups }: { groups: CapabilityGroup[] }) {
  const { t } = await getI18n();
  const technologies = Array.from(new Set(groups.flatMap((group) => group.tools)));
  return (
    <section className="profile-skills" aria-labelledby="profile-skills-title">
      <header className="capability-heading">
        <h2 id="profile-skills-title">{t("overview.capability.title")}</h2>
        <p>{t("overview.capability.summary")}</p>
      </header>
      <ol className="capability-grid">
        {capabilitySections.map(({ key, Icon }) => {
          const points = t(`overview.capability.${key}.description`).split("、");
          return (
            <li className="capability-item" key={key}>
              <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
              <h3>{t(`overview.capability.${key}.title`)}</h3>
              <ul className="capability-points">
                {points.map((point, index) => (
                  <li key={point}>{point}{index < points.length - 1 ? "、" : ""}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      {technologies.length > 0 && (
        <dl className="capability-technologies">
          <dt>{t("overview.capability.technologies")}</dt>
          <dd>{technologies.join(" · ")}</dd>
        </dl>
      )}
    </section>
  );
}
