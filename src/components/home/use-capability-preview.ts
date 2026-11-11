"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCapabilityPreview } from "@/lib/capability-preview";

// 自动展示只服务于首次发现内容；一旦用户接管或滚走，就永久交回手动控制。
export function useCapabilityPreview(count: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(count);
  const consumedRef = useRef(false);
  const controllerRef = useRef<ReturnType<typeof createCapabilityPreview> | null>(null);
  const [automaticIndex, setAutomaticIndex] = useState<number | null>(null);
  countRef.current = count;

  // 使用稳定回调让鼠标、键盘和触屏共用同一取消入口，不因页面重渲染重建订阅。
  const stopAutomatic = useCallback(() => {
    consumedRef.current = true;
    controllerRef.current?.stop();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let mounted = true;
    const controller = createCapabilityPreview((index) => {
      if (!mounted) return;
      if (index === null) consumedRef.current = true;
      setAutomaticIndex(index);
    });
    controllerRef.current = controller;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // 偏好在播放中改变也立即生效；之后关闭偏好不会意外启动自动展示。
    const respectMotionPreference = () => {
      if (motion.matches) controller.stop();
    };
    respectMotionPreference();
    motion.addEventListener("change", respectMotionPreference);

    let observer: IntersectionObserver | undefined;
    if (!consumedRef.current && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        // disconnect 无法撤回已排队的回调，卸载标记可阻止旧订阅干扰新订阅。
        if (!mounted) return;
        // 同一帧可能同时排入进入和离开事件，按顺序处理才能及时结束已滚走的预览。
        for (const entry of entries) {
          if (entry.target !== container) continue;
          if (entry.isIntersecting && !consumedRef.current) {
            controller.start(countRef.current);
          } else if (!entry.isIntersecting && controller.running) {
            controller.stop();
          }
        }
      });
      observer.observe(container);
    }

    return () => {
      mounted = false;
      observer?.disconnect();
      motion.removeEventListener("change", respectMotionPreference);
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  return { containerRef, automaticIndex, stopAutomatic };
}
