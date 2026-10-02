import {
  type Observable,
  catchError,
  defer,
  from,
  isObservable,
  of,
  switchMap,
  takeUntil,
  throwError,
} from "rxjs";
import { createCallerAbort$ } from "./abort.js";
import { toHttpRequestError } from "./errors.js";
import type { AnyHttpClientOptions, HttpRequestOptions, HttpSuccess } from "./types.js";

/** 每次订阅独立执行转换；先解开 Promise，再展开一层 Observable，普通数组仍是业务值。 */
function transformValue(transform: () => unknown): Observable<unknown> {
  return defer(() => from(Promise.resolve(transform()))).pipe(
    switchMap((value) => (isObservable(value) ? value : of(value))),
  );
}

/** 响应策略独立于传输重试和共享缓存，每个调用方拥有自己的转换订阅。 */
export function applyResponseTransforms(
  source$: Observable<HttpSuccess<unknown>>,
  transformResponse: AnyHttpClientOptions["transformResponse"],
  transformError: AnyHttpClientOptions["transformError"],
  signal: HttpRequestOptions["signal"],
): Observable<unknown> {
  const transformed$ =
    transformResponse === undefined
      ? source$
      : source$.pipe(switchMap((result) => transformValue(() => transformResponse(result))));
  const callerAbort$ = createCallerAbort$(signal);
  const result$ =
    callerAbort$ === undefined ? transformed$ : transformed$.pipe(takeUntil(callerAbort$));

  return result$.pipe(
    catchError((cause: unknown) => {
      const error = toHttpRequestError(cause);
      if (transformError === undefined) return throwError(() => error);
      const recovered$ = transformValue(() => transformError(error)).pipe(
        // 替换流的错误不会回到外层 catch，避免转换器自身失败后递归恢复。
        catchError((conversionError: unknown) =>
          throwError(() => toHttpRequestError(conversionError, "unknown")),
        ),
      );
      // 初始取消允许转换为业务结果；恢复期间才取消则终止恢复，不再次调用转换器。
      const cancelledBySignal = error.error.kind === "cancel" && signal?.aborted === true;
      const recoveryAbort$ = cancelledBySignal ? undefined : createCallerAbort$(signal);
      return recoveryAbort$ === undefined
        ? recovered$
        : recovered$.pipe(
            takeUntil(recoveryAbort$),
            catchError((abortError: unknown) => throwError(() => toHttpRequestError(abortError))),
          );
    }),
  );
}
