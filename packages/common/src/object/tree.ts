/**
 * 按节点原顺序进行深度优先、先序查找，返回根到首个匹配节点的完整路径（含目标）。
 *
 * @param nodes 根节点数组，允许只读数组；输入须构成有限、无环的树。
 * @param matches 节点匹配条件；先检查当前节点，匹配后不读取其子节点或后续分支。
 * @param getChildren 子节点访问器；返回 null、undefined 或空数组表示叶节点。
 * 回调应保持输入稳定，不在遍历期间修改节点或数组。
 * @returns 新路径数组，其中节点保持输入引用；不修改输入，空树或未找到时返回空数组。
 * @throws {TypeError} nodes 非数组、回调非函数，或访问到的非空子节点集合不是数组。
 * 回调自身的异常同步原样传播。算法不检测环，也不解析业务字段。
 */
export const findTreePath = <T>(
  nodes: readonly T[],
  matches: (node: T) => boolean,
  getChildren: (node: T) => readonly T[] | null | undefined,
): T[] => {
  // 只校验遍历协议，不对调用方节点的业务结构作推断。
  if (!Array.isArray(nodes)) throw new TypeError("nodes 必须是数组");
  if (typeof matches !== "function") throw new TypeError("matches 必须是函数");
  if (typeof getChildren !== "function") throw new TypeError("getChildren 必须是函数");

  /** 当前分支的节点路径；只有成功命中时才作为结果返回。 */
  const path: T[] = [];
  /** 祖先层未完成的同级遍历，显式保存以避免深树耗尽函数调用栈。 */
  const ancestors: Iterator<T>[] = [];
  /** 当前层的同级节点迭代器；undefined 表示根层也已遍历结束。 */
  let siblings: Iterator<T> | undefined = nodes[Symbol.iterator]();

  // 先检查节点，再进入子树；当前层结束后回到父层，继续下一个同级节点。
  while (siblings) {
    /** 本层下一个节点或结束标志；通过 done 区分合法的 undefined 节点值。 */
    const next = siblings.next();
    if (next.done) {
      siblings = ancestors.pop();
      path.pop();
      continue;
    }

    path.push(next.value);
    if (matches(next.value)) return path;

    /** 仅未匹配的节点才读取子节点，保留回调调用顺序和提前返回语义。 */
    const children = getChildren(next.value);
    if (children != null && !Array.isArray(children)) {
      throw new TypeError("getChildren 必须返回数组、null 或 undefined");
    }
    if (children?.length) {
      ancestors.push(siblings);
      siblings = children[Symbol.iterator]();
    } else {
      // 叶节点未匹配，撤销该节点后继续当前层，不把失败分支带入结果。
      path.pop();
    }
  }
  return [];
};
