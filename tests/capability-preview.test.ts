import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityPreview } from "../src/lib/capability-preview";

test("能力预览从第 0 项开始，每项持续 1250ms，完成后清空且不重播", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const changes: (number | null)[] = [];
  const preview = createCapabilityPreview((index) => changes.push(index));

  preview.start(3);
  assert.deepEqual(changes, [0]);
  context.mock.timers.tick(1249);
  assert.deepEqual(changes, [0]);
  preview.start(3);
  context.mock.timers.tick(1);
  assert.deepEqual(changes, [0, 1]);
  context.mock.timers.tick(1250);
  assert.deepEqual(changes, [0, 1, 2]);
  context.mock.timers.tick(1250);
  assert.deepEqual(changes, [0, 1, 2, null]);
  assert.equal(preview.running, false);

  preview.start(3);
  context.mock.timers.tick(10000);
  assert.deepEqual(changes, [0, 1, 2, null]);
});

test("用户接管或滚出视口会立即清空并永久中止自动展示", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const changes: (number | null)[] = [];
  const preview = createCapabilityPreview((index) => changes.push(index));

  preview.start(3);
  context.mock.timers.tick(1250);
  preview.stop();
  preview.stop();
  preview.start(3);
  context.mock.timers.tick(10000);
  assert.deepEqual(changes, [0, 1, null]);
  assert.equal(preview.running, false);
});

test("首次展示前用户接管会消耗展示机会，卸载后计时器不再通知页面", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const clearTimer = context.mock.method(globalThis, "clearTimeout");
  const changes: (number | null)[] = [];
  const preview = createCapabilityPreview((index) => changes.push(index));
  preview.stop();
  preview.start(3);
  assert.deepEqual(changes, [null]);

  const disposedChanges: (number | null)[] = [];
  const disposedPreview = createCapabilityPreview((index) => disposedChanges.push(index));
  disposedPreview.start(3);
  disposedPreview.dispose();
  assert.equal(clearTimer.mock.callCount(), 1);
  disposedPreview.start(3);
  context.mock.timers.runAll();
  assert.deepEqual(disposedChanges, [0]);
  assert.equal(disposedPreview.running, false);
});
