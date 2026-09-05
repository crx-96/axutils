import * as common from "@axutils/common";
import * as promiseHttp from "@axutils/common/axios/http";
import * as convert from "@axutils/common/crypto/convert";
import * as md5 from "@axutils/common/crypto/md5";
import * as date from "@axutils/common/date";
import * as json from "@axutils/common/object/json";
import * as rxHttp from "@axutils/common/rxjs/http";

// 使用真实发布入口；Vite 按浏览器消费条件解析 exports 和可选 peer。
const api = { ...common, ...promiseHttp, ...convert, ...md5, ...date, ...json, ...rxHttp };

declare global {
  interface Window {
    AxutilsTest: typeof api;
    AxutilsCommon: typeof api;
  }
}

window.AxutilsTest = api;
