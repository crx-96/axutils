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
