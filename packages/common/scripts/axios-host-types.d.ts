import type {} from "axios";

/** 从消费者已经声明的宿主构造函数取得实例。缺少 Fetch API 的环境没有对应的实例类型。 */
type HostInstance<K extends string> =
  typeof globalThis extends Record<K, { prototype: infer T }> ? T : never;

/** Fetch 构造函数的第二个参数来自宿主自身的 RequestInit / ResponseInit 声明。 */
type HostInit<K extends string> =
  typeof globalThis extends Record<K, abstract new (...args: infer A) => unknown>
    ? NonNullable<A[1]>
    : never;

// Axios 1.x 的声明直接使用这些 Web 名称。只补充 Axios 模块的类型作用域，
// 让未启用 DOM 的程序继续使用原 peer 的 AxiosInstance、Headers、重载和模块扩充。
declare module "axios" {
  /** 当前宿主的 Fetch 请求实例。 */
  type Request = HostInstance<"Request">;
  /** 当前宿主的 Fetch 响应实例。 */
  type Response = HostInstance<"Response">;
  /** 当前宿主支持的 Fetch 请求选项。 */
  type RequestInit = HostInit<"Request">;
  /** 当前宿主支持的 Fetch 响应选项。 */
  type ResponseInit = HostInit<"Response">;
  /** 当前宿主可传给响应构造函数的二进制对象。 */
  type Blob = HostInstance<"Blob">;
  /** 当前宿主可传给响应构造函数的表单对象。 */
  type FormData = HostInstance<"FormData">;
}
