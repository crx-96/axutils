import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  normalizeMd5Input as normalizeBrowserInput,
  toByteArray as toBrowserByteArray,
} from "../../src/crypto/convert.js";
import { Md5 as BrowserMd5 } from "../../src/crypto/md5.js";
import {
  normalizeMd5Input as normalizeNodeInput,
  toByteArray as toNodeByteArray,
} from "../../src/node/crypto/convert.js";
import { Md5 as NodeMd5 } from "../../src/node/crypto/md5.js";

const byteInputs = [
  { create: () => Buffer.from([97, 98, 99]), name: "Buffer" },
  {
    create: () => Buffer.from([255, 97, 98, 99, 255]).subarray(1, 4),
    name: "Buffer.subarray",
  },
  {
    create: () => new Uint8Array([255, 97, 98, 99, 255]).subarray(1, 4),
    name: "Uint8Array.subarray",
  },
  {
    create: () => new Uint8Array(new Uint8Array([255, 97, 98, 99, 255]).buffer, 1, 3),
    name: "带偏移的 Uint8Array",
  },
  {
    create: () =>
      runInNewContext("new Uint8Array([255, 97, 98, 99, 255]).subarray(1, 4)") as Uint8Array,
    name: "跨 Realm 的字节视图",
  },
];

describe.each([
  { name: "浏览器", normalize: normalizeBrowserInput, toBytes: toBrowserByteArray },
  { name: "Node", normalize: normalizeNodeInput, toBytes: toNodeByteArray },
])("$name 字节归一化", ({ normalize, toBytes }) => {
  it.each(byteInputs)("$name 只复制有效字节且不与输入共享底层缓冲区", ({ create }) => {
    for (const convert of [normalize, toBytes]) {
      const input = create();
      const copy = convert(input);

      expect([...copy]).toEqual([97, 98, 99]);
      expect(Object.getPrototypeOf(copy)).toBe(Uint8Array.prototype);
      expect(copy.buffer).not.toBe(input.buffer);
      expect(copy.byteOffset).toBe(0);
      expect(copy.buffer.byteLength).toBe(copy.byteLength);

      input[0] = 0;
      expect(copy[0]).toBe(97);
      copy[1] = 0;
      expect(input[1]).toBe(98);
    }
  });

  it("空字节视图也返回独立且长度为零的完整缓冲区", () => {
    const backing = new Uint8Array([1, 2, 3]);
    const empty = backing.subarray(1, 1);
    for (const convert of [normalize, toBytes]) {
      const copy = convert(empty);
      expect([...copy]).toEqual([]);
      expect(copy.buffer).not.toBe(empty.buffer);
      expect(copy.byteOffset).toBe(0);
      expect(copy.buffer.byteLength).toBe(0);
    }
  });
});

describe.each([
  { Md5: BrowserMd5, name: "浏览器" },
  { Md5: NodeMd5, name: "Node" },
])("$name MD5 二进制输入", ({ Md5 }) => {
  it.each(byteInputs)("$name 摘要忽略视图外字节且不受后续输入修改影响", ({ create }) => {
    const input = create();
    const digest = new Md5().update(input);
    input.fill(0);

    expect(digest.toHex()).toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  it("空字符串、空数组和空 Buffer 的摘要一致", () => {
    const emptyDigest = "d41d8cd98f00b204e9800998ecf8427e";
    expect(new Md5().update("").toHex()).toBe(emptyDigest);
    expect(new Md5().update([]).toHex()).toBe(emptyDigest);
    expect(new Md5().update(new Uint8Array()).toHex()).toBe(emptyDigest);
    expect(new Md5().update(Buffer.alloc(0)).toHex()).toBe(emptyDigest);
  });

  it("跨越 MD5 的 64 字节分组边界时分块更新与完整输入一致", () => {
    const input = Buffer.from(Array.from({ length: 257 }, (_, index) => index % 256));
    const expected = createHash("md5").update(input).digest("hex");
    const chunks = new Md5();
    const boundaries = [0, 1, 63, 64, 127, 255, input.length];
    let start = 0;
    for (const end of boundaries) {
      chunks.update(input.subarray(start, end));
      start = end;
    }

    expect(chunks.toHex()).toBe(expected);
    expect(new Md5().update(input).toHex()).toBe(expected);
  });
});
