/** 对已执行 toJSON 的非数组对象按原生规则拆箱；普通对象不会读取业务字段。 */
export function stringifyBoxedValue(value: object): string | undefined {
  const scalar = JSON.stringify({ toJSON: () => value }, []);
  return scalar === "{}" ? undefined : scalar;
}
