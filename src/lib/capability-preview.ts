type PreviewListener = (index: number | null) => void;

// 将计时生命周期独立出来，确保离开视口、用户接管和卸载都能清掉同一个待执行任务。
export function createCapabilityPreview(onChange: PreviewListener) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let finished = false;
  let disposed = false;
  let count = 0;
  let index = 0;

  // 清理时同时移除句柄，避免已经结束的轮播仍持有过期任务。
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  // 中止也消耗唯一一次展示机会，因此后续重新进入视口不会重播。
  function stop() {
    if (disposed || finished) return;
    finished = true;
    clearTimer();
    onChange(null);
  }

  // 使用递归 timeout 保证每项完整展示 1250ms，末项结束后恢复手动状态。
  function advance() {
    if (disposed || finished) return;
    if (index >= count) {
      stop();
      return;
    }
    onChange(index++);
    timer = setTimeout(advance, 1250);
  }

  return {
    // 数量在首次可见时确定，重复可见事件不会重置正在运行的计时。
    start(nextCount: number) {
      if (started || finished || disposed || nextCount <= 0) return;
      started = true;
      count = nextCount;
      advance();
    },
    stop,
    // 卸载只清理资源，不再通知 React；StrictMode 重建订阅也能安全释放旧任务。
    dispose() {
      disposed = true;
      clearTimer();
    },
    get running() {
      return started && !finished && !disposed;
    },
  };
}
