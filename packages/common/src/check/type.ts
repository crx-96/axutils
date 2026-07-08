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

/**
 * 判断传入值是否为 `null` 或 `undefined`。
 *
 * 这两个值在业务中经常需要一起处理（例如可选参数的默认值兜底），
 * 这里用严格相等分别判断，不使用 `value == null` 这类隐式转换，
 * 以保持和仓库中其他判断函数一致的显式风格。
 *
 * 注意：`0`、`""`、`false`、`NaN` 等常见的“空值”在这里都不会通过，
 * 它们需要各自的类型判断函数单独处理。
 */
export const isNil = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

/**
 * 判断传入值是否为函数。
 *
 * 这里直接使用 `typeof value === "function"`，
 * 它会覆盖普通函数、箭头函数、`async` 函数、生成器函数以及 `class` 声明，
 * 这些在 JavaScript 中 `typeof` 的结果都是 `"function"`。
 *
 * 注意：这里不做“是否为构造函数”、“是否为箭头函数”或“是否为 async 函数”的区分，
 * 如果需要单独识别 `async` 函数，请使用 {@link isAsyncFunction}。
 * 另外，跨 realm（如 iframe）时 `typeof` 仍然是可靠的，比 `instanceof Function` 更稳妥。
 *
 * 类型层面：收窄后的类型为 `(...args: never[]) => unknown`，
 * 调用方可以在收窄后**无参调用**并拿到 `unknown` 返回值，
 * 但**带参调用会触发类型错误**（实参不可赋值给 `never[]`）。
 * 如需带参调用，请在收窄后再断言具体的函数签名。
 */
export const isFunction = (value: unknown): value is (...args: never[]) => unknown =>
  typeof value === "function";

/**
 * 判断传入值是否为 `async` 函数。
 *
 * 这里通过 `Object.prototype.toString.call(value)` 判断，
 * `async` 函数（含 `async` 箭头函数）返回 `"[object AsyncFunction]"`，
 * 普通函数返回 `"[object Function]"`，生成器函数返回 `"[object GeneratorFunction]"`。
 *
 * 这种方式比 `value.constructor.name === "AsyncFunction"` 或 `instanceof AsyncFunction` 更稳妥，
 * 前者依赖 `constructor` 属性可被改写、后者在跨 realm 时会失效，
 * 而 `Object.prototype.toString` 是规范定义的内置行为，不受原型链篡改影响。
 *
 * 注意：
 * - 传入非函数值一律返回 `false`，不会抛异常。
 * - `class` 声明即使内部含 `async` 方法，其构造函数本身也不是 `async` 函数，返回 `false`。
 * - 生成器函数（`function*`）和异步生成器函数（`async function*`）都不视为 `async` 函数，返回 `false`；
 *   后者调用后返回 `AsyncGenerator` 而非 `Promise`，类型上也不应断言为返回 `Promise`。
 * - 经过 `Function.prototype.bind` 绑定后的 `async` 函数仍能被正确识别，
 *   因为 bound function 的原型链会继承 `AsyncFunction.prototype` 上的 `Symbol.toStringTag`。
 */
export const isAsyncFunction = (value: unknown): value is (...args: never[]) => Promise<unknown> =>
  typeof value === "function" && Object.prototype.toString.call(value) === "[object AsyncFunction]";

/**
 * 判断传入值是否为有效的 `Date` 实例。
 *
 * 这里除了要求 `value instanceof Date` 之外，还会额外检查 `getTime()` 是否为 `NaN`。
 * 原因是 `new Date("invalid")` 会得到一个 `Invalid Date`，
 * 它虽然是 `Date` 的实例，但时间戳为 `NaN`，在大多数业务判断里并不适合作为“有效日期”继续向下传递。
 *
 * 注意：使用 `instanceof Date` 意味着跨 realm（如 iframe 或 `vm` 模块创建的 `Date`）时可能判断失效，
 * 因为两者的 `Date` 构造函数并非同一个对象。
 * 如果需要跨 realm 判断，请改用 `Object.prototype.toString.call(value) === "[object Date]"`。
 */
export const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/**
 * 判断传入值是否为“字面量对象”（plain object）。
 *
 * 与 {@link isObject} 不同，这里会严格区分字面量对象和其他对象类型：
 * - `new String()`、`new Number()` 等包装对象返回 `false`
 * - `Date`、`RegExp`、`Map`、`Set`、`class` 实例返回 `false`
 * - `Object.create(null)` 返回 `true`（它的原型为 `null`，但语义上更接近字面量对象）
 *
 * 判断方式是检查**直接原型**：原型为 `null` 或 `Object.prototype` 时视为字面量对象。
 * 这里不沿原型链向上查找，因此 `Object.create({})` 这类原型指向中间对象的值会返回 `false`，
 * 这与 lodash `isPlainObject` 的行为不同。
 *
 * 注意：这里只做原型链层面的判断，不会校验对象自身的可枚举属性。
 * 另外，跨 realm（如 iframe）时 `Object.prototype` 可能不是同一个对象，
 * 因此对跨 realm 创建的对象，此判断可能不符合预期。
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
};
