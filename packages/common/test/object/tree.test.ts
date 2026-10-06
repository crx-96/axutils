import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { findTreePath as fromEntry } from "../../src/index.js";
import { findTreePath } from "../../src/object/tree.js";

interface Branch {
  readonly children?: readonly Branch[] | null;
  readonly id: string;
}

const getChildren = (node: Branch) => node.children;

describe("object/tree - findTreePath", () => {
  it("根入口与功能入口保持同一函数", () => {
    expect(fromEntry).toBe(findTreePath);
  });

  it("空树或未命中返回空路径，允许缺失、null 与空子数组", () => {
    const matches = vi.fn(() => false);
    expect(findTreePath([], matches, getChildren)).toEqual([]);
    expect(matches).not.toHaveBeenCalled();
    const nodes: Branch[] = [{ id: "a" }, { children: null, id: "b" }, { children: [], id: "c" }];
    expect(findTreePath(nodes, matches, getChildren)).toEqual([]);
    expect(matches).toHaveBeenCalledTimes(3);
  });

  it("返回含目标的根到叶路径、保留引用且不修改冻结输入", () => {
    const leaf = Object.freeze({ id: "leaf" });
    const child = Object.freeze({ children: Object.freeze([leaf]), id: "child" });
    const root = Object.freeze({ children: Object.freeze([child]), id: "root" });
    const nodes = Object.freeze([root]);
    const path = findTreePath<Branch>(nodes, (node) => node.id === "leaf", getChildren);
    expect(path).toEqual([root, child, leaf]);
    expect(path[0]).toBe(root);
    expect(path[1]).toBe(child);
    expect(path[2]).toBe(leaf);
    path.pop();
    expect(root.children[0]).toBe(child);
    expect(child.children).toEqual([leaf]);
    expect(findTreePath(nodes, () => true, getChildren)).toEqual([root]);
  });

  it("按原顺序先序深度优先命中，匹配后不读取子节点或后续分支", () => {
    const events: string[] = [];
    const first: Branch = { children: [{ id: "target" }], id: "first" };
    const later: Branch = { id: "target" };
    const path = findTreePath(
      [first, later],
      (node) => {
        events.push(`match:${node.id}`);
        return node.id === "target";
      },
      (node) => {
        events.push(`children:${node.id}`);
        return node.children;
      },
    );
    expect(path).toEqual([first, first.children?.[0]]);
    expect(events).toEqual(["match:first", "children:first", "match:target"]);
    const children = vi.fn(getChildren);
    expect(findTreePath([first], () => true, children)).toEqual([first]);
    expect(children).not.toHaveBeenCalled();
  });

  it("回溯剔除失败分支，支持调用方自定义字段和目录匹配条件", () => {
    interface Item {
      items?: readonly Item[];
      value: number;
    }
    const nodes: readonly Item[] = [
      { items: [{ value: 9 }], value: 0 },
      { items: [{ items: [{ value: 2 }], value: 1 }], value: 3 },
      { value: 1 },
    ];
    const path = findTreePath(
      nodes,
      (node) => node.value === 1 && !!node.items?.length,
      (node) => node.items,
    );
    expect(path.map((node) => node.value)).toEqual([3, 1]);
    expectTypeOf(path).toEqualTypeOf<Item[]>();
  });

  it("不把合法的 undefined 节点当成迭代结束，也不要求对象节点", () => {
    expect(
      findTreePath(
        [undefined],
        () => true,
        () => null,
      ),
    ).toEqual([undefined]);
    expect(
      findTreePath(
        [1, 2],
        (value) => value === 3,
        (value) => (value === 2 ? [3] : []),
      ),
    ).toEqual([2, 3]);
  });

  it("深树不依赖函数调用栈", () => {
    let root: Branch = { id: "target" };
    for (let depth = 0; depth < 10_000; depth++) root = { children: [root], id: String(depth) };
    const path = findTreePath([root], (node) => node.id === "target", getChildren);
    expect(path).toHaveLength(10_001);
    expect(path[0]).toBe(root);
    expect(path[path.length - 1]?.id).toBe("target");
  });

  it("匹配条件与子节点访问器的异常原样传播", () => {
    const failure = new Error("回调失败");
    const fail = () => {
      throw failure;
    };
    expect(() => findTreePath([1], fail, () => [])).toThrow(failure);
    expect(() => findTreePath([1], () => false, fail)).toThrow(failure);
  });

  it("拒绝无效根集合、回调和被访问到的子集合", () => {
    for (const args of [
      [null, () => false, () => []],
      [[], null, () => []],
      [[], () => false, null],
      [[1], () => false, () => "invalid"],
      [[1], () => false, () => 0],
    ])
      expect(() => Reflect.apply(findTreePath, undefined, args)).toThrow(TypeError);
  });
});
