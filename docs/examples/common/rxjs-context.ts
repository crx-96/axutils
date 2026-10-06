import {
  type HttpRequestContext,
  type HttpResponseTypeMap,
  RxHttpClient,
} from "@axutils/common/rxjs/http";
import { of } from "rxjs";

/** 示例应用的服务端业务信封；泛型只表达约定，实际结构应在应用边界校验。 */
export interface ApiResponse<T> {
  /** 业务状态码：0 成功，401 登录过期，-1 表示当前应用主动丢弃旧会话结果。 */
  code: number;
  /** 成功载荷；失败或丢弃结果时为 null。 */
  data: T | null;
  /** 可供应用显示的业务说明。 */
  message: string;
  /** 服务端可选返回的新 token；只有本次凭据仍归属当前缓存时才采用。 */
  renewedToken?: string;
}

/** 把每次 get<T>/post<T,D> 的 T 映射到业务信封，所有请求方法直接使用同一实例。 */
export interface ApiResponseTypeMap extends HttpResponseTypeMap {
  /** 服务端响应体。 */
  readonly body: ApiResponse<this["data"]>;
  /** 成功转换后的应用结果。 */
  readonly result: ApiResponse<this["data"]>;
  /** 请求最终失败后的应用结果。 */
  readonly error: ApiResponse<this["data"]>;
}

/** 示例应用的登录态；生产项目可换成应用自己的 store。 */
interface Session {
  /** 每次登录、退出或切换身份都递增，避免退出再登录同一用户时接收旧结果。 */
  version: number;
  /** 当前缓存的凭据；未登录时为 null。 */
  token: string | null;
}

/** 订阅开始时由应用捕获的快照；快照语义由应用负责，库保留返回对象的原引用。 */
interface RequestContext extends Session {
  /** 订阅时的语言，配置等待与内部重试期间保持不变。 */
  language: string;
}

/** 当前应用会话，只有下方应用策略可以更新它。 */
let session: Session = { token: null, version: 0 };
/** 当前界面语言，后续订阅会捕获最新值。 */
let language = "zh-CN";

/** 应用在登录、退出或切换账号时调用；推进版本以隔离此前所有订阅。 */
export function changeSession(token: string | null): void {
  session = { token, version: session.version + 1 };
}

/** 应用在切换语言时调用，不改变已开始订阅的语言。 */
export function changeLanguage(value: string): void {
  language = value;
}

/** 为失败或丢弃响应构造无载荷结果，不伪造任意请求的 T。 */
function failure(code: number, message: string): ApiResponse<never> {
  return { code, data: null, message };
}

/** 同时核对会话版本、缓存是否更新，以及本次实际发送的凭据，决定能否修改缓存。 */
function ownsCurrentCredential(request: HttpRequestContext<RequestContext>): boolean {
  const context = request.context;
  // 显式 Authorization 可能属于其他身份；缺失或屏蔽凭据也没有清缓存、续期的权限。
  return (
    context !== undefined &&
    context.version === session.version &&
    context.token !== null &&
    context.token === session.token &&
    request.headers?.Authorization === `Bearer ${context.token}`
  );
}

/**
 * 直接导出库创建的实例，无 request/get/post/put/patch/delete 转发层。
 * 此处使用 of 演示配置入口，应用可替换为自己的 Observable 配置加载器。
 */
export const httpUtils = RxHttpClient.withTypes<ApiResponseTypeMap, RequestContext>().create(
  () => of({ baseUrl: "/api", retryCount: 3 }),
  {
    // 明确由应用复制会话字段；库在每次订阅开始、等待配置之前调用一次。
    createContext: (): RequestContext => ({ ...session, language }),
    transformError: (error, request) => {
      const context = request.context;
      // 创建上下文失败时无法判断归属，只生成错误结果，不更新任何应用缓存。
      if (context === undefined) return failure(error.code, error.message);
      if (context.version !== session.version) return failure(-1, "已忽略旧会话响应");
      // 仅当前会话仍在使用本次实际凭据时，401 才有权退出登录。
      if (error.code === 401 && ownsCurrentCredential(request)) changeSession(null);
      return failure(error.code, error.message);
    },
    transformHeaders: (headers, request) => {
      const context = request.context;
      if (context === undefined) return headers;
      // 这里只提供默认字段；大小写、common/方法分组、显式值的最后覆盖由库完成。
      return {
        ...headers,
        "Accept-Language": context.language,
        Authorization: context.token === null ? null : `Bearer ${context.token}`,
      };
    },
    transformResponse: (response, request) => {
      const context = request.context;
      // 先隔离旧会话，再处理业务结果，避免旧响应续期或清除新会话缓存。
      if (context === undefined || context.version !== session.version) {
        return failure(-1, "已忽略旧会话响应");
      }
      const result = response.data;
      if (result.code === 401 && ownsCurrentCredential(request)) changeSession(null);
      // token 轮换不改变会话版本；并发旧 token 响应因缓存比较失败而不能二次续期。
      if (
        result.code === 0 &&
        result.renewedToken !== undefined &&
        ownsCurrentCredential(request)
      ) {
        session = { ...session, token: result.renewedToken };
      }
      return result;
    },
  },
);

/** 示例用户接口的载荷。 */
interface User {
  /** 用户显示名。 */
  name: string;
}

/** 示例登录接口的请求体。 */
interface LoginRequest {
  /** 用户名。 */
  username: string;
  /** 仅随请求发送的示例密码，不写入上述会话缓存。 */
  password: string;
}

/** 示例登录接口的成功载荷。 */
interface LoginResult {
  /** 应用确认登录结果后，调用 changeSession 建立新会话。 */
  token: string;
}

/** Observable<ApiResponse<User>>；只创建冷流，不立即发起请求。 */
export const user$ = httpUtils.get<User>("/user");
/** Observable<ApiResponse<LoginResult>>；D 继续校验请求体，显式 null 屏蔽默认凭据。 */
export const login$ = httpUtils.post<LoginResult, LoginRequest>(
  "/login",
  { password: "example-password", username: "example-user" },
  { headers: { Authorization: null } },
);
