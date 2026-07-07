import { isEmail as isEmailFromEntry, isNumber as isNumberFromEntry } from "@axutils/common";
import {
  isEmail as isEmailFromReg,
  isPhoneCn as isPhoneCnFromReg,
} from "@axutils/common/check/reg";
import {
  isArray as isArrayFromType,
  isBoolean as isBooleanFromType,
} from "@axutils/common/check/type";

if (!isNumberFromEntry(1) || isNumberFromEntry(NaN)) {
  throw new Error("ESM 主入口类型判断验证失败。");
}

if (!isEmailFromEntry("esm@example.com")) {
  throw new Error("ESM 主入口正则判断验证失败。");
}

if (!isArrayFromType(["esm"]) || !isBooleanFromType(true)) {
  throw new Error("ESM type 子路径导入验证失败。");
}

if (!isPhoneCnFromReg("13800138000") || !isEmailFromReg("reg@example.com")) {
  throw new Error("ESM reg 子路径导入验证失败。");
}
