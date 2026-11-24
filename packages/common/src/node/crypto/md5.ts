import { createHash } from "node:crypto";

import { Md5InputStream } from "../../internal/crypto/md5-input-stream.js";
import { type Md5Input, type Md5StringEncoding, bytesToBase64, bytesToHex } from "./convert.js";

/**
 * Node 专用的增量 MD5 工具。
 *
 * 这里直接封装 `node:crypto` 的 `createHash("md5")`，
 * 让 Node 环境优先走内置实现，同时对外保持与浏览器侧完全一致的 API。
 */
export class Md5 {
  /** 处理已编码字节的 Node 原生摘要后端。 */
  declare private readonly instance: ReturnType<typeof createHash>;
  /** 当前摘要独占的分块编码状态。 */
  declare private readonly inputStream: Md5InputStream;
  /** 首次完成摘要时缓存的字节，null 表示仍可追加输入。 */
  declare private digestBytes: number[] | null;

  /** 创建一个空摘要，将输入流的字节按顺序传给原生 Hash。 */
  constructor() {
    this.instance = createHash("md5");
    this.inputStream = new Md5InputStream((bytes) => this.instance.update(bytes));
    this.digestBytes = null;
  }

  /**
   * 追加一段待计算内容。
   */
  update(input: Md5Input, encoding: Md5StringEncoding = "utf8"): this {
    if (this.digestBytes !== null) {
      throw new Error("MD5 摘要已经生成，不能继续 update。");
    }

    // 与通用后端共用文本和字节的分块边界。
    this.inputStream.update(input, encoding);
    return this;
  }

  /**
   * 返回摘要对应的 16 字节数组。
   */
  toBytes(): number[] {
    if (this.digestBytes === null) {
      // 先处理尾部孤立代理项，再固定摘要，后续读取仅复制缓存。
      this.inputStream.flush();
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
