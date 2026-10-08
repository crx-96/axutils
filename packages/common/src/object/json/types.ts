/**
 * key 排序配置。
 *
 * - `true` 或 `"asc"`：按 Unicode 升序排列。
 * - `"desc"`：按 Unicode 降序排列。
 * - 自定义比较函数：与 `Array.prototype.sort` 的比较函数语义一致。
 * - 不传或 `false`：保持对象原有 key 顺序（`Object.keys` 的插入顺序）。
 */
export type SortKeysOption = boolean | "asc" | "desc" | ((a: string, b: string) => number);

/**
 * 循环引用处理策略。
 *
 * - `"throw"`：抛出 `JsonCircularReferenceError`（默认行为）。
 * - `"skip"`：将循环引用字段值替换为 `null`（不删除字段，数组中同理）。
 *   注意：底层 `safe-stable-stringify` 的 skip 语义是 null 替代而非字段删除。
 *   替换发生在 nullish 过滤之后，因此生成的 null 占位仍然保留。
 */
export type OnCycleOption = "throw" | "skip";

/**
 * JSON 序列化配置。
 */
export interface JsonStringifyOptions {
  /**
   * 对象 key 排序规则，见 {@link SortKeysOption}。
   *
   * 仅对对象自身的可枚举字符串 key 生效，数组元素顺序不受影响。
   */
  sortKeys?: SortKeysOption;
  /**
   * 是否过滤值为 `null` 或 `undefined` 的字段。
   *
   * 仅过滤对象字段，数组元素不受影响（`null` 在 JSON 数组中是合法值）。
   * 注意：原生 `JSON.stringify` 本身会忽略 `undefined` 值的字段，
   * 开启此项后还会额外过滤 `null` 值字段。
   */
  filterNullish?: boolean;
  /**
   * 缩进配置，透传给序列化逻辑。
   *
   * - `number`：每层缩进对应该数量的空格。
   * - `string`：每层缩进使用该字符串。
   */
  space?: number | string;
  /**
   * 循环引用处理策略，见 {@link OnCycleOption}，默认 `"throw"`。
   */
  onCycle?: OnCycleOption;
}

/**
 * JSON 反序列化配置。
 */
export interface JsonParseOptions {
  /**
   * 对解析结果中的对象 key 排序，见 {@link SortKeysOption}。
   *
   * 仅对对象自身的可枚举字符串 key 生效，数组元素顺序不受影响。
   */
  sortKeys?: SortKeysOption;
  /**
   * 是否过滤值为 `null` 的字段。
   *
   * 注意：JSON 文本中不存在 `undefined`，因此这里只过滤 `null`。
   */
  filterNullish?: boolean;
}
