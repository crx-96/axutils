/**
 * 常用日期时间格式。格式字符串仍兼容 date-fns 的完整 token 语法；这些常量只覆盖高频场景，
 * 不能替代需要精细定制的业务格式。
 */
export const DATE_FORMAT = {
  /** 机器和接口常用的短日期，例如 2025-12-12。 */
  DATE: "yyyy-MM-dd",
  /** 业务页面常用的日期时间，例如 2025-12-12 12:12:12。 */
  DATE_TIME: "yyyy-MM-dd HH:mm:ss",
  /** 带毫秒的日期时间，例如 2025-12-12 12:12:12.123。 */
  DATE_TIME_MS: "yyyy-MM-dd HH:mm:ss.SSS",
  /** 使用斜杠分隔的短日期，例如 2025/12/12。 */
  SLASH_DATE: "yyyy/MM/dd",
  /** 使用斜杠分隔的日期时间，适合后台管理页面和表格。 */
  SLASH_DATE_TIME: "yyyy/MM/dd HH:mm:ss",
  /** 中文日期，例如 2025年12月12日；月份和日期不强制补零，更符合中文展示习惯。 */
  CN_DATE: "yyyy年M月d日",
  /** 中文日期时间，例如 2025年12月12日 12时12分12秒。 */
  CN_DATE_TIME: "yyyy年M月d日 HH时mm分ss秒",
  /** 时分秒，例如 12:12:12。 */
  TIME: "HH:mm:ss",
  /** 带毫秒的时分秒，例如 12:12:12.123。 */
  TIME_MS: "HH:mm:ss.SSS",
  /** 带 UTC 偏移的 ISO 8601 日期时间，例如 2025-12-12T12:12:12+08:00。 */
  ISO_OFFSET: "yyyy-MM-dd'T'HH:mm:ssXXX",
  /** 带三位毫秒和字面量 Z 的 UTC 日期时间。 */
  ISO_UTC: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
} as const;

/**
 * 日期格式参数类型。
 *
 * 保留任意字符串是因为 date-fns 支持业务自定义 token 组合；`string & {}` 则让 TypeScript
 * 编辑器在仍允许自定义格式的前提下，继续展示 DATE_FORMAT 中的常用字面量提示。
 *
 * 常用 token 说明（完整列表见 date-fns 文档）：
 * - `yyyy` — 四位年份（如 2025）
 * - `yy`   — 两位年份（如 25）
 * - `M`    — 不补零的月份（1-12）
 * - `MM`   — 补零的月份（01-12）
 * - `d`    — 不补零的日期（1-31）
 * - `dd`   — 补零的日期（01-31）
 * - `H`    — 不补零的小时（0-23）
 * - `HH`   — 补零的小时（00-23）
 * - `m`    — 不补零的分钟（0-59）
 * - `mm`   — 补零的分钟（00-59）
 * - `s`    — 不补零的秒（0-59）
 * - `ss`   — 补零的秒（00-59）
 * - `SSS`  — 三位毫秒
 * - `XXX`  — ISO 8601 时区偏移（+08:00）
 * - `'T'`  — 字面量 T（日期时间分隔符，用单引号包裹）
 * - `'Z'`  — 字面量 Z（表示 UTC，用单引号包裹）
 */
export type DateFormatPattern = (typeof DATE_FORMAT)[keyof typeof DATE_FORMAT] | (string & {});

/**
 * 常用 IANA 时区标识符。时区名称必须交给运行时校验，不能把 `CST` 等有歧义的缩写当作时区。
 */
export const TIMEZONE = {
  UTC: "UTC",

  // 亚洲：优先使用城市标识，而不是 CST、IST 等存在多重含义的缩写。
  /** 中国大陆统一使用 Asia/Shanghai，避免使用容易产生歧义的 CST 缩写。 */
  ASIA_SHANGHAI: "Asia/Shanghai",
  /** Asia/Shanghai 的语义化别名，便于面向中国用户的业务代码阅读。 */
  CHINA: "Asia/Shanghai",
  ASIA_TOKYO: "Asia/Tokyo",
  ASIA_SEOUL: "Asia/Seoul",
  ASIA_HONG_KONG: "Asia/Hong_Kong",
  ASIA_MACAU: "Asia/Macau",
  ASIA_TAIPEI: "Asia/Taipei",
  ASIA_SINGAPORE: "Asia/Singapore",
  ASIA_BANGKOK: "Asia/Bangkok",
  ASIA_HO_CHI_MINH: "Asia/Ho_Chi_Minh",
  ASIA_JAKARTA: "Asia/Jakarta",
  ASIA_KUALA_LUMPUR: "Asia/Kuala_Lumpur",
  ASIA_MANILA: "Asia/Manila",
  ASIA_KOLKATA: "Asia/Kolkata",
  ASIA_DHAKA: "Asia/Dhaka",
  ASIA_KATHMANDU: "Asia/Kathmandu",
  ASIA_KARACHI: "Asia/Karachi",
  ASIA_COLOMBO: "Asia/Colombo",
  ASIA_DUBAI: "Asia/Dubai",
  ASIA_RIYADH: "Asia/Riyadh",
  ASIA_JERUSALEM: "Asia/Jerusalem",
  ASIA_TEHRAN: "Asia/Tehran",
  ASIA_ALMATY: "Asia/Almaty",
  ASIA_TASHKENT: "Asia/Tashkent",
  ASIA_ULAANBAATAR: "Asia/Ulaanbaatar",

  // 欧洲：覆盖主要商务、金融和跨境协作时区。
  EUROPE_DUBLIN: "Europe/Dublin",
  EUROPE_LONDON: "Europe/London",
  EUROPE_LISBON: "Europe/Lisbon",
  EUROPE_PARIS: "Europe/Paris",
  EUROPE_BERLIN: "Europe/Berlin",
  EUROPE_MADRID: "Europe/Madrid",
  EUROPE_ROME: "Europe/Rome",
  EUROPE_AMSTERDAM: "Europe/Amsterdam",
  EUROPE_ZURICH: "Europe/Zurich",
  EUROPE_STOCKHOLM: "Europe/Stockholm",
  EUROPE_WARSAW: "Europe/Warsaw",
  EUROPE_ATHENS: "Europe/Athens",
  EUROPE_ISTANBUL: "Europe/Istanbul",
  EUROPE_MOSCOW: "Europe/Moscow",
  EUROPE_KYIV: "Europe/Kyiv",

  // 北美和南美：覆盖美国、加拿大、墨西哥及主要拉美国家。
  AMERICA_NEW_YORK: "America/New_York",
  AMERICA_TORONTO: "America/Toronto",
  AMERICA_VANCOUVER: "America/Vancouver",
  AMERICA_CHICAGO: "America/Chicago",
  AMERICA_DENVER: "America/Denver",
  AMERICA_LOS_ANGELES: "America/Los_Angeles",
  AMERICA_MEXICO_CITY: "America/Mexico_City",
  AMERICA_BOGOTA: "America/Bogota",
  AMERICA_LIMA: "America/Lima",
  AMERICA_SANTIAGO: "America/Santiago",
  AMERICA_BUENOS_AIRES: "America/Argentina/Buenos_Aires",
  AMERICA_SAO_PAULO: "America/Sao_Paulo",
  AMERICA_ANCHORAGE: "America/Anchorage",
  PACIFIC_HONOLULU: "Pacific/Honolulu",

  // 非洲：覆盖主要人口、商业和跨境服务中心。
  AFRICA_CAIRO: "Africa/Cairo",
  AFRICA_LAGOS: "Africa/Lagos",
  AFRICA_CASABLANCA: "Africa/Casablanca",
  AFRICA_NAIROBI: "Africa/Nairobi",
  AFRICA_JOHANNESBURG: "Africa/Johannesburg",

  // 大洋洲及太平洋岛国。
  AUSTRALIA_SYDNEY: "Australia/Sydney",
  AUSTRALIA_MELBOURNE: "Australia/Melbourne",
  AUSTRALIA_BRISBANE: "Australia/Brisbane",
  AUSTRALIA_PERTH: "Australia/Perth",
  PACIFIC_AUCKLAND: "Pacific/Auckland",
  PACIFIC_FIJI: "Pacific/Fiji",
  PACIFIC_PORT_MORESBY: "Pacific/Port_Moresby",
} as const;

/**
 * IANA 时区参数类型。
 *
 * 允许传入任意自定义 IANA 时区，同时让 TypeScript 编辑器提示 TIMEZONE 中的常用值。
 */
export type Timezone = (typeof TIMEZONE)[keyof typeof TIMEZONE] | (string & {});
