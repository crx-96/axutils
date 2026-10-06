import { isHexColor } from "../check/reg.js";

/**
 * 将两个六位十六进制颜色按比例进行 RGB 通道线性插值，不作色彩空间或透明度转换。
 *
 * @param color 起始色，仅接受 #RRGGBB，十六进制字母大小写均可。
 * @param target 目标色，格式与起始色相同，不接受三位简写、alpha 或空白。
 * @param amount 目标色占比，必须是 [0, 1] 内的有限数字；0 为起始色，1 为目标色。
 * @returns 每个通道经 Math.round 取整、补齐两位的小写 #rrggbb 字符串。
 * @throws {TypeError} 颜色格式不合法，或 amount 不是有限数字；在计算前同步抛出。
 * @throws {RangeError} amount 超出 [0, 1]，不会自动截断。
 */
export const mixRgbColor = (color: string, target: string, amount: number): string => {
  // 复用现有格式检查并限定七字符，排除三位简写和末尾换行等非严格输入。
  if (!isHexColor(color) || color.length !== 7) {
    throw new TypeError("color 必须是 #RRGGBB 颜色");
  }
  if (!isHexColor(target) || target.length !== 7) {
    throw new TypeError("target 必须是 #RRGGBB 颜色");
  }
  if (!Number.isFinite(amount)) throw new TypeError("amount 必须是有限数字");
  if (amount < 0 || amount > 1) throw new RangeError("amount 必须在 [0, 1] 范围内");

  /** 按红、绿、蓝顺序插值后的两位十六进制通道。 */
  const channels: string[] = [];
  // 保持原算法的运算顺序及 Math.round 取整，使合法输入的结果完全一致。
  for (const start of [1, 3, 5]) {
    /** 起始色当前通道的整数值，范围为 0 到 255。 */
    const sourceChannel = Number.parseInt(color.slice(start, start + 2), 16);
    /** 目标色对应通道的整数值，范围为 0 到 255。 */
    const targetChannel = Number.parseInt(target.slice(start, start + 2), 16);
    channels.push(
      Math.round(sourceChannel + (targetChannel - sourceChannel) * amount)
        .toString(16)
        .padStart(2, "0"),
    );
  }
  // 每个通道已补零，拼接后始终是六位小写十六进制颜色。
  return `#${channels.join("")}`;
};
