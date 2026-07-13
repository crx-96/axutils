export {
  isBrowser,
  isBrowserLike,
  isBun,
  isDeno,
  isNode,
  isServer,
  isWebWorker,
} from "./check/platform";
export { isEmail, isHexColor, isHttpUrl, isIdCardCn, isIpv4, isPhoneCn } from "./check/reg";
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
} from "./check/type";
export { deepClone } from "./object/object";
export type { StorageKeyHandler, StorageOptions, StorageType } from "./object/storage";
export { StorageUtils } from "./object/storage";
export type { DebouncedFunction, ThrottledFunction } from "./object/timing";
export { debounce, throttle } from "./object/timing";
export { objectToQuery, queryToObject } from "./object/url";
