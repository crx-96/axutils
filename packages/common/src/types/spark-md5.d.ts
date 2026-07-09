declare module "spark-md5" {
  interface SparkMd5ArrayBufferInstance {
    append(value: globalThis.ArrayBuffer): this;
    end(raw?: false): string;
    end(raw: true): string;
    reset(): this;
  }

  class SparkMD5 {
    append(value: string): this;
    appendBinary(value: string): this;
    end(raw?: false): string;
    end(raw: true): string;
    reset(): this;
  }

  namespace SparkMD5 {
    // biome-ignore lint/suspicious/noShadowRestrictedNames: 第三方库公开 API 名称固定为 ArrayBuffer
    const ArrayBuffer: { new (): SparkMd5ArrayBufferInstance };
  }

  export default SparkMD5;
}
