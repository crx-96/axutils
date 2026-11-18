import type { SortKeysOption } from "./types.js";

/** 将解析和序列化共用的排序选项转换为比较器，null 表示沿用 Object.keys 的枚举顺序。 */
export const resolveComparator = (
  sortKeys: SortKeysOption | undefined,
): ((a: string, b: string) => number) | null => {
  // 两种内建方向都按字符串的 UTF-16 码元比较，自定义比较器遵循 Array.sort 契约。
  if (sortKeys === true || sortKeys === "asc") return (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  if (sortKeys === "desc") return (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  if (typeof sortKeys === "function") return sortKeys;
  if (sortKeys === false || sortKeys === undefined) return null;
  // JavaScript 调用方可以绕过静态类型；无效模式应进入两个 Safe 入口的错误处理。
  throw new TypeError('sortKeys 必须是布尔值、"asc"、"desc" 或比较函数');
};
