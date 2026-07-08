import { describe, expect, it } from "vitest";

import {
  isEmail as isEmailFromReg,
  isHexColor as isHexColorFromReg,
  isHttpUrl as isHttpUrlFromReg,
  isIdCardCn as isIdCardCnFromReg,
  isIpv4 as isIpv4FromReg,
  isPhoneCn as isPhoneCnFromReg,
} from "../../src/check/reg";
import { isEmail, isHexColor, isHttpUrl, isIdCardCn, isIpv4, isPhoneCn } from "../../src/index";

describe("reg", () => {
  it("判断中国大陆手机号", () => {
    expect(isPhoneCn("13800138000")).toBe(true);
    expect(isPhoneCn("12800138000")).toBe(false);
    expect(isPhoneCn("1380013800")).toBe(false);
    expect(isPhoneCn("+8613800138000")).toBe(false);
    expect(isPhoneCn(13800138000)).toBe(false);
    // 第二位边界：2 不在 3-9 范围内，9 在范围内
    expect(isPhoneCn("12000000000")).toBe(false);
    expect(isPhoneCn("19000000000")).toBe(true);
    // 含字母、首位非 1
    expect(isPhoneCn("1380013800a")).toBe(false);
    expect(isPhoneCn("0013800138000")).toBe(false);
    // 空串、undefined
    expect(isPhoneCn("")).toBe(false);
    expect(isPhoneCn(undefined)).toBe(false);
  });

  it("判断邮箱", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("user.name+tag@example.co")).toBe(true);
    expect(isEmail("user@")).toBe(false);
    expect(isEmail("@example.com")).toBe(false);
    expect(isEmail("user example.com")).toBe(false);
    expect(isEmail(null)).toBe(false);
    // 点的位置约束：不允许连续点、首尾点、空 label
    expect(isEmail("a@b.c.")).toBe(false);
    expect(isEmail(".a@b.c")).toBe(false);
    expect(isEmail("a..b@c.d")).toBe(false);
    expect(isEmail("a@b..c")).toBe(false);
    expect(isEmail("a@.c")).toBe(false);
    // 空串、undefined
    expect(isEmail("")).toBe(false);
    expect(isEmail(undefined)).toBe(false);
  });

  it("判断 http(s) URL", () => {
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("https://example.com/path?q=1")).toBe(true);
    expect(isHttpUrl("http://localhost:3000")).toBe(true);
    // 非 http(s) 协议
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("ws://example.com")).toBe(false);
    // 缺少协议头
    expect(isHttpUrl("example.com")).toBe(false);
    // 协议头后无主机内容
    expect(isHttpUrl("http://")).toBe(false);
    // 非字符串
    expect(isHttpUrl(123)).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });

  it("判断 IPv4 地址", () => {
    expect(isIpv4("0.0.0.0")).toBe(true);
    expect(isIpv4("255.255.255.255")).toBe(true);
    expect(isIpv4("192.168.1.1")).toBe(true);
    // 超出 0-255 范围
    expect(isIpv4("256.1.1.1")).toBe(false);
    // 前导零
    expect(isIpv4("01.1.1.1")).toBe(false);
    // 段数不对
    expect(isIpv4("1.1.1")).toBe(false);
    expect(isIpv4("1.1.1.1.1")).toBe(false);
    // 非数字字符
    expect(isIpv4("a.b.c.d")).toBe(false);
    // 空串、undefined
    expect(isIpv4("")).toBe(false);
    expect(isIpv4(undefined)).toBe(false);
  });

  it("判断中国大陆 18 位身份证号", () => {
    // 合法号码（末位校验码 X）
    expect(isIdCardCn("11010519491231002X")).toBe(true);
    // 末位校验码错误
    expect(isIdCardCn("110105194912310021")).toBe(false);
    // 末位小写 x 同样通过
    expect(isIdCardCn("11010519491231002x")).toBe(true);
    // 长度不对
    expect(isIdCardCn("11010519491231002")).toBe(false);
    expect(isIdCardCn("1101051949123100221")).toBe(false);
    // 非末位出现字母
    expect(isIdCardCn("11010519491231X002")).toBe(false);
    // 空串、undefined
    expect(isIdCardCn("")).toBe(false);
    expect(isIdCardCn(undefined)).toBe(false);
  });

  it("判断十六进制颜色值", () => {
    // 3 位简写
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#FFF")).toBe(true);
    // 6 位完整写法
    expect(isHexColor("#ffffff")).toBe(true);
    expect(isHexColor("#1a2B3c")).toBe(true);
    // 缺少 #
    expect(isHexColor("fff")).toBe(false);
    // 4 位 / 8 位（alpha 通道）不支持
    expect(isHexColor("#ffff")).toBe(false);
    expect(isHexColor("#ffffffff")).toBe(false);
    // 非法字符
    expect(isHexColor("#ggg")).toBe(false);
    // 长度不对
    expect(isHexColor("#1234567")).toBe(false);
    // 空串、undefined
    expect(isHexColor("")).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });

  it("主入口导出与子模块导出保持一致", () => {
    expect(isPhoneCn).toBe(isPhoneCnFromReg);
    expect(isEmail).toBe(isEmailFromReg);
    expect(isHttpUrl).toBe(isHttpUrlFromReg);
    expect(isIpv4).toBe(isIpv4FromReg);
    expect(isIdCardCn).toBe(isIdCardCnFromReg);
    expect(isHexColor).toBe(isHexColorFromReg);
  });
});
