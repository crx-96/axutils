/**
 * 判断传入值是否为可直接参与数值运算的 number。
 *
 * 这里除了要求 `typeof value === "number"` 之外，还会额外排除 `NaN`。
 * 原因是 `NaN` 虽然在 JavaScript 中属于 number，但它通常表示一次失败的数值计算结果，
 * 在大多数业务判断里并不适合作为“有效数字”继续向下传递。
 */
export const isNumber = (value: unknown): value is number =>
  typeof value === "number" && !Number.isNaN(value);

/**
 * 判断传入值是否为字符串原始值。
 *
 * 这里只接受 `typeof value === "string"` 的原始字符串，
 * 不把 `new String("...")` 这类包装对象视为字符串，
 * 这样可以保证后续使用方拿到的是最常见、最稳定的字符串类型。
 */
export const isString = (value: unknown): value is string => typeof value === "string";

/**
 * 判断传入值是否为布尔原始值。
 *
 * 这里只接受 `true` 和 `false` 两种原始布尔值，
 * 不把 `new Boolean(...)` 这类包装对象视为布尔值，
 * 以避免在条件判断中混入不必要的类型歧义。
 */
export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * 判断传入值是否为数组。
 *
 * 这里直接使用 `Array.isArray`，因为它比 `instanceof Array` 更稳妥，
 * 对跨运行时上下文的数组判断也更可靠。
 * 泛型参数 `T` 只用于帮助调用方在类型层面表达数组元素类型，
 * 运行时不会校验数组中的每一项是否真的满足 `T`。
 */
export const isArray = <T = unknown>(value: unknown): value is T[] => Array.isArray(value);

/**
 * 判断传入值是否为“普通对象”语义下的对象值。
 *
 * JavaScript 中数组和 `null` 的 `typeof` 结果都比较容易误导：
 * - `typeof null === "object"`
 * - 数组的 `typeof` 结果也是 `"object"`
 *
 * 因此这里会显式排除 `null` 和数组，只保留最常见的键值对象场景，
 * 便于后续把结果当作 `Record<string, unknown>` 使用。
 *
 * 能力边界：这里只做 `typeof` 层面的判断，返回 `true` 的值并不一定都是字面量对象。
 * `new String()`、`new Number()` 等包装对象，以及 `Date`、`RegExp`、`Map`、`Set`、
 * `class` 实例、`Object.create(null)` 等都会返回 `true`。
 * 如果需要严格区分字面量对象（plain object）与其他对象类型，请另行实现。
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
