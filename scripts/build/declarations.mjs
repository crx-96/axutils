import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** 只处理 tsc 生成的模块说明符；注释和普通字符串类型不参与路径转换。 */
export function commonJsDeclaration(source, filename) {
  const tokens = [
    ...source.matchAll(
      /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\w$]+|[^\s]/gu,
    ),
  ].filter(([token]) => !token.startsWith("//") && !token.startsWith("/*"));
  const edits = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const value = token[0];
    if (!/^["']\.{1,2}\//u.test(value)) continue;
    const previous = tokens[index - 1]?.[0];
    const isModule =
      previous === "from" ||
      previous === "import" ||
      (previous === "(" && tokens[index - 2]?.[0] === "import");
    if (!isModule) continue;
    const specifier = value.slice(1, -1);
    if (!specifier.endsWith(".js")) {
      throw new Error(`${filename}: 声明的相对模块引用须显式使用 .js：${specifier}`);
    }
    const declaration = resolve(dirname(filename), `${specifier.slice(0, -3)}.d.ts`);
    if (!existsSync(declaration)) throw new Error(`声明依赖不存在：${declaration}`);
    edits.push({
      end: token.index + value.length,
      start: token.index,
      text: `${value[0]}${specifier.slice(0, -3)}.cjs${value[0]}`,
    });
  }
  for (const edit of edits.reverse()) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

export function emitCommonJsDeclarations(directory) {
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
