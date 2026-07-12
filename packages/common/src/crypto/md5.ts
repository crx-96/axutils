import SparkMD5 from "spark-md5";

import {
  binaryStringToBytes,
  bytesToBase64,
  bytesToHex,
  type Md5Input,
  type Md5StringEncoding,
  normalizeMd5Input,
} from "./convert.js";

/**
 * 浏览器/通用侧的增量 MD5 工具。
 *
 * 底层基于 spark-md5 的 ArrayBuffer 实现，避免把输入先转成“二进制字符串”再参与计算，
 * 这样更适合处理 `Uint8Array`、hex/base64 解码后的原始字节，以及 UTF-8 文本输入。
 *
 * 依赖说明：使用本类需要安装 peer 依赖 `spark-md5`（`npm i spark-md5`）。
 * 不使用 `@axutils/common/crypto/md5` 子路径的用户无需安装。
 * Node 侧可使用 `@axutils/common/node/crypto/md5`，基于 `node:crypto`，无需额外依赖。
 */
export class Md5 {
  private declare readonly instance: InstanceType<typeof SparkMD5.ArrayBuffer>;
  private declare digestBytes: number[] | null;

  constructor() {
    this.instance = new SparkMD5.ArrayBuffer();
    this.digestBytes = null;
  }

  /**
   * 追加一段待计算内容。
   *
   * 支持字符串、number[] 和 Uint8Array。
   * 对字符串输入，默认按 UTF-8 编码，也可显式指定 hex 或 base64。
   */
  update(input: Md5Input, encoding: Md5StringEncoding = "utf8"): this {
    if (this.digestBytes !== null) {
      throw new Error("MD5 摘要已经生成，不能继续 update。");
    }

    const bytes = normalizeMd5Input(input, encoding);
    // normalizeMd5Input 始终返回覆盖完整底层 buffer 的新 Uint8Array，因此这里无需再次复制。
    this.instance.append(bytes.buffer as ArrayBuffer);
    return this;
  }

  /**
   * 返回摘要对应的 16 字节数组。
   *
   * 首次调用时会完成摘要计算并缓存结果；之后重复调用直接复用缓存，
   * 避免重复 digest，同时也保证 toHex/toBase64 与 toBytes 始终来自同一份摘要。
   */
  toBytes(): number[] {
    if (this.digestBytes === null) {
      this.digestBytes = binaryStringToBytes(this.instance.end(true));
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
