/**
 * 判断传入值是否为常见的中国大陆手机号格式。
 *
 * 这里的规则是：
 * - 必须是字符串
 * - 以 `1` 开头
 * - 第二位限定在 `3` 到 `9` 之间
 * - 总长度为 11 位数字
 *
 * 这个实现适合常见的前端表单校验或轻量参数校验，
 * 目标是快速过滤明显不合法的输入。
 * 它不是对所有历史号段、特殊业务号段或运营商细则的完整建模。
 */
export const isPhoneCn = (value: unknown): value is string =>
  typeof value === "string" && /^1[3-9]\d{9}$/u.test(value);

/**
 * 判断传入值是否符合国际通用邮箱地址格式。
 *
 * 这里采用的是轻量级正则，规则如下：
 * - `@` 前后都必须有内容
 * - 不允许出现空白字符
 * - 本地部分和域名部分均由 `.` 分隔的若干段组成，每段至少包含一个非空白、非 `@`、非 `.` 的字符
 * - 域名部分至少包含一个 `.`，即至少有两段
 * - 点不能出现在本地部分或域名的首尾，也不允许连续出现（如 `a..b@c.d`、`a@b..c`、`.a@b.c`、`a@b.c.` 均不通过）
 *
 * 这个实现适合大多数业务场景下的基础格式校验，
 * 但它不是 RFC 级别的完整邮箱语法校验器，
 * 不会覆盖所有极端合法格式，也不会验证域名是否真实存在，
 * 也不会校验本地部分或域名的长度上限（RFC 规定本地部分 ≤ 64、域名总长 ≤ 253、单个 label ≤ 63）。
 *
 * 注意：传入值必须为 `string` 类型，`number`、`boolean`、`null`、`undefined` 等非字符串输入一律返回 `false`。
 */
export const isEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(value);

/**
 * 判断传入值是否为 http 或 https URL。
 *
 * 这里的规则是：
 * - 必须是字符串
 * - 以 `http://` 或 `https://` 开头
 * - 协议头后至少有一个非空白字符作为主机部分
 *
 * 这个实现只做最基本的协议和主机非空校验，
 * 不会校验域名是否合法、端口是否在范围内、路径或查询串是否合法，
 * 也不支持 `ftp`、`ws`、`file` 等其他协议。
 * 它适合用来快速区分“是否是一个 http(s) 链接”，
 * 而非作为完整的 URL 规范校验器。
 *
 * 注意：传入值必须为 `string` 类型，非字符串输入一律返回 `false`。
 */
export const isHttpUrl = (value: unknown): value is string =>
  typeof value === "string" && /^https?:\/\/\S+$/u.test(value);

/**
 * IPv4 每段匹配模式，取值范围 `0-255`，不允许前导零（`00`、`01` 不通过，`0` 本身可以通过）。
 *
 * 提升到模块作用域，避免每次调用都重新构造 `RegExp`，与同文件其他正则校验函数保持一致。
 */
const IPV4_SEGMENT = "(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)";
const IPV4_REGEX = new RegExp(`^${IPV4_SEGMENT}(?:\\.${IPV4_SEGMENT}){3}$`, "u");

/**
 * 判断传入值是否为合法的 IPv4 地址。
 *
 * 这里的规则是：
 * - 必须是字符串
 * - 由四段点分十进制数字组成，每段取值范围为 `0` 到 `255`
 * - 不允许出现前导零（如 `01.1.1.1` 不通过），以避免和八进制语义混淆
 *
 * 这个实现适合常见的网络地址格式校验，
 * 不支持 IPv6、CIDR 表示法（如 `192.168.1.0/24`）和区间写法。
 *
 * 注意：传入值必须为 `string` 类型，非字符串输入一律返回 `false`。
 */
export const isIpv4 = (value: unknown): value is string =>
  typeof value === "string" && IPV4_REGEX.test(value);

/**
 * 中国大陆 18 位居民身份证号校验位计算所需的加权因子表。
 *
 * 依据 GB 11643-1999 标准，身份证前 17 位每位对应一个加权因子，
 * 将每位数字乘以对应加权因子后求和，再对 11 取模，
 * 结果映射到 `ID_CARD_CHECK_CODES` 表中即得到第 18 位校验码。
 */
const ID_CARD_WEIGHTS: readonly number[] = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];

/**
 * 校验码映射表，索引为前 17 位加权和对 11 取模的结果。
 * 注意第 2 位为字母 `X`（代表数值 10）。
 */
const ID_CARD_CHECK_CODES: readonly string[] = [
  "1",
  "0",
  "X",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];

/**
 * 判断传入值是否为合法的中国大陆 18 位居民身份证号。
 *
 * 这里的规则是：
 * - 必须是字符串
 * - 前 17 位为数字，第 18 位为数字或字母 `X`（大小写均可）
 * - 末位校验码必须符合 GB 11643-1999 标准的校验算法
 *
 * 校验算法：将前 17 位数字分别乘以对应加权因子，求和后对 11 取模，
 * 用结果在映射表中查找应得的校验码，与实际末位（大小写不敏感）比对。
 *
 * 这个实现适合前端表单校验，能拦截绝大多数输入错误，
 * 但它不是完整的身份信息校验：
 * - 不校验出生日期部分是否为真实存在的日期（如 `19990230` 开头的号码可能通过格式校验）
 * - 不校验地区码（前 6 位）是否为真实行政区划代码
 * - 不支持已基本退出使用的 15 位旧版身份证号
 *
 * 注意：传入值必须为 `string` 类型，非字符串输入一律返回 `false`。
 */
export const isIdCardCn = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{17}[\dXx]$/u.test(value)) {
    return false;
  }
  // 用 charCodeAt 计算数字，避免 noUncheckedIndexedAccess 下字符串索引返回 undefined；
  // 数组索引在 noUncheckedIndexedAccess 下返回 T | undefined，但正则已保证 i 在 0-16 范围内，用 ?? 0 兜底
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const digit = value.charCodeAt(i) - 48; // '0' 的 charCode 为 48
    const weight = ID_CARD_WEIGHTS[i] ?? 0;
    sum += digit * weight;
  }
  const checkCode = ID_CARD_CHECK_CODES[sum % 11];
  return value[17]?.toUpperCase() === checkCode;
};

/**
 * 判断传入值是否为合法的十六进制颜色值。
 *
 * 这里的规则是：
 * - 必须是字符串
 * - 以 `#` 开头
 * - 后跟 3 位或 6 位十六进制字符（数字 `0-9`、字母 `a-f` 或 `A-F`）
 *
 * 3 位写法（如 `#fff`）是 6 位写法（如 `#ffffff`）的简写形式，
 * 两者都视为合法。
 *
 * 这个实现只校验颜色码的格式，
 * 不支持带 alpha 通道的 4 位（`#rgba`）或 8 位（`#rrggbbaa`）写法，
 * 也不支持 `rgb()`、`hsl()` 等其他颜色函数表示法。
 *
 * 注意：传入值必须为 `string` 类型，非字符串输入一律返回 `false`。
 */
export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/u.test(value);
