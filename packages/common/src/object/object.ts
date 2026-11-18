/** 可枚举自有属性的字符串键或 Symbol 键。 */
type ClonePropertyKey = string | symbol;
/** 单次复制的源对象到副本映射，用于还原循环与共享关系。 */
type CloneCache = WeakMap<object, unknown>;

// 内建槽不会随属性或原型修改而改变；弱缓存只记录已排除的槽，不缓存值、原型或复制结果。
const withoutBuiltinSlots = new WeakSet<object>();

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
      configurable: true,
      enumerable: true,
      value: cloneValue(propertyValue, cache),
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
 * 按原型链确定复制策略：普通根原型允许复制字面量，其他原型需要内部槽确认，
 * 具备派生构造器的实例则原样保留。分类只检查原型及描述符，不读取源对象的标签。
 */
const classifyPrototype = (prototype: object | null): "plain" | "checkSlots" | "preserve" => {
  if (prototype === null || prototype === Object.prototype) return "plain";
  let current = prototype;
  let parent: object | null = Object.getPrototypeOf(current);
  if (parent === null) return "plain"; // 其他 Realm 的字面量也直接继承链根。

  let visited: Set<object> | undefined;
  while (parent !== Object.prototype) {
    const ancestor: object | null = Object.getPrototypeOf(parent);
    if (ancestor === null) break; // 已到其他 Realm 的内建直接原型层。

    // 跳过普通中间原型；构造器与原型互指的派生层可能持有私有状态。
    const ctor: unknown = Object.getOwnPropertyDescriptor(current, "constructor")?.value;
    if (
      typeof ctor === "function" &&
      Object.getOwnPropertyDescriptor(ctor, "prototype")?.value === current
    ) {
      return "preserve";
    }
    // Proxy 可以报告循环的原型链，此时保守地保留原引用。
    visited ??= new Set<object>();
    if (visited.has(current)) return "preserve";
    visited.add(current);
    current = parent;
    parent = ancestor;
  }
  return "checkSlots";
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

  // 缓存只保存已创建的对象副本，因此 undefined 可直接表示尚未登记。
  const cached = cache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const prototype: object | null = Object.getPrototypeOf(value);
  // 每次检查当前原型，保留可识别的子类实例及其私有状态。
  const kind = classifyPrototype(prototype);
  if (kind === "preserve") return value;

  if (Array.isArray(value)) {
    const clone: unknown[] = new Array(value.length);
    cache.set(value, clone);
    copyEnumerableProperties(value, clone, cache);
    return clone;
  }

  if (!withoutBuiltinSlots.has(value)) {
    // 内建方法直接探测内部槽。即使首次分类，也无需通过源对象读取标签。
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
    // 原型被替换的 Map/Set 与普通对象具有相同标签，首次仍需按内部槽区分。
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
    withoutBuiltinSlots.add(value);
  }

  // 缺少所支持的内部槽时，只有普通对象可按属性复制。
  if (kind !== "plain") return value;
  // 跨 Realm 字面量归入当前 Realm，显式空原型继续保留。
  const clone = Object.create(prototype === null ? null : Object.prototype) as object;
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
