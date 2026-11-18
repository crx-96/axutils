/** 标准十六进制字符；空字符串表示零字节，长度约束由解码入口检查。 */
const HEX_PATTERN = /^[\da-f]*$/iu;

/** RFC 4648 标准 Base64 字母表，位置即六位编码值。 */
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** ASCII 码元到六位值的反查表，-1 表示标准字母表之外的字符。 */
const BASE64_LOOKUP = new Int8Array(128).fill(-1);
for (let index = 0; index < BASE64_ALPHABET.length; index++) {
  BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(index)] = index;
}

/** 摘要支持的文本或字节输入；数值数组元素必须是 0–255 的整数。 */
export type Md5Input = string | readonly number[] | Uint8Array;
/** 字符串解码方式，默认 UTF-8；字节输入忽略此选项。 */
export type Md5StringEncoding = "utf8" | "hex" | "base64";

/**
 * 把各类 MD5 输入统一归一化为新的 `Uint8Array`。
 *
 * 这里集中处理 UTF-8、hex、base64 与字节数组校验，避免浏览器侧与 Node 侧
 * 各自维护一套规则导致行为漂移。返回值始终是新的字节副本，调用方后续修改原输入
 * 不会影响已经进入摘要计算的内容。
 */
export const normalizeMd5Input = (
  input: Md5Input,
  encoding: Md5StringEncoding = "utf8",
): Uint8Array => {
  // JavaScript 调用者不受联合类型限制；未知编码必须失败，不能静默按 Base64 解码。
  if (typeof input === "string") {
    if (encoding === "utf8") {
      return new TextEncoder().encode(input);
    }
    if (encoding === "hex") {
      return decodeHex(input);
    }
    if (encoding === "base64") {
      return decodeBase64(input);
    }
    throw new TypeError("MD5 字符串编码只支持 utf8、hex 或 base64。");
  }

  // 字节输入已经有明确编码，只校验与复制，不解释 encoding。
  return toByteArray(input);
};

/**
 * 把 `number[]` 或 `Uint8Array` 归一化成新的 `Uint8Array`。
 *
 * 这里只做轻量字节校验：必须是 `0-255` 的整数，不承担更高层协议语义校验。
 */
export const toByteArray = (input: readonly number[] | Uint8Array): Uint8Array => {
  if (input instanceof Uint8Array) {
    // 显式构造普通 Uint8Array：Buffer.slice() 及子类的 species 可能返回共享视图。
    // 新副本只覆盖有效字节，摘要实现可以安全地使用整个底层 ArrayBuffer。
    return new Uint8Array(input);
  }

  // 在同一次迭代中校验并保存，避免 getter 改变数值；for-of 仍拒绝非迭代的错误输入。
  const bytes: number[] = [];
  for (const byte of input) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new TypeError("MD5 update 只接受 0-255 的字节值。");
    }
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
};

/**
 * 把 SparkMD5 的 raw 二进制字符串结果还原为字节数组。
 *
 * 这是针对第三方库输出格式的适配层，不适合作为通用文本解码工具使用。
 */
export const binaryStringToBytes = (value: string): number[] => {
  // raw 格式的单位是 UTF-16 码元，代理对的两半各贡献一个低字节。
  const bytes = new Array<number>(value.length);
  for (let index = 0; index < value.length; index++) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
};

/**
 * 把十六进制字符串解码为字节数组。
 *
 * 只接受连续的标准 hex，不支持分隔符、`0x` 前缀或奇数字符长度；空字符串返回空字节数组。
 */
export const decodeHex = (value: string): Uint8Array => {
  // 先验证完整文本，再分配结果，避免接受被 parseInt 部分解析的字符。
  if (value.length % 2 !== 0) {
    throw new TypeError("hex 字符串长度必须为偶数。");
  }
  if (!HEX_PATTERN.test(value)) {
    throw new TypeError("hex 字符串包含非法字符。");
  }

  // 每两个 hex 字符对应一个字节，空输入自然得到零长度的独立数组。
  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
};

/**
 * 把标准 RFC 4648 base64 字符串解码为字节数组。
 *
 * 这里只支持标准 base64，不支持 URL-safe 变体。空白会先被移除，
 * 以兼容多行或带空格的展示字符串。
 */
export const decodeBase64 = (value: string): Uint8Array => {
  // 展示用空白不属于编码数据；清理后按完整四字符分组校验。
  const sanitized = value.replace(/\s+/gu, "");

  if (sanitized.length === 0) {
    return new Uint8Array();
  }
  if (sanitized.length % 4 !== 0) {
    throw new TypeError("base64 字符串长度必须是 4 的倍数。");
  }

  // 只有末尾最多两个等号可以不查字母表，正文中的等号仍按位置报错。
  const padding = sanitized.endsWith("==") ? 2 : sanitized.endsWith("=") ? 1 : 0;
  const dataEnd = sanitized.length - padding;
  const bytes = new Uint8Array((sanitized.length / 4) * 3 - padding);
  let offset = 0;

  for (let index = 0; index < dataEnd; index += 4) {
    // 直接从原字符串读取六位值，按剩余字符数写入一至三个字节。
    const first = readBase64Digit(sanitized, index);
    const second = readBase64Digit(sanitized, index + 1);
    bytes[offset++] = (first << 2) | (second >> 4);
    if (index + 2 === dataEnd) {
      if ((second & 0x0f) !== 0) {
        throw new TypeError("base64 字符串包含非规范未使用位。");
      }
      break;
    }

    const third = readBase64Digit(sanitized, index + 2);
    bytes[offset++] = (second << 4) | (third >> 2);
    if (index + 3 === dataEnd) {
      if ((third & 0x03) !== 0) {
        throw new TypeError("base64 字符串包含非规范未使用位。");
      }
      break;
    }

    bytes[offset++] = (third << 6) | readBase64Digit(sanitized, index + 3);
  }

  return bytes;
};

/** 从数据区读取一个标准 Base64 数字，区分位置错误的 padding 与非法字符。 */
function readBase64Digit(value: string, index: number): number {
  const code = value.charCodeAt(index);
  const digit = BASE64_LOOKUP[code] ?? -1;
  if (digit >= 0) {
    return digit;
  }

  // 来到数据区的等号可能在中间分组，也可能在末组的错误位置。
  if (code === 0x3d) {
    throw new TypeError(
      index < value.length - 4
        ? "base64 字符串 padding 只能出现在末个分组。"
        : "base64 字符串 padding 非法。",
    );
  }
  throw new TypeError("base64 字符串包含非法字符。");
}

/**
 * 把字节数组编码为小写十六进制字符串。
 *
 * 这里不做额外格式化，保证输出稳定，适合作为哈希文本展示或比较值。
 */
export const bytesToHex = (bytes: readonly number[] | Uint8Array): string => {
  // 直接调用转换函数也必须遵循 MD5 输入的统一字节范围约束。
  const normalizedBytes = toByteArray(bytes);
  let result = "";

  // 每个字节固定输出两位，保留前导零并统一使用小写。
  for (const byte of normalizedBytes) {
    result += byte.toString(16).padStart(2, "0");
  }

  return result;
};

/**
 * 把字节数组编码为标准 base64 字符串。
 *
 * 这里只输出 RFC 4648 标准 base64，不支持 URL-safe 变体，
 * 这样可以保证浏览器侧与 Node 侧摘要文本结果一致。
 */
export const bytesToBase64 = (bytes: readonly number[] | Uint8Array): string => {
  // 直接调用转换函数也必须遵循 MD5 输入的统一字节范围约束。
  const normalizedBytes = toByteArray(bytes);
  // 用固定上限、四字符对齐的缓冲区，限制 fromCharCode 的实参数量并在组间复用。
  const ascii = new Array<number>(Math.min(8192, Math.ceil(normalizedBytes.length / 3) * 4));
  const parts: string[] = [];
  let offset = 0;

  // 每三字节直接写入四个 ASCII 码元，末组缺失的位按零计算并用等号填充。
  for (let index = 0; index < normalizedBytes.length; index += 3) {
    const first = normalizedBytes[index] ?? 0;
    const second = normalizedBytes[index + 1];
    const third = normalizedBytes[index + 2];
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    ascii[offset++] = BASE64_ALPHABET.charCodeAt(chunk >> 18);
    ascii[offset++] = BASE64_ALPHABET.charCodeAt((chunk >> 12) & 0x3f);
    ascii[offset++] = second === undefined ? 0x3d : BASE64_ALPHABET.charCodeAt((chunk >> 6) & 0x3f);
    ascii[offset++] = third === undefined ? 0x3d : BASE64_ALPHABET.charCodeAt(chunk & 0x3f);
    if (offset === ascii.length) {
      parts.push(String.fromCharCode(...ascii));
      offset = 0;
    }
  }

  // 最后一块只转换本轮写入的码元，再一次合并所有块。
  if (offset > 0) {
    ascii.length = offset;
    parts.push(String.fromCharCode(...ascii));
  }
  return parts.join("");
};
