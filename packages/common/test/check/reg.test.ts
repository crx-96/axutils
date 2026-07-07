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
  });

  it("判断邮箱", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("user.name+tag@example.co")).toBe(true);
    expect(isEmail("user@")).toBe(false);
    expect(isEmail("@example.com")).toBe(false);
    expect(isEmail("user example.com")).toBe(false);
    expect(isEmail(null)).toBe(false);
  });

  it("主入口导出与子模块导出保持一致", () => {
    expect(isPhoneCn).toBe(isPhoneCnFromReg);
    expect(isEmail).toBe(isEmailFromReg);
  });
});
