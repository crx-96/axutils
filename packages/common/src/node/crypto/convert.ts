const HEX_PATTERN = /^[\da-f]+$/iu;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map<string, number>(
  [...BASE64_ALPHABET].map((char, index) => [char, index]),
);

export type Md5Input = string | readonly number[] | Uint8Array;
export type Md5StringEncoding = "utf8" | "hex" | "base64";

/**
 * 把 Node 侧 MD5 输入统一归一化为新的 `Uint8Array`。
 *
 * Node 目录下保留一份独立实现，避免 `node/*` 再依赖浏览器侧源码路径，
 * 使目录边界和运行时实现来源都保持清晰。
 */
export const normalizeMd5Input = (
  input: Md5Input,
  encoding: Md5StringEncoding = "utf8",
): Uint8Array => {
  if (typeof input === "string") {
    if (encoding === "utf8") {
      return new TextEncoder().encode(input);
    }
    if (encoding === "hex") {
      return decodeHex(input);
    }
    return decodeBase64(input);
  }

  return toByteArray(input);
};

/**
 * 把 `number[]` 或 `Uint8Array` 归一化成新的 `Uint8Array`。
 *
 * 这里只做字节范围与整数性校验，不负责更高层输入语义。
 */
export const toByteArray = (input: readonly number[] | Uint8Array): Uint8Array => {
  if (input instanceof Uint8Array) {
    // Uint8Array 的元素天然是 0-255 整数；slice 仍返回独立副本，避免暴露调用方存储。
    return input.slice();
  }

  for (const byte of input) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new TypeError("MD5 update 只接受 0-255 的字节值。");
    }
  }

  return Uint8Array.from(input);
};

/**
 * 把 raw 二进制字符串按字节值拆回数组。
 *
 * 这主要用于和浏览器侧保持一致的工具行为，不是通用文本解码器。
 */
export const binaryStringToBytes = (value: string): number[] =>
  Array.from(value, (char) => char.charCodeAt(0) & 0xff);

/**
 * 把连续十六进制字符串解码为字节数组。
 *
 * 不支持 `0x` 前缀、分隔符或奇数字符长度。
 */
export const decodeHex = (value: string): Uint8Array => {
  if (value.length % 2 !== 0) {
    throw new TypeError("hex 字符串长度必须为偶数。");
  }
  if (!HEX_PATTERN.test(value)) {
    throw new TypeError("hex 字符串包含非法字符。");
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
};

/**
 * 把标准 RFC 4648 base64 字符串解码为字节数组。
 *
 * 仅支持标准 base64；输入中的空白会先移除。
 */
export const decodeBase64 = (value: string): Uint8Array => {
  const sanitized = value.replace(/\s+/gu, "");

  if (sanitized.length === 0) {
    return new Uint8Array();
  }
  if (sanitized.length % 4 !== 0) {
    throw new TypeError("base64 字符串长度必须是 4 的倍数。");
  }

  const bytes: number[] = [];

  for (let index = 0; index < sanitized.length; index += 4) {
    const chars = sanitized.slice(index, index + 4);
    if (chars.includes("=") && index + 4 !== sanitized.length) {
      throw new TypeError("base64 字符串 padding 只能出现在末个分组。");
    }

    const values = [...chars].map((char, charIndex) => {
      if (char === "=") {
        if (
          charIndex < 2 ||
          !chars
            .slice(charIndex)
            .split("")
            .every((current) => current === "=")
        ) {
          throw new TypeError("base64 字符串 padding 非法。");
        }
        return 0;
      }

      const decoded = BASE64_LOOKUP.get(char);

      if (decoded === undefined) {
        throw new TypeError("base64 字符串包含非法字符。");
      }

      return decoded;
    });

    const [first, second, third, fourth] = values;

    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      fourth === undefined
    ) {
      throw new TypeError("base64 字符串分组非法。");
    }
    if (chars[2] === "=" && (second & 0b1111) !== 0) {
      throw new TypeError("base64 字符串包含非规范未使用位。");
    }
    if (chars[3] === "=" && chars[2] !== "=" && (third & 0b11) !== 0) {
      throw new TypeError("base64 字符串包含非规范未使用位。");
    }

    const chunk = (first << 18) | (second << 12) | (third << 6) | fourth;

    bytes.push((chunk >> 16) & 0xff);
    if (chars[2] !== "=") {
      bytes.push((chunk >> 8) & 0xff);
    }
    if (chars[3] !== "=") {
      bytes.push(chunk & 0xff);
    }
  }

  return Uint8Array.from(bytes);
};

/**
 * 把字节数组编码为小写十六进制字符串。
 */
export const bytesToHex = (bytes: readonly number[] | Uint8Array): string => {
  // 直接调用转换函数也必须遵循 MD5 输入的统一字节范围约束。
  const normalizedBytes = toByteArray(bytes);
  let result = "";

  for (const byte of normalizedBytes) {
    result += byte.toString(16).padStart(2, "0");
  }

  return result;
};

/**
 * 把字节数组编码为标准 base64 字符串。
 */
export const bytesToBase64 = (bytes: readonly number[] | Uint8Array): string => {
  // 直接调用转换函数也必须遵循 MD5 输入的统一字节范围约束。
  const normalizedBytes = toByteArray(bytes);
  let result = "";
  let index = 0;

  while (index < normalizedBytes.length) {
    const first = normalizedBytes[index];
    const second = normalizedBytes[index + 1];
    const third = normalizedBytes[index + 2];

    if (first === undefined) {
      break;
    }

    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    result += BASE64_ALPHABET[(chunk >> 18) & 0x3f];
    result += BASE64_ALPHABET[(chunk >> 12) & 0x3f];
    result += second === undefined ? "=" : BASE64_ALPHABET[(chunk >> 6) & 0x3f];
    result += third === undefined ? "=" : BASE64_ALPHABET[chunk & 0x3f];

    index += 3;
  }

  return result;
};
