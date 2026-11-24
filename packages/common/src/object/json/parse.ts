import { resolveComparator } from "./sort-keys.js";
import type { JsonParseOptions } from "./types.js";

/** 显式栈中的待处理容器任务，用于迭代构建后处理结果。 */
type PostProcessTask =
  | {
      /** 数组容器任务标识。 */
      kind: "array";
      /** 原始数组节点。 */
      source: unknown[];
      /** 待填充的目标数组副本。 */
      target: unknown[];
    }
  | {
      /** 普通对象容器任务标识。 */
      kind: "object";
      /** 原始对象节点。 */
      source: Record<string, unknown>;
      /** 待按序定义属性的目标对象副本。 */
      target: Record<string, unknown>;
    };

/**
 * 使用显式栈迭代后处理解析结果。
 *
 * 对 `JSON.parse` 的结果做 key 排序和 null 字段过滤，避免深层嵌套数组或对象触发调用栈溢出。
 * 后处理会创建新的对象/数组，不修改原始结构。
 * 这是文件内部辅助函数，不对外导出。
 */
const postProcess = <T>(
  value: T,
  comparator: ((a: string, b: string) => number) | null,
  filterNullish: boolean,
): T => {
  // 原始值不需要重新组织，直接原样返回。
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const stack: PostProcessTask[] = [];

  /** 为容器节点创建空目标副本并压入待处理栈；原始值直接返回。 */
  const enqueue = (node: unknown): unknown => {
    if (typeof node !== "object" || node === null) {
      return node;
    }
    if (Array.isArray(node)) {
      const target = new Array<unknown>(node.length);
      stack.push({ kind: "array", source: node, target });
      return target;
    }
    const target: Record<string, unknown> = {};
    stack.push({ kind: "object", source: node as Record<string, unknown>, target });
    return target;
  };

  const root = enqueue(value);

  while (stack.length > 0) {
    const task = stack.pop();
    if (task === undefined) break;

    if (task.kind === "array") {
      // 数组保持元素原序与 null 占位，逐项映射子节点。
      for (let index = 0; index < task.source.length; index += 1) {
        task.target[index] = enqueue(task.source[index]);
      }
      continue;
    }

    // 值来自 JSON.parse，对象只含可枚举数据字段；按选项排列键并移除 null 字段。
    let keys = Object.keys(task.source);
    if (comparator !== null) {
      keys.sort(comparator);
    }
    if (filterNullish) {
      keys = keys.filter((key) => task.source[key] !== null);
    }

    for (const key of keys) {
      // 使用数据属性定义，避免 `__proto__` 触发 Object.prototype 上的访问器并改变结果原型。
      Object.defineProperty(task.target, key, {
        configurable: true,
        enumerable: true,
        value: enqueue(task.source[key]),
        writable: true,
      });
    }
  }

  return root as T;
};

/**
 * JSON 反序列化方法。
 *
 * 先用原生 `JSON.parse` 解析，再按配置项对结果做后处理（key 排序、过滤 null 字段）。
 * 反序列化不依赖 `safe-stable-stringify`，纯原生实现。
 *
 * **FastPath**：未传入配置时直接调用原生 `JSON.parse`，性能与原生一致。
 *
 * 注意：
 * - JSON 文本中不存在 `undefined`，因此 `filterNullish` 只过滤 `null`。
 * - 排序会创建普通对象，枚举时数组索引键始终优先按数值升序出现。
 * - T 只声明预期结果类型，不做运行时结构校验；调用方需确认解析值是否满足业务结构。
 *
 * @param text JSON 文本
 * @param options 反序列化配置，见 {@link JsonParseOptions}
 * @returns 解析后的值
 * @throws {SyntaxError} 文本不是合法 JSON
 */
export const jsonParse = <T = unknown>(text: string, options?: JsonParseOptions): T => {
  // FastPath：无配置 -> 原生 parse
  if (options === undefined) {
    return JSON.parse(text) as T;
  }

  const comparator = resolveComparator(options.sortKeys);
  const filterNullish = options.filterNullish ?? false;

  // 显式传默认选项也不需要遍历结果；只有实际启用排序或过滤时才创建新结构。
  if (comparator === null && !filterNullish) {
    return JSON.parse(text) as T;
  }

  const parsed = JSON.parse(text) as T;
  return postProcess(parsed, comparator, filterNullish);
};

/**
 * 安全版 JSON 反序列化方法。
 *
 * 行为与 {@link jsonParse} 完全一致，区别在于任何异常（包括
 * `SyntaxError` 等解析错误）都不会抛出，而是直接返回 `null`。
 *
 * 适用场景：解析不可信的外部输入、配置文件兜底、网络响应容错等
 * 不关心失败原因、只需保证流程不中断的场景。
 * 如需区分错误类型或获取错误信息，请使用会抛异常的 {@link jsonParse}。
 *
 * 注意：由于合法的 JSON 可以解析为 `null`（如文本 `"null"`），
 * 调用方无法仅凭返回值 `null` 区分"解析失败"与"原文就是 null"。
 * 若需区分，请使用 {@link jsonParse} 捕获异常。
 * T 同样不提供运行时结构校验；合法 JSON 与预期类型不符时不会因此返回 `null`。
 *
 * @param text JSON 文本
 * @param options 反序列化配置，见 {@link JsonParseOptions}
 * @returns 成功时返回解析后的值，任何异常时返回 `null`
 */
export const jsonParseSafe = <T = unknown>(text: string, options?: JsonParseOptions): T | null => {
  // 捕获解析与后处理的所有异常；合法 JSON null 与失败仍遵守既有的相同返回约定。
  try {
    return jsonParse<T>(text, options);
  } catch {
    return null;
  }
};
