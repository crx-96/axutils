import {
  DURATION_UNITS,
  millisecondsToDuration,
  readDuration,
  totalDurationMilliseconds,
} from "./internal/duration.js";
import { assertInteger } from "./internal/validation.js";
import type { DurationFields } from "./types.js";

/** 在独立快照上变换每个已给值的字段，保留缺省字段和单位。 */
function mapFields(fields: DurationFields, mapper: (value: number) => number): DurationFields {
  const result = readDuration(fields);
  for (const unit of DURATION_UNITS) {
    const value = result[unit];
    if (value !== undefined) result[unit] = mapper(value);
  }
  return result;
}

/** 逐单位合并两个已校验的快照，不跨单位进位；校验结果仍为有限整数并归一化 -0。 */
function combine(first: DurationFields, second: DurationFields, direction: 1 | -1): DurationFields {
  const left = readDuration(first);
  const right = readDuration(second);
  const result: DurationFields = {};
  for (const unit of DURATION_UNITS) {
    if (left[unit] !== undefined || right[unit] !== undefined) {
      const sum = (left[unit] ?? 0) + direction * (right[unit] ?? 0);
      const validated = assertInteger(sum, unit);
      result[unit] = validated === 0 ? 0 : validated;
    }
  }
  return result;
}

/** Temporal.Duration 风格的轻量时间长度命名空间。 */
// biome-ignore assist/source/useSortedKeys: 保留公开命名空间的成员枚举顺序。
export const Duration = {
  /** 创建七种支持单位的字段副本，继承或非枚举 getter 也只读取一次。 */
  from(fields: DurationFields): DurationFields {
    return readDuration(fields);
  },

  /** 将整数毫秒拆成天至毫秒，并在最前面显式补齐年月。 */
  fromMilliseconds(milliseconds: number): DurationFields {
    // biome-ignore assist/source/useSortedKeys: 保留从年到毫秒的字段顺序。
    return {
      years: 0,
      months: 0,
      ...millisecondsToDuration(assertInteger(milliseconds, "milliseconds")),
    };
  },

  /** 将不含非零年月的有限整数时长展开为毫秒。 */
  totalMilliseconds(fields: DurationFields): number {
    return totalDurationMilliseconds(fields);
  },

  /** 对每个已存在字段取反，不进行跨字段借位或归约，零值保持 +0。 */
  negated(fields: DurationFields): DurationFields {
    return mapFields(fields, (value) => (value === 0 ? 0 : -value));
  },

  /** 对每个已存在字段独立取绝对值，允许混合符号。 */
  abs(fields: DurationFields): DurationFields {
    return mapFields(fields, Math.abs);
  },

  /** 对应字段相加，只要任一输入含有该单位就保留该字段。 */
  add(first: DurationFields, second: DurationFields): DurationFields {
    return combine(first, second, 1);
  },

  /** 对应字段相减，不进行跨字段借位或归约。 */
  subtract(first: DurationFields, second: DurationFields): DurationFields {
    return combine(first, second, -1);
  },
};

export type { DurationFields } from "./types.js";
