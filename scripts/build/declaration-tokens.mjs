/**
 * 读取声明中的代码 token 及原文位置，忽略注释与模板字面量的静态文本。
 * 模板的 ${...} 中仍可能存在 import 类型，必须继续扫描；字符串和注释中的括号不影响嵌套。
 * @param {string} source TypeScript 声明文本。
 * @yields {{ value: string, start: number }} token 内容及其 UTF-16 起始偏移。
 */
export function* declarationTokens(source) {
  // 声明文件没有可执行的正则字面量；整段读取引号字符串，避免误认其中的代码。
  const pattern =
    /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\w$]+|[^\s]/gy;
  /** 各层模板插值内尚未闭合的普通花括号数，最后一项属于最内层插值。 */
  const interpolationDepths = [];
  /** 下一次读取的位置；输出偏移始终对应未经改写的 source。 */
  let offset = 0;
  /** 当前是否位于模板静态文本中；插值与嵌套模板会切换该状态。 */
  let inTemplate = false;

  while (offset < source.length) {
    if (inTemplate) {
      // 转义的反引号及 ${ 都只是文字；只有未转义的边界切回代码扫描。
      if (source[offset] === "\\") offset += 2;
      else if (source[offset] === "`") {
        inTemplate = false;
        offset++;
      } else if (source.startsWith("${", offset)) {
        interpolationDepths.push(0);
        inTemplate = false;
        offset += 2;
      } else offset++;
      continue;
    }

    // 每次从当前位置读取一个完整 token，保留真实模块字符串的替换区间。
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error(`无法解析声明 token：${offset}`);
    const value = match[0];
    const start = offset;
    offset = pattern.lastIndex;
    if (/^\s/u.test(value) || value.startsWith("//") || value.startsWith("/*")) continue;
    if (value === "`") {
      inTemplate = true;
      continue;
    }

    // 在模板插值中跟踪对象/映射类型的花括号，外层 } 才会返回模板文本。
    const depthIndex = interpolationDepths.length - 1;
    if (depthIndex >= 0) {
      if (value === "{") interpolationDepths[depthIndex]++;
      else if (value === "}") {
        if (interpolationDepths[depthIndex] === 0) {
          interpolationDepths.pop();
          inTemplate = true;
          continue;
        }
        interpolationDepths[depthIndex]--;
      }
    }
    yield { start, value };
  }
}
