import { createHash } from "node:crypto";

import {
  bytesToBase64,
  bytesToHex,
  type Md5Input,
  type Md5StringEncoding,
  normalizeMd5Input,
} from "./convert.js";

/**
 * Node 专用的增量 MD5 工具。
 *
 * 这里直接封装 `node:crypto` 的 `createHash("md5")`，
 * 让 Node 环境优先走内置实现，同时对外保持与浏览器侧完全一致的 API。
 */
export class Md5 {
  private declare readonly instance: ReturnType<typeof createHash>;
  private declare digestBytes: number[] | null;

  constructor() {
    this.instance = createHash("md5");
    this.digestBytes = null;
  }

  /**
   * 追加一段待计算内容。
   */
  update(input: Md5Input, encoding: Md5StringEncoding = "utf8"): this {
    if (this.digestBytes !== null) {
      throw new Error("MD5 摘要已经生成，不能继续 update。");
    }

    this.instance.update(normalizeMd5Input(input, encoding));
    return this;
  }

  /**
   * 返回摘要对应的 16 字节数组。
   */
  toBytes(): number[] {
    if (this.digestBytes === null) {
      this.digestBytes = [...this.instance.digest()];
    }

    return [...this.digestBytes];
  }

  /**
   * 返回摘要的小写十六进制字符串。
   */
  toHex(): string {
    return bytesToHex(this.toBytes());
  }

  /**
   * 返回摘要的标准 base64 字符串。
   */
  toBase64(): string {
    return bytesToBase64(this.toBytes());
  }
}

export type { Md5Input, Md5StringEncoding };
