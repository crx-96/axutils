import { describe, expect, it } from "vitest";

import { isEmail as isEmailFromReg, isPhoneCn as isPhoneCnFromReg } from "../../src/check/reg";
import { isEmail, isPhoneCn } from "../../src/index";

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

  it("主入口导出与子模块导出保持一致", () => {
    expect(isPhoneCn).toBe(isPhoneCnFromReg);
    expect(isEmail).toBe(isEmailFromReg);
  });
});
