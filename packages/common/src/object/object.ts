type ClonePropertyKey = string | symbol;
type CloneCache = WeakMap<object, unknown>;

/**
 * 取得对象的可枚举自有属性。
 *
 * 使用 `Reflect.ownKeys` 同时覆盖字符串键和 Symbol 键，再用
 * `propertyIsEnumerable` 排除继承属性和非枚举属性；属性描述符本身不复制，访问器会在
 * 读取时求值并以普通可写数据属性写入副本。
 */
const getEnumerableKeys = (value: object): ClonePropertyKey[] =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  ) as ClonePropertyKey[];

/**
 * 将源对象的可枚举属性复制到已经创建并登记到缓存的目标对象。
 *
 * 目标对象必须先进入 `CloneCache`，这样属性图中的自循环或共享引用才能回指同一个副本。
 * 使用 `defineProperty` 写入数据属性，避免名为 `__proto__` 的业务键触发原型访问器。
 */
const copyEnumerableProperties = (source: object, target: object, cache: CloneCache): void => {
  for (const key of getEnumerableKeys(source)) {
    const propertyValue = Reflect.get(source, key);
    Object.defineProperty(target, key, {
      value: cloneValue(propertyValue, cache),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
};

/**
 * 通过当前 Realm 的内建方法验证对象内部槽，而不是使用 `instanceof`。
 * `instanceof` 无法识别来自 iframe、Worker 或 Node `vm` 的对象；内部槽校验仍能跨 Realm
 * 工作，同时会把伪装成内建对象的普通对象排除在外。
 */
const isDateValue = (value: object): value is Date => {
  try {
    Reflect.apply(Date.prototype.getTime, value, []);
    return true;
  } catch {
    return false;
  }
};

const regexpSourceGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, "source")?.get;

const isRegExpValue = (value: object): value is RegExp => {
  if (typeof regexpSourceGetter !== "function") {
    return false;
  }

  try {
    Reflect.apply(regexpSourceGetter, value, []);
    return true;
  } catch {
    return false;
  }
};

const isMapValue = (value: object): value is Map<unknown, unknown> => {
  try {
    Reflect.apply(Map.prototype.has, value, [value]);
    return true;
  } catch {
    return false;
  }
};

const isSetValue = (value: object): value is Set<unknown> => {
  try {
    Reflect.apply(Set.prototype.has, value, [value]);
    return true;
  } catch {
    return false;
  }
};

/**
 * 判断并返回普通对象副本应该使用的原型。
 *
 * 跨 Realm 的字面量对象的原型不是当前 Realm 的 `Object.prototype`，但它的原型自身仍以
 * `null` 为终点，并且对象标签为 `[object Object]`；复制时切换到当前 Realm 的原型，避免
 * 把源 Realm 的全局对象链带入副本。`Object.create(null)` 则继续保留 null 原型。
 */
const getPlainObjectClonePrototype = (value: object): object | null | undefined => {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) {
    return null;
  }
  if (prototype === Object.prototype) {
    return Object.prototype;
  }
  if (
    Object.getPrototypeOf(prototype) === null &&
    Object.prototype.toString.call(value) === "[object Object]"
  ) {
    return Object.prototype;
  }
  return undefined;
};

/**
 * 递归复制支持的对象类型。
 *
 * 这是一个面向常用数据结构的轻量实现，不试图模拟完整的 structured clone 规范：函数、
 * class 实例、WeakMap/WeakSet、Promise、TypedArray 等未声明支持的对象保持原引用，避免
 * 生成缺少内部槽或私有状态的伪副本。
 */
const cloneValue = (value: unknown, cache: CloneCache): unknown => {
  if (typeof value !== "object" || value === null) {
    // 函数也会从这里返回原引用；函数属性不属于本工具的复制范围。
    return value;
  }

  if (cache.has(value)) {
    return cache.get(value);
  }

  if (isDateValue(value)) {
    const clone = new Date(Reflect.apply(Date.prototype.getTime, value, []));
    cache.set(value, clone);
    copyEnumerableProperties(value, clone, cache);
    return clone;
  }

  if (isRegExpValue(value)) {
    const clone = new RegExp(value.source, value.flags);
    clone.lastIndex = value.lastIndex;
    cache.set(value, clone);
    copyEnumerableProperties(value, clone, cache);
    return clone;
  }

  if (isMapValue(value)) {
    const clone = new Map<unknown, unknown>();
    cache.set(value, clone);
    for (const [key, item] of value) {
      clone.set(cloneValue(key, cache), cloneValue(item, cache));
    }
    copyEnumerableProperties(value, clone, cache);
    return clone;
  }

  if (isSetValue(value)) {
    const clone = new Set<unknown>();
    cache.set(value, clone);
    for (const item of value) {
      clone.add(cloneValue(item, cache));
    }
    copyEnumerableProperties(value, clone, cache);
    return clone;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = new Array(value.length);
    cache.set(value, clone);
    copyEnumerableProperties(value, clone, cache);
    return clone;
  }

  const clonePrototype = getPlainObjectClonePrototype(value);
  if (clonePrototype === undefined) {
    return value;
  }

  const clone = Object.create(clonePrototype) as object;
  cache.set(value, clone);
  copyEnumerableProperties(value, clone, cache);
  return clone;
};

/**
 * 深拷贝常用对象结构。
 *
 * 支持原始值、数组、普通对象、Date、RegExp、Map、Set、循环引用和共享引用；只复制可枚举
 * 自有字符串/Symbol 属性。未声明支持的对象类型及函数会原样返回，调用方不应把该方法
 * 当作完整的 structured clone 实现。
 *
 * @param value 待复制的值
 * @returns 与输入具有相同结构、但支持类型已解除嵌套引用的副本
 */
export const deepClone = <T>(value: T): T => cloneValue(value, new WeakMap<object, unknown>()) as T;
