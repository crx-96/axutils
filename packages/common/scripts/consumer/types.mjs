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
      const client = key === "./axios/http" ? "PromiseHttpClient" : "RxHttpClient";
      const wrapper = key === "./axios/http" ? "Promise" : 'import("rxjs").Observable';
      statements.push(
        `const result${index}: ${api}.${prefix}Result<{ value: number }> = {} as ${api}.${prefix}Result<{ value: number }>;`,
        `if (result${index}.success) { const value: number = result${index}.data.value; void value; }`,
        "{",
        "type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;",
        "type Assert<T extends true> = T;",
        `const legacy = new ${api}.${client}();`,
        'const original = legacy.get<{ id: number }>("/users/1");',
        `type Original = Assert<Equal<typeof original, ${wrapper}<${api}.${prefix}Success<{ id: number }>>>>;`,
        `const transformResponse = (result: ${api}.${prefix}Success<{ id: number }>) => ({ id: result.data.id, status: result.code });`,
        `const options = { transformHeaders: (headers) => ({ ...headers, Authorization: "Bearer token" }), transformResponse } satisfies ${api}.${prefix}ClientOptions;`,
        `const mapped = new ${api}.${client}(options).get("/users/1");`,
        `type Mapped = Assert<Equal<typeof mapped, ${wrapper}<{ id: number; status: number }>>>;`,
        "// @ts-expect-error 转换结果不能回退为原 HttpSuccess 或 any",
        `const wrong: ${wrapper}<${api}.${prefix}Success<{ id: number }>> = mapped; void wrong;`,
        `const asyncMapped = new ${api}.${client}({ transformResponse: async () => "ready" }).get("/users/1");`,
        `type AsyncMapped = Assert<Equal<typeof asyncMapped, ${wrapper}<string>>>;`,
        `const factory: ${api}.${prefix}ConfigFactory = () => { throw new Error("只做类型检查"); };`,
        `const created = ${api}.${client}.create(factory, options).get("/users/1");`,
        `type Created = Assert<Equal<typeof created, ${wrapper}<{ id: number; status: number }>>>;`,
        `type Result = Assert<Equal<${api}.${prefix}ResponseResult<unknown, typeof options>, { id: number; status: number }>>;`,
        `const transformer: ${api}.${prefix}ResponseTransformer = transformResponse; void transformer;`,
        "}",
      );
    }
    if (key === "./rxjs/http") {
      statements.push(
        "{",
        "type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;",
        "type Assert<T extends true> = T;",
        'const output = (): import("rxjs").Observable<{ id: number }> => { throw new Error("只做类型检查"); };',
        `const streamOptions = { transformResponse: (result: ${api}.HttpSuccess<{ id: number }>) => { void result; return output(); } };`,
        `const streamed = new ${api}.RxHttpClient(streamOptions).get("/user");`,
        'type Streamed = Assert<Equal<typeof streamed, import("rxjs").Observable<{ id: number }>>>;',
        `const factory: ${api}.HttpConfigFactory = () => { throw new Error("只做类型检查"); };`,
        `const createdStream = ${api}.RxHttpClient.create(factory, streamOptions).get("/user");`,
        'type CreatedStream = Assert<Equal<typeof createdStream, import("rxjs").Observable<{ id: number }>>>;',
        `const promisedStream = new ${api}.RxHttpClient({ transformResponse: async () => output() }).get("/user");`,
        'type PromisedStream = Assert<Equal<typeof promisedStream, import("rxjs").Observable<{ id: number }>>>;',
        "}",
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
