"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CapabilityGroup } from "@/lib/profile";
import { CapabilityIcon } from "@/components/capability-icon";
import { useI18n } from "@/components/providers";
import { CapabilityPopover } from "@/components/home/capability-popover";
import { useCapabilityPreview } from "@/components/home/use-capability-preview";

// 标签只占一行，后台内容留在浮窗；用户主动操作后完全接管展示，不再恢复自动轮播。
export function CapabilityOverview({ groups }: { groups: CapabilityGroup[] }) {
  const { t } = useI18n();
  const id = useId();
  const { containerRef, automaticIndex, stopAutomatic } = useCapabilityPreview(groups.length);
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndex = manualIndex ?? automaticIndex;
  const active = activeIndex === null ? null : groups[activeIndex];
  const hasDetails = Boolean(active?.description.trim());

  useEffect(() => {
    if (automaticIndex === null || !tabsRef.current) return;
    const button = buttonsRef.current[automaticIndex];
    if (!button) return;
    // 手机端保持单行，自动介绍时只滚动标签条，确保后面的标签可见而不拖动整个页面。
    const tab = button.getBoundingClientRect();
    const strip = tabsRef.current.getBoundingClientRect();
    if (tab.left < strip.left + 5) tabsRef.current.scrollLeft -= strip.left + 5 - tab.left;
    else if (tab.right > strip.right - 5) tabsRef.current.scrollLeft += tab.right - strip.right + 5;
  }, [automaticIndex]);

  // 跨过标签和浮窗之间的小间隙时保留内容，切换标签则取消旧的关闭任务，避免误关新浮窗。
  function clearCloseTimer() {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  // 悬停、聚焦和触屏点击共用入口，保证任一主动交互都会永久中止首次自动展示。
  function showPreview(index: number) {
    clearCloseTimer();
    stopAutomatic();
    setManualIndex(index);
  }

  // 延迟仅用于鼠标从触发器移进浮窗，键盘离开或点击外部仍会立即关闭。
  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setManualIndex(null), 120);
  }

  useEffect(() => {
    // 浮窗通过 portal 展示，外部点击要同时排除标签条与浮窗本身。
    function dismissOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      clearCloseTimer();
      setManualIndex(null);
    }
    // Esc 也终止自动介绍，让用户主动关闭后不会在下一拍再次弹出。
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      clearCloseTimer();
      stopAutomatic();
      setManualIndex(null);
    }
    document.addEventListener("pointerdown", dismissOnOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      clearCloseTimer();
      document.removeEventListener("pointerdown", dismissOnOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [containerRef, stopAutomatic]);

  if (!groups.length) return null;
  return (
    <div className="profile-skills" ref={containerRef}>
      <h2 id={`${id}-title`}>{t("overview.aiCapabilities")}： </h2>
      <div className="capability-tabs" ref={tabsRef} role="group" aria-labelledby={`${id}-title`}>
        {groups.map((group, index) => (
          <button
            type="button"
            className="capability-tab"
            key={`${group.title}-${index}`}
            ref={(node) => { buttonsRef.current[index] = node; }}
            data-active={activeIndex === index}
            aria-expanded={activeIndex === index && hasDetails}
            aria-describedby={activeIndex === index && hasDetails ? `${id}-details` : undefined}
            onPointerEnter={(event) => { if (event.pointerType !== "touch") showPreview(index); }}
            onPointerLeave={(event) => { if (event.pointerType !== "touch") scheduleClose(); }}
            onFocus={() => showPreview(index)}
            onBlur={() => { clearCloseTimer(); setManualIndex(null); }}
            onClick={() => showPreview(index)}
          >
            <CapabilityIcon name={group.icon} size={13} />
            {group.title}
          </button>
        ))}
      </div>
      {active && activeIndex !== null && hasDetails && (
        <CapabilityPopover
          id={`${id}-details`}
          anchor={buttonsRef.current[activeIndex]}
          group={active}
          popoverRef={popoverRef}
          onPointerEnter={clearCloseTimer}
          onPointerLeave={scheduleClose}
        />
      )}
    </div>
  );
}
