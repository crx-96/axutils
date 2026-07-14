import { assertFinite, invalid } from "./internal";
import type { DurationFields } from "./types";

const FIELD_NAMES = [
  "years",
  "months",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
] as const;
function validateFields(fields: DurationFields): void {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) {
    invalid("Duration 必须由字段对象构造");
  }
  for (const name of FIELD_NAMES) {
    const value = fields[name];
    if (value !== undefined) {
      assertFinite(value, name);
      if (!Number.isInteger(value)) {
        invalid(`${name} 必须是有限整数`);
      }
    }
  }
}

function mapFields(fields: DurationFields, mapper: (value: number) => number): DurationFields {
  validateFields(fields);
  const result: DurationFields = {};
  for (const name of FIELD_NAMES) {
    if (fields[name] !== undefined) {
      result[name] = mapper(fields[name] as number);
    }
  }
  return result;
}

/** Temporal.Duration 风格的轻量时间长度命名空间；from/add/subtract 不会自动归约字段。 */
export const Duration = {
  /** 从字段对象创建 Duration，未传入的字段不会被补入结果。 */
  from(fields: DurationFields): DurationFields {
    validateFields(fields);
    return { ...fields };
  },

  /** 将毫秒拆解为天、小时、分钟、秒和毫秒，并显式补齐所有字段。 */
  fromMilliseconds(milliseconds: number): DurationFields {
    validateFields({ milliseconds });
    const sign = milliseconds < 0 ? -1 : 1;
    let remaining = Math.abs(milliseconds);
    const days = Math.floor(remaining / 86_400_000);
    remaining -= days * 86_400_000;
    const hours = Math.floor(remaining / 3_600_000);
    remaining -= hours * 3_600_000;
    const minutes = Math.floor(remaining / 60_000);
    remaining -= minutes * 60_000;
    const seconds = Math.floor(remaining / 1_000);
    remaining -= seconds * 1_000;
    return {
      years: 0,
      months: 0,
      days: days * sign,
      hours: hours * sign,
      minutes: minutes * sign,
      seconds: seconds * sign,
      milliseconds: remaining * sign,
    };
  },

  /** 将不含 years/months 的 Duration 展开为毫秒。 */
  totalMilliseconds(fields: DurationFields): number {
    validateFields(fields);
    if ((fields.years ?? 0) !== 0 || (fields.months ?? 0) !== 0) {
      invalid("无法将 years 或 months 精确换算为毫秒");
    }
    return (
      (fields.days ?? 0) * 86_400_000 +
      (fields.hours ?? 0) * 3_600_000 +
      (fields.minutes ?? 0) * 60_000 +
      (fields.seconds ?? 0) * 1_000 +
      (fields.milliseconds ?? 0)
    );
  },

  /** 对每个已存在字段取反，不进行跨字段借位或归约。 */
  negated(fields: DurationFields): DurationFields {
    return mapFields(fields, (value) => -value);
  },

  /**
   * 对每个已存在字段独立取绝对值，不进行跨字段归约或统一符号处理。
   * 因此混合符号输入会逐字段变为正数，例如 { days: -1, hours: 2 } 变为 { days: 1, hours: 2 }。
   */
  abs(fields: DurationFields): DurationFields {
    return mapFields(fields, Math.abs);
  },

  /** 对应字段直接相加；只要任一输入含有该字段，结果就保留该字段。 */
  add(first: DurationFields, second: DurationFields): DurationFields {
    validateFields(first);
    validateFields(second);
    const result: DurationFields = {};
    for (const name of FIELD_NAMES) {
      if (first[name] !== undefined || second[name] !== undefined) {
        result[name] = (first[name] ?? 0) + (second[name] ?? 0);
      }
    }
    return result;
  },

  /** 对应字段直接相减；不进行跨字段借位或归约。 */
  subtract(first: DurationFields, second: DurationFields): DurationFields {
    validateFields(first);
    validateFields(second);
    const result: DurationFields = {};
    for (const name of FIELD_NAMES) {
      if (first[name] !== undefined || second[name] !== undefined) {
        result[name] = (first[name] ?? 0) - (second[name] ?? 0);
      }
    }
    return result;
  },
};

export type { DurationFields } from "./types";
