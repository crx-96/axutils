import { stringify as stringifyScalar } from "safe-stable-stringify";
import { stringifyBoxedValue } from "./boxed-value.js";
import { resolveComparator } from "./sort-keys.js";
import type { JsonStringifyOptions } from "./types.js";

/** 循环引用错误。内部只追踪容器引用，显式构造时保留调用者给出的路径。 */
export class JsonCircularReferenceError extends Error {
  /** 构造时提供的访问路径，库内部抛错时为空字符串。 */
  declare path: string;

  /** 构造可用 instanceof 区分的循环引用错误。 */
  constructor(path: string) {
    super(`检测到循环引用${path ? `，路径：${path}` : ""}`);
    this.name = "JsonCircularReferenceError";
    this.path = path;
  }
}

/** 编码已执行 toJSON 的非数组对象。包装标量返回最终 JSON 片段，普通对象返回 undefined 以便继续遍历。 */
const encodeBoxed = (value: object): string | undefined => {
  try {
    return stringifyBoxedValue(value);
  } catch (error) {
    // 原生不支持 BigInt。只有确认接收者确有 BigInt 内部槽才使用 peer 的无损数字编码，
    // Number/String 包装值的用户转换错误仍原样传播，转换也不会重试。
    let bigint: bigint;
    try {
      bigint = BigInt.prototype.valueOf.call(value);
    } catch {
      throw error;
    }
    return stringifyScalar(bigint);
  }
};

/** 对当前出现位置执行一次 toJSON 协议。根键为空串，数组下标也是字符串。 */
const applyToJSON = (value: unknown, key: string): unknown => {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function" || typeof value === "bigint")
  ) {
    // 分开读取与调用，既保留原始接收者，也不会再次读取 getter 或访问钩子自身的 call 属性。
    const hook: unknown = (value as { toJSON?: unknown }).toJSON;
    if (typeof hook === "function") return Reflect.apply(hook, value, [key]);
  }
  return value;
};

/** 原生 JSON.stringify 运行时接受任意类型的 space；用独立声明避免调用处双重断言。 */
const stringifyWithAnySpace = JSON.stringify as (
  value: unknown,
  replacer: null,
  space: unknown,
) => string;

/** 按原生 JSON.stringify 规则归一化缩进片段，兼容包装数字/字符串与任意非法类型。 */
const resolveSpaceGap = (space: unknown): string => {
  if (typeof space === "string") return space.slice(0, 10);
  if (typeof space === "number") {
    return " ".repeat(Math.max(0, Math.min(10, Math.trunc(space) || 0)));
  }
  if (typeof space !== "object" || space === null) return "";
  // 委托原生 JSON.stringify 按内部槽拆箱 Number/String 包装对象，非空缩进输出固定为 "[\n<gap>0\n]"。
  const formatted = stringifyWithAnySpace([0], null, space);
  return formatted.length > 3 ? formatted.slice(2, -3) : "";
};

/**
 * JSON 序列化。排序、过滤或显式 onCycle 启用配置化遍历，仅设置 space 时沿用原生行为。
 * @returns JSON 文本。根值经 toJSON 转换后仍为函数、undefined 或 Symbol 时返回 undefined。
 * @throws {JsonCircularReferenceError} 配置化遍历发现当前祖先引用且未启用 skip。
 * @throws {TypeError} 配置项非法，或原生路径遇到循环、无法表示的 BigInt。用户钩子和比较器异常原样传播。
 */
export const jsonStringify = (
  value: unknown,
  options?: JsonStringifyOptions,
): string | undefined => {
  if (options === undefined) return JSON.stringify(value);
  const { filterNullish, onCycle, sortKeys, space } = options;
  const comparator = resolveComparator(sortKeys);
  if (onCycle !== undefined && onCycle !== "throw" && onCycle !== "skip") {
    throw new TypeError('onCycle 必须是 "throw" 或 "skip"');
  }
  if (!comparator && !filterNullish && onCycle === undefined) {
    return JSON.stringify(value, null, space);
  }

  // 与原生一致，每层缩进最多十个空格或十个 UTF-16 码元。
  const gap = resolveSpaceGap(space);
  /** 仅追踪当前分支中经过 toJSON 后实际展开的容器。 */
  const ancestors = new WeakSet<object>();

  /** 返回该位置的 JSON 片段，undefined 表示省略对象字段或由数组调用者补 null。 */
  const visit = (
    raw: unknown,
    key: string,
    indent: string,
    objectField: boolean,
  ): string | undefined => {
    const item = applyToJSON(raw, key);
    // nullish 过滤只针对转换后的对象字段。用原生字符串转义保留任意 UTF-16 码元。
    if (item === null) return objectField && filterNullish ? undefined : "null";
    if (typeof item === "string") return JSON.stringify(item);
    if (typeof item !== "object") {
      // peer 只编码标量，特别是 BigInt 的完整十进制数字。函数转换结果不再查找 toJSON。
      if (typeof item === "function" || typeof item === "symbol" || item === undefined)
        return undefined;
      return stringifyScalar(item);
    }
    const array = Array.isArray(item);
    if (!array) {
      const scalar = encodeBoxed(item);
      if (scalar !== undefined) return scalar;
    }
    if (ancestors.has(item)) {
      if (onCycle === "skip") return "null";
      throw new JsonCircularReferenceError("");
    }

    // 先快照数组长度或对象键，在最终顺序中每次只读取当前属性值，再进入下一层。
    ancestors.add(item);
    const nextIndent = indent + gap;
    const parts: string[] = [];
    if (array) {
      // 代理数组也只读取并转换一次 length，遍历时保持初始长度，忽略后续追加元素。
      const length = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(+item.length));
      for (let i = 0; i < length; i++) {
        parts.push(visit(item[i], String(i), nextIndent, false) ?? "null");
      }
    } else {
      const keys = Object.keys(item);
      if (comparator) keys.sort(comparator);
      for (const name of keys) {
        const field = visit(Reflect.get(item, name), name, nextIndent, true);
        if (field !== undefined) parts.push(`${JSON.stringify(name)}:${gap ? " " : ""}${field}`);
      }
    }
    // 离开分支便允许兄弟字段再次展开相同引用。异常会结束本次调用，其局部集合随之释放。
    ancestors.delete(item);
    const body =
      gap && parts.length
        ? `\n${nextIndent}${parts.join(`,\n${nextIndent}`)}\n${indent}`
        : parts.join(",");
    return array ? `[${body}]` : `{${body}}`;
  };

  return visit(value, "", "", false);
};

/** 安全序列化。与 jsonStringify 使用同一遍历，异常返回 null，不可表示的根值返回 undefined。 */
export const jsonStringifySafe = (
  value: unknown,
  options?: JsonStringifyOptions,
): string | null | undefined => {
  // 仅在 Safe 入口将原生、配置或用户回调异常转换为约定的失败值。
  try {
    return jsonStringify(value, options);
  } catch {
    return null;
  }
};
