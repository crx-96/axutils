import { describe, expect, it } from "vitest";
import {
  binaryStringToBytes as binaryStringToBytesFromBrowser,
  bytesToBase64 as bytesToBase64FromBrowser,
  bytesToHex as bytesToHexFromBrowser,
  decodeBase64 as decodeBase64FromBrowser,
  decodeHex as decodeHexFromBrowser,
  normalizeMd5Input as normalizeMd5InputFromBrowser,
} from "../../src/crypto/convert";
import { Md5 as BrowserMd5 } from "../../src/crypto/md5";
import * as CommonEntry from "../../src/index";
import {
  binaryStringToBytes as binaryStringToBytesFromNode,
  bytesToBase64 as bytesToBase64FromNode,
  bytesToHex as bytesToHexFromNode,
  decodeBase64 as decodeBase64FromNode,
  decodeHex as decodeHexFromNode,
  normalizeMd5Input as normalizeMd5InputFromNode,
} from "../../src/node/crypto/convert";
import { Md5 as NodeMd5 } from "../../src/node/crypto/md5";

describe("crypto/md5", () => {
  it("浏览器实现支持空串和常见文本的 md5 摘要", () => {
    expect(new BrowserMd5().update("").toHex()).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(new BrowserMd5().update("hello").toHex()).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(new BrowserMd5().update("你好").toHex()).toBe("7eca689f0d3389d9dea66ae112e5cfd7");
  });

  it("支持链式 update，并且多次 update 与一次输入结果一致", () => {
    const chained = new BrowserMd5().update("he").update("ll").update("o");

    expect(chained.toHex()).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(new BrowserMd5().update("hello").toHex()).toBe(chained.toHex());
  });

  it("支持 Uint8Array 和 number[] 输入", () => {
    const bytes = [104, 101, 108, 108, 111];

    expect(new BrowserMd5().update(bytes).toHex()).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(new BrowserMd5().update(new Uint8Array(bytes)).toHex()).toBe(
      "5d41402abc4b2a76b9719d911017c592",
    );
  });

  it("支持 utf8、hex、base64 字符串输入编码", () => {
    expect(new BrowserMd5().update("hello", "utf8").toHex()).toBe(
      "5d41402abc4b2a76b9719d911017c592",
    );
    expect(new BrowserMd5().update("68656c6c6f", "hex").toHex()).toBe(
      "5d41402abc4b2a76b9719d911017c592",
    );
    expect(new BrowserMd5().update("aGVsbG8=", "base64").toHex()).toBe(
      "5d41402abc4b2a76b9719d911017c592",
    );
  });

  it("toBytes、toHex、toBase64 基于同一摘要返回稳定结果", () => {
    const md5 = new BrowserMd5().update("hello");

    expect(md5.toBytes()).toEqual([
      93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146,
    ]);
    expect(md5.toHex()).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(md5.toBase64()).toBe("XUFAKrxLKna5cZ2REBfFkg==");
    expect(md5.toHex()).toBe("5d41402abc4b2a76b9719d911017c592");
  });

  it("摘要生成后再次 update 会抛错", () => {
    const md5 = new BrowserMd5().update("hello");

    expect(md5.toHex()).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(() => md5.update("world")).toThrow(/摘要|final/i);
  });

  it("非法字节数组会抛错", () => {
    expect(() => new BrowserMd5().update([-1])).toThrow(/字节|byte/i);
    expect(() => new BrowserMd5().update([256])).toThrow(/字节|byte/i);
    expect(() => new BrowserMd5().update([1.5])).toThrow(/字节|byte/i);
  });

  it("convert 子路径导出的 bytesToHex 和 bytesToBase64 在浏览器与 Node 中保持一致", () => {
    const bytes = new Uint8Array([
      93, 65, 64, 42, 188, 75, 42, 118, 185, 113, 157, 145, 16, 23, 197, 146,
    ]);

    expect(bytesToHexFromBrowser(bytes)).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(bytesToBase64FromBrowser(bytes)).toBe("XUFAKrxLKna5cZ2REBfFkg==");
    expect(bytesToHexFromNode(bytes)).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(bytesToBase64FromNode(bytes)).toBe("XUFAKrxLKna5cZ2REBfFkg==");
  });

  it("直接编码时会拒绝范围外或非整数的字节", () => {
    const invalidBytes = [[-1], [256], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]];
    const encoders = [
      bytesToHexFromBrowser,
      bytesToBase64FromBrowser,
      bytesToHexFromNode,
      bytesToBase64FromNode,
    ];

    for (const encoder of encoders) {
      for (const bytes of invalidBytes) {
        expect(() => encoder(bytes)).toThrow(TypeError);
      }
    }
  });

  it("Node 实现与浏览器实现对同一输入结果一致", () => {
    const browserMd5 = new BrowserMd5().update("你好");
    const nodeMd5 = new NodeMd5().update("你好");

    expect(nodeMd5.toHex()).toBe(browserMd5.toHex());
    expect(nodeMd5.toBase64()).toBe(browserMd5.toBase64());
    expect(nodeMd5.toBytes()).toEqual(browserMd5.toBytes());
  });

  it("convert 子路径直接暴露 binaryStringToBytes、decodeHex、decodeBase64 与 normalizeMd5Input", () => {
    expect(binaryStringToBytesFromBrowser("\x5dA")).toEqual([93, 65]);
    expect(binaryStringToBytesFromNode("\x5dA")).toEqual([93, 65]);

    expect([...decodeHexFromBrowser("68656c6c6f")]).toEqual([104, 101, 108, 108, 111]);
    expect([...decodeHexFromNode("68656c6c6f")]).toEqual([104, 101, 108, 108, 111]);

    expect([...decodeBase64FromBrowser("aGVsbG8=")]).toEqual([104, 101, 108, 108, 111]);
    expect([...decodeBase64FromNode("aGVsbG8=")]).toEqual([104, 101, 108, 108, 111]);

    expect([...normalizeMd5InputFromBrowser("hello")]).toEqual([104, 101, 108, 108, 111]);
    expect([...normalizeMd5InputFromNode("hello", "utf8")]).toEqual([104, 101, 108, 108, 111]);
    expect([...normalizeMd5InputFromBrowser("68656c6c6f", "hex")]).toEqual([
      104, 101, 108, 108, 111,
    ]);
    expect([...normalizeMd5InputFromNode("aGVsbG8=", "base64")]).toEqual([104, 101, 108, 108, 111]);
  });

  it("非法 hex 和 base64 输入会抛错", () => {
    expect(() => decodeHexFromBrowser("abc")).toThrow(/hex/i);
    expect(() => decodeHexFromNode("zz")).toThrow(/hex/i);
    expect(() => decodeBase64FromBrowser("abc")).toThrow(/base64/i);
    expect(() => decodeBase64FromNode("ab=c")).toThrow(/base64|padding/i);
  });

  it("base64 解码允许空白，但拒绝非末组填充、尾随数据和非规范未使用位", () => {
    const decoders = [decodeBase64FromBrowser, decodeBase64FromNode];
    const invalidBase64 = ["TQ==TQ==", "TQ==AAAA", "TR==", "TWF="];

    for (const decode of decoders) {
      expect([...decode("\n TWE= \t")]).toEqual([77, 97]);

      for (const value of invalidBase64) {
        expect(() => decode(value)).toThrow(TypeError);
      }
    }
  });

  it("主入口不导出 md5 API，保持按需安装模式", () => {
    expect(Object.keys(CommonEntry)).not.toContain("Md5");
    expect(Object.keys(CommonEntry)).not.toContain("bytesToHex");
    expect(Object.keys(CommonEntry)).not.toContain("bytesToBase64");
  });
});
