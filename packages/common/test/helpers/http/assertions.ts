import { firstValueFrom } from "rxjs";
import { expect } from "vitest";
import { PromiseHttpRequestError } from "../../../src/axios/http.js";
import { HttpRequestError, type RxHttpClient } from "../../../src/rxjs/http.js";

export const expectRequestError = async (request: Promise<unknown>) => {
  try {
    await request;
    throw new Error("请求应该失败");
  } catch (error) {
    expect(error).toBeInstanceOf(PromiseHttpRequestError);
    return error as PromiseHttpRequestError;
  }
};

export const requestError = async (stream: ReturnType<RxHttpClient["get"]>) => {
  try {
    await firstValueFrom(stream);
    throw new Error("请求应该失败");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpRequestError);
    return error as HttpRequestError;
  }
};
