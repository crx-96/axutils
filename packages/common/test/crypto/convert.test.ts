import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import * as browserConvert from "../../src/crypto/convert.js";
import { Md5 as BrowserMd5 } from "../../src/crypto/md5.js";
import * as nodeConvert from "../../src/node/crypto/convert.js";
import { Md5 as NodeMd5 } from "../../src/node/crypto/md5.js";

describe.each([
  { convert: browserConvert, Md5: BrowserMd5, name: "通用" },
  { convert: nodeConvert, Md5: NodeMd5, name: "Node" },
])("$name 编码边界", ({ convert, Md5 }) => {
  it("空字节与空 hex 可以往返，结果为独立 Uint8Array", () => {
    const input = new Uint8Array();
    const output = convert.decodeHex(convert.bytesToHex(input));
    expect(output).toEqual(input);
    expect(output.buffer).not.toBe(input.buffer);
    expect(convert.normalizeMd5Input("", "hex")).toEqual(input);
  });

  it("raw 字符串按 UTF-16 码元取低字节，包括成对和孤立的代理项", () => {
    expect(convert.binaryStringToBytes("\u0000\u01ff\u{1d11e}\ud8ff")).toEqual([
      0, 255, 52, 30, 255,
    ]);
  });

  it("Base64 对空输入和三种尾组长度均与标准编码一致", () => {
    const input = Buffer.from([0, 127, 255, 251, 255]);
    for (let length = 0; length <= input.length; length++) {
      const bytes = input.subarray(0, length);
      const expected = bytes.toString("base64");
      expect(convert.bytesToBase64(bytes)).toBe(expected);
      expect(convert.decodeBase64(expected.split("").join("\u00a0\t"))).toEqual(
        new Uint8Array(bytes),
      );
    }
  });

  it("1 MiB 字节视图的 Base64 编解码与独立实现一致", () => {
    const backing = Buffer.alloc(1024 * 1024 + 2);
    const bytes = backing.subarray(1, -1);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
    const expected = bytes.toString("base64");
    expect(convert.bytesToBase64(bytes)).toBe(expected);
    expect(bytes.equals(convert.decodeBase64(expected))).toBe(true);
  });

  it("严格拒绝错位或过多的 padding、URL-safe 和非 ASCII 字符", () => {
    for (const invalid of [
      "=AAA",
      "A=AA",
      "AA=A",
      "A===",
      "====",
      "AA==AAAA",
      "AA-_",
      "\u0141AAA",
      "AA\u{1d11e}",
    ]) {
      expect(() => convert.decodeBase64(invalid)).toThrow(TypeError);
    }
  });

  it("JavaScript 调用者提供未知字符串编码时抛 TypeError", () => {
    expect(() => {
      // @ts-expect-error 模拟没有 TypeScript 约束的调用者。
      convert.normalizeMd5Input("YQ==", "typo");
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error 摘要入口也必须执行相同的运行时编码校验。
      new Md5().update("YQ==", "typo");
    }).toThrow(TypeError);
  });

  it("空 hex、Base64 和 UTF-8 文本生成同一空摘要", () => {
    const expected = new Md5().update("").toHex();
    expect(new Md5().update("", "hex").toHex()).toBe(expected);
    expect(new Md5().update("", "base64").toHex()).toBe(expected);
  });

  it("数组访问器只读取一次，校验和复制使用同一个字节值", () => {
    for (const toBytes of [convert.toByteArray, convert.normalizeMd5Input]) {
      let reads = 0;
      const input: number[] = [];
      Object.defineProperty(input, "0", {
        enumerable: true,
        get: () => (++reads === 1 ? 1 : 256),
      });
      expect([...toBytes(input)]).toEqual([1]);
      expect(reads).toBe(1);
    }
  });

  it.each([123, false, {}, { 0: 65, length: 1 }])("拒绝非迭代字节输入 %j", (input) => {
    for (const convertBytes of [
      convert.toByteArray,
      convert.normalizeMd5Input,
      convert.bytesToHex,
      convert.bytesToBase64,
    ]) {
      expect(() => {
        // @ts-expect-error 模拟 JavaScript 调用者提供超出公开输入类型的值。
        convertBytes(input);
      }).toThrow(TypeError);
    }
    expect(() => {
      // @ts-expect-error 摘要也应拒绝非迭代输入，不能静默生成空摘要。
      new Md5().update(input);
    }).toThrow(TypeError);
  });
});
