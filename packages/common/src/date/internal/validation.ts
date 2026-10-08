/** 以统一的 RangeError 通道报告日期、时间或时长参数错误。 */
export function invalid(message = "无效的日期或时间输入"): never {
  throw new RangeError(message);
}

/** 校验字段为有限整数，并返回原值供后续计算使用。 */
export function assertInteger(value: number, name: string): number {
  // 不接受隐式数值转换，避免字符串、NaN 或小数进入日历与毫秒运算。
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    invalid(`${name} 必须是有限整数`);
  }
  return value;
}

/** 校验字段为有限数字；允许小数的内部数值边界可以使用此检查。 */
export function assertFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    invalid(`${name} 必须是有限数字`);
  }
  return value;
}

/** 校验绝对时间点的整数毫秒及 Date 范围；构造和运算结果使用同一边界。 */
export function toEpochMilliseconds(value: number): number {
  // 保留 Instant 原有的整数校验错误文本，多个时间点入口共用同一失败通道。
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    invalid("epoch 毫秒必须是有限整数");
  }
  // 有限整数仍可能超出 Date 可表示范围，不能让无效结果流入后续格式化或比较。
  if (!Number.isFinite(new Date(value).getTime())) {
    invalid("epoch 毫秒超出 Date 可表示范围");
  }
  return value;
}
