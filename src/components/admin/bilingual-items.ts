// 英文跟随原中文项重新排列，避免插入、删除或换序后按旧索引把译文保存到另一项。
export function reconcileEnglishItems(
  previousItems: readonly string[],
  nextItems: readonly string[],
  previousEnglish: readonly string[],
): string[] {
  const englishBySource = new Map(
    previousItems.map((item, index) => [item, previousEnglish[index] ?? ""]),
  );
  return nextItems.map((item) => englishBySource.get(item) ?? "");
}
