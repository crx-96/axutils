import { type AxiosRequestConfig, mergeConfig } from "axios";
import { Md5 } from "../../crypto/md5.js";
import { jsonStringify } from "../../object/json.js";

/** Axios 请求中需要单独判定可共享性的字段，其余传输策略由客户端传入。 */
interface RequestIdentityInput {
  /** 是否允许合并本次请求。 */
  dedupe: boolean;
  /** 使用方为特殊请求体或参数指定的身份。 */
  dedupeKey?: string;
  /** 独立取消的调用不能与其他调用共享传输。 */
  signal?: unknown;
  /** 已展开分组并合并默认值的最终头快照。 */
  headers?: object | undefined;
  /** 交给 Axios 序列化的查询参数。 */
  params?: unknown;
  /** 交给 Axios 转换的请求体。 */
  data?: unknown;
}

/** 只接受普通 JSON 数据属性，不预读 getter 或执行自定义 toJSON。 */
function isStableJsonValue(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;

  // JSON 查找 toJSON 时也会访问继承或不可枚举的属性；普通同名数据字段没有转换语义。
  if ("toJSON" in value) {
    const hook = Object.getOwnPropertyDescriptor(value, "toJSON");
    if (!hook || !("value" in hook) || typeof hook.value === "function") return false;
  }

  // 普通数组仅 length 不可枚举；隐藏 getter、自定义符号和稀疏位置无法完整反映在 JSON 身份中。
  const array = Array.isArray(value);
  const keys = Object.keys(value);
  if (Reflect.ownKeys(value).length !== keys.length + (array ? 1 : 0)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (array) {
    // 各 Realm 的 Array.prototype 自身都是数组，直接上级是该 Realm 的 Object.prototype。
    if (!Array.isArray(prototype) || keys.length !== value.length) return false;
    const objectPrototype = Object.getPrototypeOf(prototype);
    if (objectPrototype === null || Object.getPrototypeOf(objectPrototype) !== null) return false;
  } else if (prototype !== Object.prototype && prototype !== null) return false;

  ancestors.add(value);
  try {
    // Axios 负责实际读取访问器。身份探测只检查描述符，避免改变传输时看到的值。
    return keys.every((key, index) => {
      if (Array.isArray(value) && key !== String(index)) return false;
      const property = Object.getOwnPropertyDescriptor(value, key);
      return (
        property !== undefined &&
        "value" in property &&
        isStableJsonValue(property.value, ancestors)
      );
    });
  } finally {
    ancestors.delete(value);
  }
}

/** 只读数据属性。探测不执行访问器，失败时由 Axios 独立完成真实请求。 */
function dataProperty<T extends object, K extends keyof T>(
  object: T | undefined,
  name: K,
): T[K] | undefined;
function dataProperty(object: object | undefined, name: string): unknown;
function dataProperty(object: object | undefined, name: PropertyKey): unknown {
  const property = object && Object.getOwnPropertyDescriptor(object, name);
  if (!property?.enumerable) return undefined;
  if (!("value" in property)) throw new TypeError("Axios 默认配置包含访问器");
  return property.value;
}

/** 函数型 adapter、transform 和环境构造器按引用比较，不运行用户代码。 */
const functionIds = new WeakMap<object, number>();
/** 分配给新函数的进程内身份，弱键允许释放不再使用的实例配置。 */
let nextFunctionId = 0;

/** 将 Axios 默认配置编码为可比较的数据，保留 undefined、数组顺序和函数引用。 */
function describeDefault(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === undefined) return ["undefined"];
  if (typeof value === "function") {
    if (!functionIds.has(value)) functionIds.set(value, ++nextFunctionId);
    return ["function", functionIds.get(value)];
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value))
    throw new TypeError("无法比较 Axios 默认配置");

  // Axios 内建的 env、transitional 和转换器列表均为普通数据；带内部状态的代理、流等不能快照。
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    !(array ? prototype === Array.prototype : prototype === null || prototype === Object.prototype)
  ) {
    throw new TypeError("无法比较 Axios 默认配置对象");
  }
  ancestors.add(value);
  const fields = enumerableKeys(value).map((key) => [
    key,
    describeDefault(dataProperty(value, key), ancestors),
  ]);
  ancestors.delete(value);
  return array ? ["array", value.length, fields] : ["record", fields];
}

/** Axios 合并可枚举自有键，出现符号选项时保守关闭复用。 */
function enumerableKeys(object: object): string[] {
  if (
    Object.getOwnPropertySymbols(object).some((key) =>
      Object.prototype.propertyIsEnumerable.call(object, key),
    )
  ) {
    throw new TypeError("不支持比较符号配置键");
  }
  return Object.keys(object);
}

/** 在发送前锁定的传输选项，以及重试前确认 Axios 再次合并仍安全的判定。 */
export interface TransportSnapshot {
  /** 首次调用和重试交给原 Axios 实例的参数，缺省值保持缺省。 */
  config: Pick<
    AxiosRequestConfig,
    "allowAbsoluteUrls" | "baseURL" | "params" | "responseType" | "timeout"
  >;
  /** 显式与自动去重共同使用的有效传输身份，缺省表示独立发送。 */
  identity?: string;
  /** 调度下一次尝试前检查可变默认配置，失败时传播前次传输错误。 */
  canReplay: (defaults: Omit<AxiosRequestConfig, "headers"> | undefined) => boolean;
}

/** 快照已知的覆盖项；其余选项只作比较，始终由原 Axios 实例合并并执行拦截器。 */
export function snapshotTransport(
  defaults: Omit<AxiosRequestConfig, "headers"> | undefined,
  params: unknown,
  timeout: number | undefined,
): TransportSnapshot {
  const config: TransportSnapshot["config"] = {};
  if (params !== undefined) config.params = params;
  if (timeout !== undefined) config.timeout = timeout;
  /** 对访问器、非普通对象和自定义查询序列化器，仅保留真实的第一次调度。 */
  const independent = { canReplay: () => false, config };
  try {
    const baseURL = dataProperty(defaults, "baseURL");
    const responseType = dataProperty(defaults, "responseType");
    const effectiveTimeout = timeout ?? dataProperty(defaults, "timeout");
    config.allowAbsoluteUrls = dataProperty(defaults, "allowAbsoluteUrls") ?? true;
    if (baseURL !== undefined) config.baseURL = baseURL;
    if (responseType !== undefined) config.responseType = responseType;
    if (effectiveTimeout !== undefined) config.timeout = effectiveTimeout;

    // 已有默认参数时用 Axios 自己的合并规则快照有效查询。复杂输入只让真实调度读取一次。
    if (dataProperty(defaults, "paramsSerializer") !== undefined) return independent;
    const defaultParams: unknown = dataProperty(defaults, "params");
    if (defaultParams !== undefined) {
      if (!isStableJsonValue(defaultParams) || !isStableJsonValue(params)) return independent;
      config.params = mergeConfig({ params: defaultParams }, { params }).params;
    }
    const paramsSignature =
      defaultParams === undefined ? undefined : JSON.stringify(describeDefault(config.params));

    // 记录未被固定值覆盖的默认项，包括当时缺省的 baseURL/responseType，以识别之后新增的字段。
    const pinned = new Set(["headers", "params", ...Object.keys(config)]);
    const residual = (current: AxiosRequestConfig | undefined) =>
      JSON.stringify(
        enumerableKeys(current ?? {})
          .filter((key) => !pinned.has(key))
          .map((key) => [key, describeDefault(dataProperty(current, key))]),
      );
    const initial = residual(defaults);
    const identity =
      defaultParams === undefined
        ? JSON.stringify([
            initial,
            config.allowAbsoluteUrls,
            config.baseURL,
            config.responseType,
            config.timeout,
          ])
        : undefined;
    return {
      config,
      ...(identity === undefined ? {} : { identity }),
      canReplay(current) {
        try {
          if (residual(current) !== initial) return false;
          const live: unknown = dataProperty(current, "params");
          if (paramsSignature === undefined) return live === undefined;
          // 新增嵌套查询字段可能被深合并进快照；只有实际合并结果完整一致才允许再次调度。
          if (!isStableJsonValue(live) || !isStableJsonValue(config.params)) return false;
          const merged = mergeConfig({ params: live }, { params: config.params }).params;
          return JSON.stringify(describeDefault(merged)) === paramsSignature;
        } catch {
          return false;
        }
      },
    };
  } catch {
    return independent;
  }
}

/** 按客户端策略、解析时的传输选项与最终头生成 in-flight 身份。 */
export function serializeRequestIdentity(
  request: RequestIdentityInput,
  transportDefaults: string | undefined,
  policy: object,
): string | undefined {
  if (!request.dedupe || request.signal !== undefined || transportDefaults === undefined)
    return undefined;
  try {
    // 显式 key 由调用方代表请求体及非稳定查询参数，但不能覆盖 URL、鉴权头或传输策略。
    const explicit = request.dedupeKey !== undefined;
    if (!explicit && !isStableJsonValue(request.data)) return undefined;
    const stableParams = isStableJsonValue(request.params);
    if (!stableParams && !explicit) return undefined;
    const headers = Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
    );
    const identity = {
      headers,
      params: stableParams ? request.params : undefined,
      policy,
      transportDefaults,
      ...(explicit ? { dedupeKey: request.dedupeKey } : { data: request.data }),
    };
    const serialized = jsonStringify(identity, { onCycle: "throw", sortKeys: true });
    if (serialized === undefined) return undefined;
    return `${explicit ? "explicit" : "auto"}:${new Md5().update(serialized).toHex()}`;
  } catch {
    // 例如代理拒绝描述符检查时，仍让 Axios 通过正常请求通道处理输入。
    return undefined;
  }
}
