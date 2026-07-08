/**
 * 平台判断函数集。
 *
 * 与 `check/type`、`check/reg` 中「判断传入值」不同，这里所有函数都**检测当前运行时**，
 * 不接收参数，返回 `boolean`。
 *
 * 检测方式统一为「全局对象存在性检测」，不使用 `instanceof`，避免跨 realm 失效问题，
 * 也不会抛异常：在任意运行时调用都是安全的。
 *
 * 能力边界：全局对象可被 polyfill 或测试框架注入（如 jsdom 注入 `window`/`document`），
 * 因此这些函数反映的是「当前运行时**看起来**像什么」，而非「物理上运行在什么宿主中」。
 * 如需更可靠的判断，请结合业务上下文额外校验。
 */

/**
 * 可能存在但不在本仓库 `lib`（仅 `ES2020`，未包含 `DOM`）中的全局对象集合。
 *
 * 这里集中声明一次，避免每个函数各自书写交叉类型，保持实现简洁。
 * 全部为可选属性：存在性由运行时决定，函数内统一用 `typeof x !== "undefined"` 守卫。
 */
type PlatformGlobals = typeof globalThis & {
  window?: unknown;
  document?: unknown;
  self?: { window?: unknown };
  importScripts?: unknown;
  Deno?: { version?: { deno?: unknown } };
  Bun?: { version?: unknown };
  process?: { versions?: { node?: unknown } };
};

/**
 * 读取可能存在的全局对象，统一入口，避免散落的交叉类型断言。
 */
const globals = globalThis as PlatformGlobals;

/**
 * 判断当前运行时是否为浏览器主线程环境。
 *
 * 检测依据是同时满足以下条件：
 * - 存在全局 `window`
 * - 存在全局 `document`
 * - `window === globalThis`（浏览器主线程中 `window` 即全局对象）
 *
 * `window === globalThis` 这一条件用于排除 Node.js 中被注入的伪 `window`
 * （如 `global.window = {}`），以及 Web Worker / Service Worker 中的 `self`
 * （Worker 的 `self` 指向 worker 作用域，并非浏览器主线程的 `window`）。
 *
 * 注意：这是尽力区分，而非绝对可靠。jsdom 等环境会完整模拟浏览器全局对象，
 * 甚至令 `window === globalThis`，此时 `isBrowser()` 会返回 `true`。
 * 如需排除模拟环境，请结合业务上下文额外判断。
 * 另外，iframe 内部的文档也会返回 `true`，因为 iframe 拥有独立的 `window`/`document`。
 */
export const isBrowser = (): boolean =>
  typeof globals.window !== "undefined" &&
  typeof globals.document !== "undefined" &&
  globals.window === globals;

/**
 * 判断当前运行时是否为 Node.js 环境。
 *
 * 检测依据是同时满足以下条件：
 * - 存在全局 `process`
 * - `process.versions` 非 null/undefined
 * - `process.versions.node` 为字符串
 *
 * 之所以校验 `versions.node` 的类型，是因为部分环境（如 Electron 渲染进程）
 * 可能注入 `process` 对象但不带 Node 版本信息，单纯判断 `typeof process` 会误判。
 *
 * 注意：Electron 主进程同时满足 Node.js 环境特征，此处返回 `true`，
 * 如需区分 Electron 与纯 Node.js，请另行检测 `process.versions.electron`。
 */
export const isNode = (): boolean =>
  typeof globals.process !== "undefined" &&
  globals.process?.versions !== undefined &&
  globals.process?.versions !== null &&
  typeof globals.process.versions.node === "string";

/**
 * 判断当前运行时是否为 Web Worker 环境。
 *
 * 检测依据是同时满足以下条件：
 * - 存在全局 `self`
 * - `self.window` 不存在（浏览器主线程的 `self` 等于 `window`，此处用于排除主线程）
 * - 存在全局 `importScripts`（DedicatedWorkerGlobalScope 的标志性方法）
 *
 * 注意：Service Worker 和 Shared Worker 同样存在 `self` 但不一定有 `importScripts`，
 * 此处对它们返回 `false`。如需覆盖 Service Worker，请另行实现。
 */
export const isWebWorker = (): boolean =>
  typeof globals.self !== "undefined" &&
  typeof globals.self?.window === "undefined" &&
  typeof globals.importScripts === "function";

/**
 * 判断当前运行时是否为「类浏览器」环境。
 *
 * 检测依据仅是存在全局 `window`，不校验 `document` 和自引用。
 *
 * 与 {@link isBrowser} 的区别：后者严格判断浏览器主线程，而 `isBrowserLike` 只关心
 * 「是否有 `window`」，因此包含 jsdom、iframe、被注入 `window` 的 Node.js 等边缘场景。
 *
 * 注意：本函数语义宽松，适合用于「是否可使用浏览器 API」的快速预判，
 * 不适合用于需要严格区分浏览器主线程的场景。
 */
export const isBrowserLike = (): boolean => typeof globals.window !== "undefined";

/**
 * 判断当前运行时是否为服务端环境。
 *
 * 这里的「服务端」定义为「非浏览器主线程」，即 {@link isBrowser} 返回 `false`。
 * 因此 Web Worker、Node.js、Deno、Bun 等都会返回 `true`。
 *
 * 注意：如果只是要区分「能否使用 Node.js API」，请直接使用 {@link isNode}；
 * `isServer` 的语义偏向「不在浏览器主线程」，而非「在 Node.js」。
 */
export const isServer = (): boolean => !isBrowser();

/**
 * 判断当前运行时是否为 Deno 环境。
 *
 * 检测依据是同时满足以下条件：
 * - 存在全局 `Deno` 对象
 * - `Deno.version.deno` 非 null/undefined
 *
 * 注意：Deno 声称兼容 Node.js 和浏览器 API，但它会注入自身的 `Deno` 全局对象，
 * 因此 `isNode()` 在 Deno 下可能返回 `true`（取决于兼容层是否注入 `process`）。
 * 如需严格区分 Deno 与 Node.js，应优先以 `isDeno()` 为准。
 */
export const isDeno = (): boolean =>
  typeof globals.Deno !== "undefined" &&
  globals.Deno?.version?.deno !== undefined &&
  globals.Deno?.version?.deno !== null;

/**
 * 判断当前运行时是否为 Bun 环境。
 *
 * 检测依据是同时满足以下条件：
 * - 存在全局 `Bun` 对象
 * - `Bun.version` 为字符串
 *
 * 注意：Bun 兼容 Node.js API，因此 `isNode()` 在 Bun 下也会返回 `true`。
 * 如需严格区分 Bun 与 Node.js，应优先以 `isBun()` 为准。
 */
export const isBun = (): boolean =>
  typeof globals.Bun !== "undefined" && typeof globals.Bun?.version === "string";
