export {
  isBrowser,
  isBrowserLike,
  isBun,
  isDeno,
  isNode,
  isServer,
  isWebWorker,
} from "./check/platform.js";
export { isEmail, isHexColor, isHttpUrl, isIdCardCn, isIpv4, isPhoneCn } from "./check/reg.js";
export {
  isArray,
  isArrowFunction,
  isAsyncArrowFunction,
  isAsyncFunction,
  isBoolean,
  isDate,
  isFunction,
  isNil,
  isNormalFunction,
  isNumber,
  isObject,
  isPlainObject,
  isString,
} from "./check/type.js";
export {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "./date/constant.js";
export { deepClone } from "./object/object.js";
export type { StorageKeyHandler, StorageOptions, StorageType } from "./object/storage.js";
export { StorageUtils } from "./object/storage.js";
export type { DebouncedFunction, ThrottledFunction } from "./object/timing.js";
export { debounce, throttle } from "./object/timing.js";
export { objectToQuery, queryToObject } from "./object/url.js";
