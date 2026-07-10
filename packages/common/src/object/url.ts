/**
 * query 参数允许的单个值；会在序列化时转换为字符串。
 */
export type QueryScalar = string | number | boolean | null | undefined;

/**
 * query 参数值可以是单个值，也可以是保留元素顺序的重复值数组。
 */
export type QueryValue = QueryScalar | readonly QueryScalar[];

/**
 * 用于序列化的 query 对象。
 */
export type QueryRecord = Record<string, QueryValue>;

/**
 * query key 的排序方式。
 */
export type SortQueryKeysOption = boolean | "asc" | "desc" | ((a: string, b: string) => number);

/**
 * 对象转换为 query 的配置。
 */
export interface ObjectToQueryOptions {
  /** 是否过滤 `null` 和 `undefined`，默认过滤。 */
  filterNullish?: boolean;
  /** 仅排序 key，不会改变同一个 key 的数组元素顺序。 */
  sortKeys?: SortQueryKeysOption;
}

/**
 * query 解析后的对象；重复 key 会以字符串数组保存。
 */
export type QueryObject = Record<string, string | string[]>;

/**
 * 按 Unicode 代码点比较字符串，避免依赖运行时默认排序的实现细节。
 */
const compareByCodePoint = (left: string, right: string): number => {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]?.codePointAt(0) ?? 0;
    const rightPoint = rightPoints[index]?.codePointAt(0) ?? 0;
    if (leftPoint !== rightPoint) {
      return leftPoint - rightPoint;
    }
  }

  return leftPoints.length - rightPoints.length;
};

/**
 * 根据配置取得 key 排序结果；自定义比较函数会原样交给 `Array.sort`。
 */
const getSortedKeys = <T extends object>(
  value: { [Key in keyof T]: QueryValue },
  sortKeys: SortQueryKeysOption | undefined,
): Array<Extract<keyof T, string>> => {
  const keys = Object.keys(value) as Array<Extract<keyof T, string>>;
  if (sortKeys === undefined || sortKeys === false) {
    return keys;
  }
  if (sortKeys === true || sortKeys === "asc") {
    return keys.sort(compareByCodePoint);
  }
  if (sortKeys === "desc") {
    return keys.sort((left, right) => compareByCodePoint(right, left));
  }
  return keys.sort(sortKeys);
};

/**
 * 将对象序列化为不带前导问号的 query 字符串。
 *
 * 每个值都通过 `URLSearchParams.append` 单独写入，因此数组会展开为重复 key，
 * 而不是被构造函数隐式转换成逗号分隔的字符串。
 */
export const objectToQuery = <T extends object>(
  value: { [Key in keyof T]: QueryValue },
  options?: ObjectToQueryOptions,
): string => {
  const params = new URLSearchParams();
  const filterNullish = options?.filterNullish ?? true;

  for (const key of getSortedKeys(value, options?.sortKeys)) {
    const queryValue = value[key];
    const values = Array.isArray(queryValue) ? queryValue : [queryValue];

    for (const item of values) {
      // 空数组自然不会进入此循环；开启过滤时，顶层和数组内部的空值都不写入。
      if (filterNullish && (item === null || item === undefined)) {
        continue;
      }
      params.append(key, String(item));
    }
  }

  return params.toString();
};

/**
 * 提取可交给 `URLSearchParams` 的 query 内容。
 *
 * 先丢弃第一个 hash 及其后的片段；带前导问号、HTTP(S) URL、绝对路径以及明显的相对路径会提取问号后的 query。
 * 相对路径与裸 query 在没有前导斜杠时存在歧义：问号前出现 `=` 或 `&` 时优先按裸 query 处理，
 * 从而避免把参数值中未编码的问号误认为 URL 边界。若裸 query 的 key 本身包含未编码问号，可加前导问号消除歧义。
 */
const extractQuery = (value: string): string | null => {
  const hashIndex = value.indexOf("#");
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const questionMarkIndex = beforeHash.indexOf("?");

  if (beforeHash.startsWith("?")) {
    return beforeHash.slice(questionMarkIndex + 1);
  }

  const beforeQuestionMark = beforeHash.slice(0, questionMarkIndex);
  const isExplicitPath = /^(?:https?:\/\/|\/)/i.test(beforeHash);
  const isRelativePath = questionMarkIndex >= 0 && !/[=&]/u.test(beforeQuestionMark);
  if (isExplicitPath || isRelativePath) {
    return questionMarkIndex >= 0 ? beforeHash.slice(questionMarkIndex + 1) : null;
  }

  return beforeHash;
};

/**
 * 将 query、带 query 的路径或 HTTP(S) URL 解析为对象。
 *
 * 重复 key 会按出现顺序提升为数组。通过 `Object.defineProperty` 写入结果，
 * 使 `__proto__` 也能作为普通自有字段保留，而不会触发原型访问器。
 */
export const queryToObject = (value: string): QueryObject => {
  const query = extractQuery(value);
  const result: QueryObject = {};

  if (query === null) {
    return result;
  }

  for (const [key, item] of new URLSearchParams(query)) {
    // 先判断自有字段，避免 `__proto__`、`constructor` 等 key 读取到原型链上的值。
    if (Object.getOwnPropertyDescriptor(result, key) === undefined) {
      Object.defineProperty(result, key, {
        value: item,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      continue;
    }

    const current = result[key];
    if (Array.isArray(current)) {
      // 同一个 key 的后续值直接追加，避免每次重复参数都复制完整数组而退化为二次复杂度。
      current.push(item);
      continue;
    }

    Object.defineProperty(result, key, {
      value: [current, item],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return result;
};
