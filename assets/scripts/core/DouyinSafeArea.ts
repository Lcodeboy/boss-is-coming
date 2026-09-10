import { FixedWidthViewport } from './ViewportLayout';

export interface ScreenRectData {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

export interface ViewportRectData {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

interface DouyinApi {
    readonly getMenuButtonBoundingClientRect?: () => unknown;
}

interface DouyinGlobal {
    readonly tt?: DouyinApi;
}

/** 仅在抖音能力存在时读取系统胶囊；Web 和旧基础库安全返回 null。 */
export function readDouyinMenuButtonRect(scope: unknown = globalThis): ScreenRectData | null {
    const tt = (scope as DouyinGlobal | null)?.tt;
    if (typeof tt?.getMenuButtonBoundingClientRect !== 'function') {
        return null;
    }
    try {
        return parseScreenRect(tt.getMenuButtonBoundingClientRect());
    } catch {
        return null;
    }
}

/** 将屏幕左上角像素坐标转换为 FIXED_WIDTH 的居中设计坐标。 */
export function convertScreenRectToViewport(
    rect: ScreenRectData,
    frameWidth: number,
    frameHeight: number,
    designWidth: number,
): ViewportRectData | null {
    if (frameWidth <= 0 || frameHeight <= 0 || designWidth <= 0) {
        return null;
    }
    const left = clamp(rect.left, 0, frameWidth);
    const right = clamp(rect.right, left, frameWidth);
    const top = clamp(rect.top, 0, frameHeight);
    const bottom = clamp(rect.bottom, top, frameHeight);
    if (right <= left || bottom <= top) {
        return null;
    }
    const scale = designWidth / frameWidth;
    const visibleHeight = frameHeight * scale;
    return {
        left: left * scale - designWidth / 2,
        right: right * scale - designWidth / 2,
        top: visibleHeight / 2 - top * scale,
        bottom: visibleHeight / 2 - bottom * scale,
    };
}

/** 在抖音端把内容顶部降到胶囊下方；未检测到胶囊时原样返回 Web 布局。 */
export function reserveDouyinMenuButtonSafeArea(
    viewport: FixedWidthViewport,
    frameWidth: number,
    frameHeight: number,
    designWidth: number,
    rect: ScreenRectData | null,
    margin = 16,
): FixedWidthViewport {
    if (rect === null) {
        return viewport;
    }
    const menuRect = convertScreenRectToViewport(rect, frameWidth, frameHeight, designWidth);
    if (menuRect === null) {
        return viewport;
    }
    const safeTop = Math.min(viewport.safeTop, menuRect.bottom - Math.max(0, margin));
    if (safeTop === viewport.safeTop) {
        return viewport;
    }
    return {
        ...viewport,
        topSafeInset: viewport.height / 2 - safeTop,
        safeTop,
        safeHeight: Math.max(0, safeTop - viewport.safeBottom),
    };
}

function parseScreenRect(value: unknown): ScreenRectData | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const raw = value as Record<string, unknown>;
    const left = raw.left;
    const top = raw.top;
    const right = raw.right;
    const bottom = raw.bottom;
    if (
        typeof left !== 'number'
        || typeof top !== 'number'
        || typeof right !== 'number'
        || typeof bottom !== 'number'
        || !Number.isFinite(left)
        || !Number.isFinite(top)
        || !Number.isFinite(right)
        || !Number.isFinite(bottom)
        || right <= left
        || bottom <= top
    ) {
        return null;
    }
    return { left, top, right, bottom };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}
