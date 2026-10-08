import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { declarationTokens } from "./declaration-tokens.mjs";

/** 只处理 tsc 生成的模块说明符；注释和普通字符串类型不参与路径转换。 */
export function commonJsDeclaration(source, filename) {
  // 词法扫描独立处理模板与注释，此处只决定哪些字符串属于模块引用。
  const tokens = [...declarationTokens(source)];
  /** 待应用的替换区间；所有位置均以原始 source 为准。 */
  const edits = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const value = token.value;
    if (!/^["']\.{1,2}\//u.test(value)) continue;
    const previous = tokens[index - 1]?.value;
    const isModule =
      previous === "from" ||
      previous === "import" ||
      (previous === "(" && tokens[index - 2]?.value === "import");
    if (!isModule) continue;
    // 相对引用必须能解析到同批声明，不能生成消费时才报错的 .d.cts 文件。
    const specifier = value.slice(1, -1);
    if (!specifier.endsWith(".js")) {
      throw new Error(`${filename}: 声明的相对模块引用须显式使用 .js：${specifier}`);
    }
    const declaration = resolve(dirname(filename), `${specifier.slice(0, -3)}.d.ts`);
    if (!existsSync(declaration)) throw new Error(`声明依赖不存在：${declaration}`);
    edits.push({
      end: token.start + value.length,
      start: token.start,
      text: `${value[0]}${specifier.slice(0, -3)}.cjs${value[0]}`,
    });
  }
  // 从后向前改写，保证前面的原文偏移不会被长度变化影响。
  for (const edit of edits.reverse()) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

/** 遍历已生成的声明目录，为每个 ESM 声明写入同路径的 CJS 声明；原声明保留。 */
export function emitCommonJsDeclarations(directory) {
  // 内部文件同样参与声明依赖图，必须递归覆盖，不能只转换公共入口。
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) emitCommonJsDeclarations(filename);
    else if (entry.name.endsWith(".d.ts")) {
      writeFileSync(
        `${filename.slice(0, -5)}.d.cts`,
        commonJsDeclaration(readFileSync(filename, "utf8"), filename),
      );
    }
  }
}
