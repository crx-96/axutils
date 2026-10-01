/** 为真实包名生成 ESM/CJS 消费代码，不依赖仓库源码别名。 */
export function consumerTypes(manifest, subpaths, format) {
  const statements = subpaths.map((key, index) => {
    const name = key === "." ? manifest.name : manifest.name + key.slice(1);
    return format === "mts"
      ? `import * as api${index} from ${JSON.stringify(name)};`
      : `import api${index} = require(${JSON.stringify(name)});`;
  });
  subpaths.forEach((key, index) => {
    const api = `api${index}`;
    statements.push(`void ${api};`);
    if (key === ".") {
      statements.push(
        `const copy = ${api}.deepClone({ value: 1 });`,
        "const numeric: number = copy.value; void numeric;",
        `const options: ${api}.StorageOptions = { prefix: "typed" };`,
        `const store = new ${api}.StorageUtils(options);`,
        'const stored: { value: number } | null = store.get<{ value: number }>("key"); void stored;',
        "// @ts-expect-error 不应把泛型返回值退化为 any",
        "const invalid: string = copy.value; void invalid;",
      );
    }
    if ([".", "./object/storage", "./node", "./node/object/storage"].includes(key)) {
      // 在四个公开入口分别检查默认 key、受限 key 和原有值泛型，覆盖双格式声明。
      statements.push(
        "{",
        `const legacy: ${api}.StorageUtils = new ${api}.StorageUtils();`,
        'const dynamicKey: string = "custom-key";',
        "legacy.set<number>(dynamicKey, 1);",
        "const legacyValue: number | null = legacy.get<number>(dynamicKey); void legacyValue;",
        "legacy.setSafe<number>(dynamicKey, 1);",
        "const legacySafeValue: number | null = legacy.getSafe<number>(dynamicKey); void legacySafeValue;",
        "legacy.remove(dynamicKey); legacy.removeSafe(dynamicKey);",
        `const store = new ${api}.StorageUtils<"token" | "user">({ prefix: "typed:" });`,
        'store.set("token", "abc", 60);',
        'store.set<{ id: number }>("user", { id: 1 });',
        'const user: { id: number } | null = store.get<{ id: number }>("user"); void user;',
        'const saved: boolean = store.setSafe<string>("token", "abc", 60); void saved;',
        'const token: string | null = store.getSafe<string>("token"); void token;',
        'store.remove("user");',
        'const removed: boolean = store.removeSafe("token"); void removed;',
        "// @ts-expect-error key 泛型只接受字符串类型",
        `new ${api}.StorageUtils<number>();`,
        "// @ts-expect-error 指定 key 泛型后不接受任意字符串",
        "store.get(dynamicKey);",
        'const untypedValue = store.get("token");',
        "// @ts-expect-error 未指定值泛型时读取结果仍为 unknown",
        "const unknownValue: string | null = untypedValue; void unknownValue;",
        "// @ts-expect-error 显式值泛型仍约束写入值",
        'store.set<number>("token", "abc");',
      );
      for (const method of ["set", "get", "remove", "setSafe", "getSafe", "removeSafe"]) {
        statements.push(
          `// @ts-expect-error ${method} 不接受未声明的 key`,
          `store.${method}("missing"${method.startsWith("set") ? ", 1" : ""});`,
        );
      }
      statements.push("}");
    }
    if (key === "./axios/http" || key === "./rxjs/http") {
      const prefix = key === "./axios/http" ? "PromiseHttp" : "Http";
      statements.push(
        `const result${index}: ${api}.${prefix}Result<{ value: number }> = {} as ${api}.${prefix}Result<{ value: number }>;`,
        `if (result${index}.success) { const value: number = result${index}.data.value; void value; }`,
      );
    }
    if (key === "./date") {
      statements.push(
        `const duration: ${api}.DurationFields = { hours: 1 }; void duration;`,
        `const zoned: ${api}.ZonedDateTimeValue = ${api}.PlainDateTime.toZonedDateTime("2024-01-01T00:00:00", "UTC"); void zoned;`,
      );
    }
  });
  return statements.join("\n");
}
