export function invalid(message = "无效的日期或时间输入"): never {
  throw new RangeError(message);
}

export function assertInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    invalid(`${name} 必须是有限整数`);
  }
  return value;
}

export function assertFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    invalid(`${name} 必须是有限数字`);
  }
  return value;
}
