import { type Md5Input, type Md5StringEncoding, normalizeMd5Input } from "./convert.js";

/** 为单个摘要实例编码输入块，允许连续 UTF-8 文本在代理对中间分块。 */
export class Md5InputStream {
  /** 上一个 UTF-8 块末尾待配对的高代理项，空串表示没有待处理的码元。 */
  private pendingHigh = "";
  /** 按输入顺序把已经确定的字节交给当前摘要后端。 */
  declare private readonly append: (bytes: Uint8Array) => void;

  /** 绑定本实例的字节接收端，每个新摘要都有独立的待配对状态。 */
  constructor(append: (bytes: Uint8Array) => void) {
    this.append = append;
  }

  /** 处理一个输入块，字节输入或其他编码结束当前的 UTF-8 文本段。 */
  update(input: Md5Input, encoding: Md5StringEncoding): void {
    if (typeof input !== "string" || encoding !== "utf8") {
      // 先校验新块，失败时保留此前的输入状态，调用者可以纠正后继续追加。
      const bytes = normalizeMd5Input(input, encoding);
      this.flush();
      this.append(bytes);
      return;
    }
    if (input.length === 0) {
      return;
    }

    // 编码器会处理段内所有完整或孤立的代理项，只有最后一个高代理项可能属于下一块。
    const text = this.pendingHigh + input;
    const last = text.charCodeAt(text.length - 1);
    const endsWithHigh = last >= 0xd800 && last <= 0xdbff;
    const ready = endsWithHigh ? text.slice(0, -1) : text;
    if (ready.length > 0) {
      this.append(normalizeMd5Input(ready));
    }
    this.pendingHigh = endsWithHigh ? String.fromCharCode(last) : "";
  }

  /** 编码切换或生成摘要时，将尾部孤立的高代理项按 UTF-8 的 U+FFFD 写入一次。 */
  flush(): void {
    if (this.pendingHigh) {
      this.append(normalizeMd5Input(this.pendingHigh));
      this.pendingHigh = "";
    }
  }
}
