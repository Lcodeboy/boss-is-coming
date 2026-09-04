export interface FixedWidthViewport {
    readonly width: number;
    readonly height: number;
    readonly extraVerticalSpace: number;
}

/** 计算 FIXED_WIDTH 下的可视设计尺寸，背景据此覆盖完整屏幕。 */
export function calculateFixedWidthViewport(
    frameWidth: number,
    frameHeight: number,
    designWidth: number,
    safeHeight: number,
): FixedWidthViewport {
    if (frameWidth <= 0 || frameHeight <= 0 || designWidth <= 0 || safeHeight <= 0) {
        return { width: designWidth, height: safeHeight, extraVerticalSpace: 0 };
    }

    const visibleHeight = designWidth * frameHeight / frameWidth;
    const coveredHeight = Math.max(safeHeight, visibleHeight);
    return {
        width: designWidth,
        height: coveredHeight,
        extraVerticalSpace: Math.max(0, coveredHeight - safeHeight),
    };
}
