import { describe, expect, it } from "vitest";
import {
  objectToQuery as objectToQueryFromEntry,
  queryToObject as queryToObjectFromEntry,
} from "../../src/index";
import { objectToQuery, queryToObject } from "../../src/object/url";

describe("object/url", () => {
  it("从主入口导出 URL 查询工具", () => {
    expect(objectToQueryFromEntry).toBe(objectToQuery);
    expect(queryToObjectFromEntry).toBe(queryToObject);
  });

  it("将对象序列化为不带前导问号的查询字符串", () => {
    expect(objectToQuery({ keyword: "你好 world", page: 1, enabled: false })).toBe(
      "keyword=%E4%BD%A0%E5%A5%BD+world&page=1&enabled=false",
    );
  });

  it("默认过滤 null 和 undefined，关闭过滤后保留其文本值", () => {
    const input = { keep: "value", nil: null, missing: undefined };

    expect(objectToQuery(input)).toBe("keep=value");
    expect(objectToQuery(input, { filterNullish: false })).toBe(
      "keep=value&nil=null&missing=undefined",
    );
  });

  it("将数组展开为同名 key，并按配置处理数组中的空值", () => {
    const input = { tag: ["ts", null, "node", undefined] };

    expect(objectToQuery(input)).toBe("tag=ts&tag=node");
    expect(objectToQuery(input, { filterNullish: false })).toBe(
      "tag=ts&tag=null&tag=node&tag=undefined",
    );
  });

  it("sortKeys 支持升序、降序和自定义排序，且不改变数组元素顺序", () => {
    const input = { b: ["second", "first"], ccc: "three", aa: "one" };

    expect(objectToQuery(input, { sortKeys: true })).toBe("aa=one&b=second&b=first&ccc=three");
    expect(objectToQuery(input, { sortKeys: "desc" })).toBe("ccc=three&b=second&b=first&aa=one");
    expect(objectToQuery(input, { sortKeys: (left, right) => right.length - left.length })).toBe(
      "ccc=three&aa=one&b=second&b=first",
    );
  });

  it("解析裸 query、带 hash 的路径和完整 HTTP URL", () => {
    expect(queryToObject("page=1&keyword=%E4%BD%A0%E5%A5%BD+world")).toEqual({
      page: "1",
      keyword: "你好 world",
    });
    expect(queryToObject("/search?tab=all&keyword=hello+world#result")).toEqual({
      tab: "all",
      keyword: "hello world",
    });
    expect(queryToObject("https://example.com/search?enabled=false&tag=ts")).toEqual({
      enabled: "false",
      tag: "ts",
    });
  });

  it("保留裸 query 值中未编码的问号", () => {
    expect(queryToObject("redirect=https://auth.test/login?next=/app&lang=zh")).toEqual({
      redirect: "https://auth.test/login?next=/app",
      lang: "zh",
    });
  });

  it("解析带 query 的相对路径", () => {
    expect(queryToObject("search?page=1&tag=ts")).toEqual({
      page: "1",
      tag: "ts",
    });
  });

  it("完整 URL 没有 query 时返回空对象", () => {
    expect(queryToObject("https://example.com/search#result")).toEqual({});
  });

  it("忽略 URL 片段中的 query 标记", () => {
    expect(queryToObject("https://example.com/path#section?tab=all")).toEqual({});
    expect(queryToObject("/path#x?tag=a")).toEqual({});
  });

  it("将重复 key 解析为保序字符串数组，并正确解码百分号和加号空格", () => {
    expect(queryToObject("tag=ts&tag=node&keyword=%E4%BD%A0%E5%A5%BD+world")).toEqual({
      tag: ["ts", "node"],
      keyword: "你好 world",
    });
  });

  it("聚合三个及以上的重复 key", () => {
    expect(queryToObject("tag=ts&tag=node&tag=browser")).toEqual({
      tag: ["ts", "node", "browser"],
    });
  });

  it("接受没有字符串索引签名的 interface 入参", () => {
    interface QueryParams {
      page: number;
      tag: string[];
    }

    const params: QueryParams = { page: 1, tag: ["typescript", "utils"] };

    expect(objectToQuery(params)).toBe("page=1&tag=typescript&tag=utils");
  });

  it("将继承键安全地保留为普通自有字段", () => {
    const result = queryToObject("__proto__=safe&constructor=value&toString=text");

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toBe("safe");
    expect(Object.getOwnPropertyDescriptor(result, "constructor")?.value).toBe("value");
    expect(Object.getOwnPropertyDescriptor(result, "toString")?.value).toBe("text");
  });

  it("将重复继承键聚合为保序自有字符串数组", () => {
    const result = queryToObject(
      "__proto__=one&constructor=one&toString=one&__proto__=two&constructor=two&toString=two",
    );

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toEqual(["one", "two"]);
    expect(Object.getOwnPropertyDescriptor(result, "constructor")?.value).toEqual(["one", "two"]);
    expect(Object.getOwnPropertyDescriptor(result, "toString")?.value).toEqual(["one", "two"]);
  });
});
