import test from "node:test";
import assert from "node:assert/strict";
import { reconcileEnglishItems } from "../src/components/admin/bilingual-items";

test("删除首项后保留剩余中文项对应的英文", () => {
  assert.deepEqual(
    reconcileEnglishItems(["数据库", "部署"], ["部署"], ["Database", "Deployment"]),
    ["Deployment"],
  );
});

test("中文项换序时英文跟随原项而非旧索引", () => {
  assert.deepEqual(
    reconcileEnglishItems(
      ["前端", "服务端", "交付"],
      ["交付", "前端", "服务端"],
      ["Frontend", "Backend", "Delivery"],
    ),
    ["Delivery", "Frontend", "Backend"],
  );
});

test("中间插入新项保留空槽且不改变后续英文关联", () => {
  assert.deepEqual(
    reconcileEnglishItems(
      ["前端", "部署"],
      ["前端", "数据库", "部署"],
      ["Frontend", "Deployment"],
    ),
    ["Frontend", "", "Deployment"],
  );
});

test("空英文槽和手动留白随对应中文项保留", () => {
  assert.deepEqual(
    reconcileEnglishItems(
      ["实践", "Python", "写作"],
      ["写作", "Python", "实践", "新增"],
      ["Practice", "", "  Writing  "],
    ),
    ["  Writing  ", "", "Practice", ""],
  );
});

test("改名与缺失英文使用空串且不复用无对应源项的英文", () => {
  assert.deepEqual(
    reconcileEnglishItems(["旧名称", "缺少英文"], ["新名称", "缺少英文", "新增"], ["Old name"]),
    ["", "", ""],
  );
  assert.deepEqual(reconcileEnglishItems([], ["新项"], ["Orphan value"]), [""]);
});

test("清空中文列表返回空数组且不修改输入", () => {
  const source = Object.freeze(["数据库", "部署"]);
  const english = Object.freeze(["Database", "Deployment"]);
  assert.deepEqual(reconcileEnglishItems(source, [], english), []);
  assert.deepEqual(source, ["数据库", "部署"]);
  assert.deepEqual(english, ["Database", "Deployment"]);
});
