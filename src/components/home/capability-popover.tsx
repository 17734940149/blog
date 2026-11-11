"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { CapabilityGroup } from "@/lib/profile";

type PopoverPosition = { left: number; top: number; below: boolean; arrowLeft: number };

// 浮窗独立于标签条滚动区域定位，窄屏也能完整阅读，且不会挤动联系区和正文。
export function CapabilityPopover({
  id,
  anchor,
  group,
  popoverRef,
  onPointerEnter,
  onPointerLeave,
}: {
  id: string;
  anchor: HTMLButtonElement | null;
  group: CapabilityGroup;
  popoverRef: RefObject<HTMLDivElement | null>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !popoverRef.current) return;
    // 优先在标签上方展示；贴近窗口边缘时换边并钳制横坐标，避免最后一个标签的浮窗被裁切。
    function updatePosition() {
      if (!anchor || !popoverRef.current) return;
      const trigger = anchor.getBoundingClientRect();
      const panel = popoverRef.current.getBoundingClientRect();
      if (trigger.bottom <= 0 || trigger.top >= window.innerHeight || trigger.right <= 0 || trigger.left >= window.innerWidth) {
        setPosition(null);
        return;
      }
      const below = trigger.top < panel.height + 20;
      const left = Math.max(12, Math.min(trigger.left + trigger.width / 2 - panel.width / 2, window.innerWidth - panel.width - 12));
      const next = {
        left,
        top: Math.max(12, Math.min(below ? trigger.bottom + 8 : trigger.top - panel.height - 8, window.innerHeight - panel.height - 12)),
        below,
        arrowLeft: Math.max(14, Math.min(trigger.left + trigger.width / 2 - left, panel.width - 14)),
      };
      setPosition((previous) => previous?.left === next.left && previous.top === next.top && previous.below === next.below && previous.arrowLeft === next.arrowLeft ? previous : next);
    }
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(anchor);
    observer.observe(popoverRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor, group.description, group.title, popoverRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      id={id}
      role="tooltip"
      ref={popoverRef}
      className="capability-popover"
      data-side={position?.below ? "bottom" : "top"}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden", "--capability-arrow-left": `${position?.arrowLeft ?? 14}px` } as CSSProperties}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <ul>
        {group.description.split(/[、,，]/).map((item) => item.trim()).filter(Boolean).map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
