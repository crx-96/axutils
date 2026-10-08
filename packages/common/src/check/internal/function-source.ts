/**
 * 跳过源码中的空白和注释，返回下一个有效字符下标。
 *
 * 这里只处理箭头函数声明头部常见的空白、块注释和行注释，
 * 供后续的轻量源码扫描使用，不尝试实现完整的 JavaScript 词法分析。
 */
const skipWhitespaceAndComments = (source: string, start: number): number => {
  let index = start;

  // 连续跳过空白和相邻注释，遇到第一个语法字符就交回外层扫描器。
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === undefined) {
      return index;
    }

    // 空白自身不参与函数声明头部结构。
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    // 块注释中的括号、引号等都不参与源码结构，只查找闭合标记。
    if (char === "/" && next === "*") {
      index += 2;

      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }

      if (index >= source.length) {
        return index;
      }

      index += 2;
      continue;
    }

    // 行注释跳到下一个换行，再由外层循环继续处理空白或其他注释。
    if (char === "/" && next === "/") {
      index += 2;

      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }

      continue;
    }

    break;
  }

  return index;
};

/**
 * 判断完整 Unicode 码点是否可以开始 JavaScript 标识符；$ 和 _ 是额外允许的字符。
 */
const isIdentifierStart = (char: string | undefined): boolean =>
  char !== undefined && /^[$_\p{ID_Start}]$/u.test(char);

/**
 * 判断完整 Unicode 码点是否可继续标识符，同时允许连接控制字符 ZWNJ 和 ZWJ。
 */
const isIdentifierPart = (char: string | undefined): boolean =>
  char !== undefined &&
  (char === "\u200c" || char === "\u200d" || /^[$_\p{ID_Continue}]$/u.test(char));

/**
 * 读取一个标识符并返回其后的 UTF-16 下标；起始处没有标识符时返回 undefined。
 * 逐码点前进以支持补充平面字符，同时解析源码中的 Unicode 转义，不执行任何源码。
 */
const readIdentifierEnd = (source: string, start: number): number | undefined => {
  /** 当前 UTF-16 下标，与源文本的 slice 和后续词法扫描保持相同坐标。 */
  let index = start;
  /** 首字符不能使用数字或仅允许继续标识符的连接字符。 */
  let first = true;

  while (index < source.length) {
    const codePoint = source.codePointAt(index);
    if (codePoint === undefined) break;
    let character = String.fromCodePoint(codePoint);
    let end = index + character.length;

    // Function.prototype.toString 保留原始转义；将 Unicode 转义解释成字符再做标识符校验。
    if (character === "\\") {
      if (source[index + 1] !== "u") break;
      if (source[index + 2] === "{") {
        const close = source.indexOf("}", index + 3);
        if (close < 0) break;
        const digits = source.slice(index + 3, close);
        // 花括号转义允许任意数量的前导零，限制的是最终码点而非十六进制位数。
        if (!/^[\da-f]+$/iu.test(digits)) break;
        const escapedPoint = Number.parseInt(digits, 16);
        if (escapedPoint > 0x10ffff) break;
        character = String.fromCodePoint(escapedPoint);
        end = close + 1;
      } else {
        const digits = source.slice(index + 2, index + 6);
        if (!/^[\da-f]{4}$/iu.test(digits)) break;
        character = String.fromCharCode(Number.parseInt(digits, 16));
        end = index + 6;
      }
    }

    // 只消耗当前标识符；参数后的空白、注释和 => 留给调用方判别。
    if (!(first ? isIdentifierStart(character) : isIdentifierPart(character))) break;
    first = false;
    index = end;
  }

  return first ? undefined : index;
};

/**
 * 跳过单引号或双引号字符串，转义字符不会结束当前字面量。
 */
const skipQuotedLiteral = (source: string, start: number): number => {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    // 转义后的引号和括号仍属于字符串内容，必须与反斜杠一起略过。
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    // 只有未被转义的同类引号才结束该字面量。
    if (source[index] === quote) {
      return index + 1;
    }
    index += 1;
  }

  return index;
};

/**
 * 判断当前位置的斜杠是否可作为正则字面量起始符。
 * 覆盖参数默认值中常见的标点与关键字表达式起始位置，避免把除法误当作正则。
 */
const isRegularExpressionStart = (source: string, start: number): boolean => {
  let index = start - 1;

  // 先定位斜杠之前的有效字符；这些标点之后允许开始新的表达式。
  while (index >= 0 && /\s/.test(source[index] ?? "")) {
    index -= 1;
  }

  const previous = source[index];
  if (previous === undefined || "=([{,:;!&|?~*%^<>".includes(previous)) {
    return true;
  }

  // return 等关键字之后也可以开始正则表达式；普通标识符之后按除法处理。
  let wordStart = index;
  while (wordStart >= 0 && isIdentifierPart(source[wordStart])) {
    wordStart -= 1;
  }

  const previousWord = source.slice(wordStart + 1, index + 1);
  return (
    previousWord === "return" ||
    previousWord === "throw" ||
    previousWord === "case" ||
    previousWord === "delete" ||
    previousWord === "void" ||
    previousWord === "typeof" ||
    previousWord === "yield" ||
    previousWord === "await"
  );
};

/**
 * 跳过正则字面量及其字符类；调用方先保证当前位置确实是正则起始斜杠。
 */
const skipRegularExpressionLiteral = (source: string, start: number): number => {
  let index = start + 1;
  /** 字符类中的斜杠不会结束正则字面量。 */
  let inCharacterClass = false;

  while (index < source.length) {
    const char = source[index];

    // 转义字符整体跳过，不能让转义的方括号或斜杠改变扫描状态。
    if (char === "\\") {
      index += 2;
      continue;
    }
    // 离开字符类后遇到斜杠才结束模式，并继续消耗其 ASCII 修饰符。
    if (char === "[") {
      inCharacterClass = true;
    } else if (char === "]") {
      inCharacterClass = false;
    } else if (char === "/" && !inCharacterClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] ?? "")) {
        index += 1;
      }
      return index;
    }
    index += 1;
  }

  return index;
};

/**
 * 跳过模板插值表达式。这里只需识别其边界，插值内部的圆括号不应影响外层参数列表深度。
 */
const skipTemplateExpression = (source: string, start: number): number => {
  let index = start;
  /** 已进入一层 ${...}，其内部嵌套的对象和代码块需要配对大括号。 */
  let depth = 1;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    // 先跳过嵌套字面量和注释，防止它们内部的花括号结束插值。
    if (char === "'" || char === '"') {
      index = skipQuotedLiteral(source, index);
      continue;
    }
    if (char === "`") {
      index = skipTemplateLiteral(source, index);
      continue;
    }
    if (char === "/" && (next === "*" || next === "/")) {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }
    if (char === "/" && isRegularExpressionStart(source, index)) {
      index = skipRegularExpressionLiteral(source, index);
      continue;
    }
    // 仅对真实插值表达式中的大括号计数，回到外层前返回闭合花括号之后。
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
    index += 1;
  }

  return index;
};

/**
 * 跳过模板字面量及其插值；模板中的字符不会参与外层参数括号计数。
 */
const skipTemplateLiteral = (source: string, start: number): number => {
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    // 转义的反引号或美元符号属于模板文本，不开启结构分支。
    if (char === "\\") {
      index += 2;
      continue;
    }
    // 结束模板，或递归跳过插值表达式后继续读取模板文本。
    if (char === "`") {
      return index + 1;
    }
    if (char === "$" && source[index + 1] === "{") {
      index = skipTemplateExpression(source, index + 2);
      continue;
    }
    index += 1;
  }

  return index;
};

/**
 * 检测函数源码文本是否以箭头函数语法开头。
 *
 * 这是判断箭头函数的核心依据：箭头函数在 JavaScript 运行时没有专属的
 * `Symbol.toStringTag`（`Object.prototype.toString` 对箭头函数和普通 `function` 声明
 * 都返回 `"[object Function]"`），也没有独有属性或内部槽，
 * 唯一能区分箭头函数与普通 `function` 声明的手段是读取其源码文本、检测箭头语法 `=>`。
 *
 * 这里不再依赖单个大正则，而是按以下步骤做轻量源码扫描：
 * 1. 跳过源码开头的空白和注释
 * 2. 识别可选的 `async` 前缀
 * 3. 读取单标识符参数，或扫描括号包裹的参数列表
 * 4. 只把参数列表之后出现的 `=>` 视为箭头语法
 *
 * 这种方式能覆盖注释、默认值、解构参数和参数中的嵌套圆括号，
 * 但仍不是完整语法解析器。bound/native 函数等源码特征缺失的场景依旧无法识别。
 *
 * 此函数只供同功能内的类型守卫使用，不属于包的公共 API。
 */
export const isArrowSource = (source: string): boolean => {
  let index = skipWhitespaceAndComments(source, 0);

  // 只有完整的 async 标识符才可能是修饰符；async值 等名称仍是同步参数。
  if (source.startsWith("async", index)) {
    const afterAsync = index + 5;

    if (readIdentifierEnd(source, index) === afterAsync) {
      // async 也可以是同步箭头函数的唯一参数名；其后直接出现 => 时不消耗该标识符。
      const afterPrefix = skipWhitespaceAndComments(source, afterAsync);
      if (!(source[afterPrefix] === "=" && source[afterPrefix + 1] === ">")) {
        index = afterPrefix;
      }
    }
  }

  // 多参数、默认值及解构形式以括号包裹，需扫描到与首括号配对的结束位置。
  if (source[index] === "(") {
    let depth = 0;

    while (index < source.length) {
      const char = source[index];
      const next = source[index + 1];

      // 字符串、模板、注释和正则内部的括号不参与参数深度。
      if (char === "/" && (next === "*" || next === "/")) {
        index = skipWhitespaceAndComments(source, index);
        continue;
      }

      if (char === "'" || char === '"') {
        index = skipQuotedLiteral(source, index);
        continue;
      }

      if (char === "`") {
        index = skipTemplateLiteral(source, index);
        continue;
      }

      if (char === "/" && isRegularExpressionStart(source, index)) {
        index = skipRegularExpressionLiteral(source, index);
        continue;
      }

      // 只累计语法括号；最外层闭合后，函数头部的下一有效符号必须为 =>。
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;

        if (depth === 0) {
          index += 1;
          break;
        }
      }

      index += 1;
    }

    // 未闭合参数不能识别为箭头函数，不尝试用函数体内的 => 补救。
    if (depth !== 0) {
      return false;
    }

    index = skipWhitespaceAndComments(source, index);
    return source[index] === "=" && source[index + 1] === ">";
  }

  // 无括号形式只允许单个标识符，完整读取后再检查箭头，支持 Unicode 和转义。
  const identifierEnd = readIdentifierEnd(source, index);
  if (identifierEnd === undefined) {
    return false;
  }

  index = skipWhitespaceAndComments(source, identifierEnd);
  return source[index] === "=" && source[index + 1] === ">";
};

/**
 * 只识别 class 声明头部，避免把 classic 等方法名或名为 class 的普通方法误判为构造器。
 */
export const isClassSource = (source: string): boolean => {
  const start = skipWhitespaceAndComments(source, 0);
  // class 后必须是关键字分隔符；className 等普通标识符不属于声明。
  if (!source.startsWith("class", start) || readIdentifierEnd(source, start) !== start + 5) {
    return false;
  }
  // 对象方法也可以叫 class；跳过注释和空白后，参数括号说明它是方法。
  return source[skipWhitespaceAndComments(source, start + 5)] !== "(";
};

/**
 * 识别 bound/native 函数的占位函数体；函数正文中的同名字符串或注释不属于占位源码。
 */
export const isNativeFunctionSource = (source: string): boolean =>
  /^\s*function\b[\s\S]*\{\s*\[native code\]\s*\}\s*$/u.test(source);
