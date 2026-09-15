import { DropZoneConfig, PointData, WorkItemConfig } from '../data/LevelTypes';
import { LEVEL_ONE_PLANT_VISUAL_OFFSET_X } from './VisualMetrics';

export type OfficeThemeId = 'intern-office-v1';

export type OfficeThemeAssetKey =
    | 'background'
    | 'monitorPlay'
    | 'monitorWork'
    | 'monitorNote'
    | 'plant'
    | 'gameConsole'
    | 'snackBag'
    | 'blueContract'
    | 'inspectionTray'
    | 'personalDrawer'
    | 'wastebasket';

export interface OfficeThemeAssetSpec {
    readonly resourcePath: string;
    readonly width: number;
    readonly height: number;
    readonly hasAlpha: boolean;
    /** PNG 像素坐标中的可见 Alpha 底边，用于桌面接地校验；渲染仍使用完整画布。 */
    readonly visibleAlphaBottom?: number;
    readonly visibleAlphaLeft?: number;
    readonly visibleAlphaRight?: number;
    readonly visibleAlphaTop?: number;
    /** Bottom contact strip of rear artwork, in original PNG pixels. */
    readonly supportLeft?: number;
    readonly supportRight?: number;
}

export interface OfficeArtworkPlacement {
    readonly fit: 'contain' | 'width';
    readonly widthRatio: number;
    readonly heightRatio: number;
    readonly offsetX: number;
    readonly offsetY: number;
}

export interface OfficeArtworkLayout {
    readonly width: number;
    readonly height: number;
    readonly x: number;
    readonly y: number;
}

export interface OfficeThemeConfig {
    readonly id: OfficeThemeId;
    readonly displayName: string;
    readonly backgroundAsset: OfficeThemeAssetKey;
    readonly assets: Readonly<Record<OfficeThemeAssetKey, OfficeThemeAssetSpec>>;
    readonly placements: Readonly<Record<OfficeThemeAssetKey, OfficeArtworkPlacement>>;
    readonly levelLayouts: Readonly<Partial<Record<string, OfficeThemeLevelLayout>>>;
    readonly decorations: {
        readonly plant: {
            readonly asset: 'plant';
            readonly interactive: false;
            readonly behindInteraction: true;
        };
    };
}

export interface OfficeThemeLevelLayout {
    readonly tabletop: OfficeTabletopConfig;
}

export interface OfficeBounds {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly top: number;
}

export interface OfficeTabletopConfig {
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    /** Conservative wood boundary in source-image coordinates, including sloping sides. */
    readonly backProfile: readonly PointData[];
    readonly frontPixel: number;
    readonly columns: readonly number[];
    readonly gap: number;
    readonly supportGap: number;
    readonly maximumBackgroundZoom: number;
}

export interface OfficeDeskItem {
    readonly id: string;
    /** Visible PNG + label reservation relative to the logical/touch center. */
    readonly bounds: OfficeBounds;
    readonly touch: OfficeBounds;
    readonly preferredColumn?: number;
}

export interface OfficeDeskGeometry {
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly backgroundCenterY: number;
    readonly items: readonly OfficeDeskItem[];
    readonly obstacles: readonly OfficeBounds[];
    readonly inputBlockers: readonly OfficeBounds[];
    readonly supports: readonly OfficeBounds[];
}

export type OfficeDeskLayout = {
    readonly ok: true;
    readonly backgroundScale: number;
    readonly backgroundOffsetY: number;
    readonly positions: Readonly<Record<string, PointData>>;
} | {
    readonly ok: false;
    readonly reason: 'invalid-geometry' | 'capacity-or-framing' | 'search-budget';
    readonly itemIds: readonly string[];
};

export interface OfficeItemArtwork {
    readonly asset: OfficeThemeAssetKey;
    readonly runtimeLabel: string;
}

export interface OfficeZoneArtwork {
    readonly asset: OfficeThemeAssetKey;
    readonly runtimeLabel: string;
}

const RESOURCE_ROOT = 'office/intern-office-v1';
const BOTTOM_TARGET_VISUAL_SCALE = 1.18;
const CONTAIN: OfficeArtworkPlacement = {
    fit: 'contain',
    widthRatio: 1,
    heightRatio: 1,
    offsetX: 0,
    offsetY: 0,
};

export const INTERN_OFFICE_V1: OfficeThemeConfig = {
    id: 'intern-office-v1',
    displayName: '实习期办公室',
    backgroundAsset: 'background',
    assets: {
        background: { resourcePath: `${RESOURCE_ROOT}/intern-office-background/spriteFrame`, width: 860, height: 1828, hasAlpha: false },
        monitorPlay: { resourcePath: `${RESOURCE_ROOT}/intern-monitor-play/spriteFrame`, width: 768, height: 512, hasAlpha: true, visibleAlphaLeft: 62, visibleAlphaRight: 705, visibleAlphaTop: 36, visibleAlphaBottom: 476, supportLeft: 250, supportRight: 519 },
        monitorWork: { resourcePath: `${RESOURCE_ROOT}/intern-monitor-work/spriteFrame`, width: 768, height: 512, hasAlpha: true, visibleAlphaLeft: 63, visibleAlphaRight: 704, visibleAlphaTop: 36, visibleAlphaBottom: 476, supportLeft: 250, supportRight: 519 },
        monitorNote: { resourcePath: `${RESOURCE_ROOT}/intern-monitor-note/spriteFrame`, width: 252, height: 254, hasAlpha: true, visibleAlphaLeft: 39, visibleAlphaRight: 220, visibleAlphaTop: 25, visibleAlphaBottom: 220 },
        plant: { resourcePath: `${RESOURCE_ROOT}/intern-plant/spriteFrame`, width: 460, height: 496, hasAlpha: true, visibleAlphaLeft: 121, visibleAlphaRight: 419, visibleAlphaTop: 61, visibleAlphaBottom: 426, supportLeft: 189, supportRight: 323 },
        gameConsole: { resourcePath: `${RESOURCE_ROOT}/intern-game-console/spriteFrame`, width: 696, height: 301, hasAlpha: true, visibleAlphaBottom: 283, visibleAlphaLeft: 85, visibleAlphaRight: 635, visibleAlphaTop: 19 },
        snackBag: { resourcePath: `${RESOURCE_ROOT}/intern-snack-bag/spriteFrame`, width: 536, height: 417, hasAlpha: true, visibleAlphaBottom: 399, visibleAlphaLeft: 18, visibleAlphaRight: 518, visibleAlphaTop: 18 },
        blueContract: { resourcePath: `${RESOURCE_ROOT}/intern-blue-contract/spriteFrame`, width: 606, height: 368, hasAlpha: true, visibleAlphaBottom: 350, visibleAlphaLeft: 18, visibleAlphaRight: 588, visibleAlphaTop: 18 },
        inspectionTray: { resourcePath: `${RESOURCE_ROOT}/intern-inspection-tray/spriteFrame`, width: 567, height: 406, hasAlpha: true, visibleAlphaLeft: 47, visibleAlphaRight: 473, visibleAlphaTop: 75, visibleAlphaBottom: 321, supportLeft: 69, supportRight: 414 },
        personalDrawer: { resourcePath: `${RESOURCE_ROOT}/intern-personal-drawer/spriteFrame`, width: 510, height: 483, hasAlpha: true },
        wastebasket: { resourcePath: `${RESOURCE_ROOT}/intern-wastebasket/spriteFrame`, width: 400, height: 450, hasAlpha: true },
    },
    placements: {
        background: CONTAIN,
        monitorPlay: { fit: 'width', widthRatio: 1, heightRatio: 1.25, offsetX: 0, offsetY: 8 },
        monitorWork: { fit: 'width', widthRatio: 1, heightRatio: 1.25, offsetX: 0, offsetY: 8 },
        monitorNote: { fit: 'contain', widthRatio: 0.25, heightRatio: 0.45, offsetX: 0.34, offsetY: 0.39 },
        plant: { ...CONTAIN, offsetX: LEVEL_ONE_PLANT_VISUAL_OFFSET_X },
        gameConsole: CONTAIN,
        snackBag: CONTAIN,
        blueContract: CONTAIN,
        inspectionTray: CONTAIN,
        personalDrawer: {
            ...CONTAIN,
            widthRatio: BOTTOM_TARGET_VISUAL_SCALE,
            heightRatio: BOTTOM_TARGET_VISUAL_SCALE,
        },
        wastebasket: {
            ...CONTAIN,
            widthRatio: BOTTOM_TARGET_VISUAL_SCALE,
            heightRatio: BOTTOM_TARGET_VISUAL_SCALE,
        },
    },
    levelLayouts: {
        'level-001': {
            tabletop: {
                sourceWidth: 860,
                sourceHeight: 1828,
                // Measured from the unchanged PNG, rounded INWARD. Runtime
                // regressions independently decode every wood/Alpha column.
                backProfile: [{ x: 0, y: 967 }, { x: 94, y: 857 }, { x: 818, y: 857 }, { x: 860, y: 921 }],
                frontPixel: 1085,
                columns: [-250, 0, 255],
                gap: 12,
                supportGap: 8,
                maximumBackgroundZoom: 1.15,
            },
        },
    },
    decorations: {
        plant: {
            asset: 'plant',
            interactive: false,
            behindInteraction: true,
        },
    },
};

export const DEFAULT_OFFICE_THEME_ID: OfficeThemeId = 'intern-office-v1';

const OFFICE_THEMES: Readonly<Record<OfficeThemeId, OfficeThemeConfig>> = {
    'intern-office-v1': INTERN_OFFICE_V1,
};

export function getOfficeTheme(themeId: OfficeThemeId): OfficeThemeConfig {
    return OFFICE_THEMES[themeId];
}

export function resolveOfficeItemArtwork(config: WorkItemConfig): OfficeItemArtwork | null {
    switch (config.visual) {
        case 'monitor':
            return { asset: 'monitorPlay', runtimeLabel: '' };
        case 'console':
            return { asset: 'gameConsole', runtimeLabel: '游戏机' };
        case 'snack':
            return { asset: 'snackBag', runtimeLabel: '脆脆零食' };
        case 'contract':
            return config.visualVariant === undefined || config.visualVariant === 'file-current'
                ? { asset: 'blueContract', runtimeLabel: '蓝色合同' }
                : null;
        case 'plant':
            return { asset: 'plant', runtimeLabel: '' };
        default:
            return null;
    }
}

export function resolveOfficeZoneArtwork(config: DropZoneConfig): OfficeZoneArtwork | null {
    switch (config.visual) {
        case 'drawer':
            return { asset: 'personalDrawer', runtimeLabel: '私人物品' };
        case 'trash':
            return { asset: 'wastebasket', runtimeLabel: '废弃物' };
        case 'review-tray':
            return { asset: 'inspectionTray', runtimeLabel: '待检查文件' };
        default:
            return null;
    }
}

export function calculateOfficeArtworkLayout(
    theme: OfficeThemeConfig,
    assetKey: OfficeThemeAssetKey,
    containerWidth: number,
    containerHeight: number,
): OfficeArtworkLayout {
    const asset = theme.assets[assetKey];
    const placement = theme.placements[assetKey];
    const maximumWidth = Math.max(1, containerWidth * placement.widthRatio);
    const maximumHeight = Math.max(1, containerHeight * placement.heightRatio);
    const scale = placement.fit === 'width'
        ? maximumWidth / asset.width
        : Math.min(maximumWidth / asset.width, maximumHeight / asset.height);
    return {
        width: asset.width * scale,
        height: asset.height * scale,
        x: placement.offsetX * (Math.abs(placement.offsetX) <= 1 ? containerWidth : 1),
        y: placement.offsetY * (Math.abs(placement.offsetY) <= 1 ? containerHeight : 1),
    };
}

export function officeSurfaceBackPixel(config: OfficeTabletopConfig, x: number): number {
    for (let i = 1; i < config.backProfile.length; i += 1) {
        const a = config.backProfile[i - 1];
        const b = config.backProfile[i];
        if (x <= b.x) {
            return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
        }
    }
    return config.backProfile[config.backProfile.length - 1].y;
}

export function unionOfficeBounds(a: OfficeBounds, b: OfficeBounds): OfficeBounds {
    return { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), bottom: Math.min(a.bottom, b.bottom), top: Math.max(a.top, b.top) };
}

function movedOfficeBounds(bounds: OfficeBounds, point: PointData): OfficeBounds {
    return { left: bounds.left + point.x, right: bounds.right + point.x, bottom: bounds.bottom + point.y, top: bounds.top + point.y };
}

/** Pure, deterministic layout: no Nodes, task logic, tweens or per-item coordinate patches. */
export function solveOfficeDeskLayout(config: OfficeTabletopConfig, geometry: OfficeDeskGeometry): OfficeDeskLayout {
    const ids = geometry.items.map(item => item.id);
    const fail = (reason: 'invalid-geometry' | 'capacity-or-framing' | 'search-budget'): OfficeDeskLayout => ({ ok: false, reason, itemIds: ids });
    const validBounds = (r: OfficeBounds): boolean => [r.left, r.right, r.bottom, r.top].every(Number.isFinite) && r.left <= r.right && r.bottom <= r.top;
    if (new Set(ids).size !== ids.length || !config.columns.length || geometry.viewportWidth <= 0 || geometry.viewportHeight <= 0
        || ![geometry.viewportWidth, geometry.viewportHeight, geometry.backgroundCenterY, config.sourceWidth, config.sourceHeight, config.frontPixel, config.gap, config.supportGap, config.maximumBackgroundZoom, ...config.columns].every(Number.isFinite)
        || config.sourceWidth <= 0 || config.sourceHeight <= 0 || config.gap < 0 || config.supportGap < 0 || config.maximumBackgroundZoom < 1
        || config.backProfile.length < 2 || config.backProfile.some((p, i) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || (i > 0 && p.x <= config.backProfile[i - 1].x))
        || ![...geometry.obstacles, ...geometry.inputBlockers, ...geometry.supports].every(validBounds)
        || !geometry.supports.length || geometry.items.some(item => !validBounds(item.bounds) || !validBounds(item.touch) || item.bounds.left >= item.bounds.right || item.bounds.bottom >= item.bounds.top)) {
        return fail('invalid-geometry');
    }
    const cover = Math.max(geometry.viewportWidth / config.sourceWidth, geometry.viewportHeight / config.sourceHeight);
    const horizontal = (a: OfficeBounds, b: OfficeBounds, gap = 0): boolean => a.left < b.right + gap && a.right > b.left - gap;
    // The search is intentionally bounded. Exhaustion is a diagnostic, never an
    // excuse to shrink targets, overlap items, or silently discard excess items.
    let budget = 24000;
    const sorted = geometry.items.map((item, index) => ({ item, index })).sort((a, b) =>
        (b.item.bounds.top - b.item.bounds.bottom) - (a.item.bounds.top - a.item.bounds.bottom) || a.index - b.index);
    for (let zoomStep = 0; zoomStep <= Math.round((config.maximumBackgroundZoom - 1) * 200); zoomStep += 1) {
        const scale = cover * (1 + zoomStep / 200);
        const travel = Math.max(0, (config.sourceHeight * scale - geometry.viewportHeight) / 2);
        let cameraMin = geometry.backgroundCenterY - travel;
        let cameraMax = geometry.backgroundCenterY + travel;
        const surface = (left: number, right: number, centerY: number): { front: number; back: number } | null => {
            const a = left / scale + config.sourceWidth / 2;
            const b = right / scale + config.sourceWidth / 2;
            if (a < 0 || b > config.sourceWidth) { return null; }
            const samples = [a, b, ...config.backProfile.filter(p => p.x > a && p.x < b).map(p => p.x)];
            const back = Math.max(...samples.map(x => officeSurfaceBackPixel(config, x)));
            return { front: centerY + (config.sourceHeight / 2 - config.frontPixel) * scale,
                back: centerY + (config.sourceHeight / 2 - back) * scale };
        };
        let supported = true;
        for (const foot of geometry.supports) {
            const wood = surface(foot.left, foot.right, 0);
            if (wood === null) { supported = false; break; }
            cameraMin = Math.max(cameraMin, foot.top - wood.back + config.supportGap);
            cameraMax = Math.min(cameraMax, foot.bottom - wood.front - config.supportGap);
        }
        if (!supported || cameraMin > cameraMax) { continue; }
        const pack = (cameraY: number): Record<string, PointData> | null => {
            const placed: { point: PointData; reserve: OfficeBounds }[] = [];
            const positions: Record<string, PointData> = {};
            const visit = (index: number): boolean => {
                if (--budget <= 0) { return false; }
                if (index === sorted.length) { return true; }
                const { item, index: originalIndex } = sorted[index];
                const preferred = item.preferredColumn ?? originalIndex % config.columns.length;
                const columns = config.columns.map((x, column) => ({ x, column })).sort((a, b) =>
                    Math.abs(a.column - preferred) - Math.abs(b.column - preferred));
                for (const { x } of columns) {
                    const body = movedOfficeBounds(item.bounds, { x, y: 0 });
                    const reserve = movedOfficeBounds(unionOfficeBounds(item.bounds, item.touch), { x, y: 0 });
                    const wood = surface(body.left, body.right, cameraY);
                    if (wood === null) { continue; }
                    let intervals = [{ min: wood.front + config.gap - item.bounds.bottom, max: wood.back - config.gap - item.bounds.top }];
                    const cut = (min: number, max: number): void => {
                        const remaining: { min: number; max: number }[] = [];
                        for (const interval of intervals) {
                            if (min >= interval.max || max <= interval.min) { remaining.push(interval); continue; }
                            if (min >= interval.min) { remaining.push({ min: interval.min, max: min }); }
                            if (max <= interval.max) { remaining.push({ min: max, max: interval.max }); }
                        }
                        intervals = remaining;
                    };
                    for (const obstacle of geometry.obstacles) {
                        if (horizontal(body, obstacle, config.gap)) {
                            // Foreground stays IN FRONT of rear-row artwork/text,
                            // rather than using an unrelated free interval above it.
                            intervals = intervals.map(i => ({ min: i.min, max: Math.min(i.max, obstacle.bottom - config.gap - item.bounds.top) }));
                        }
                    }
                    for (const input of geometry.inputBlockers) {
                        if (x >= input.left && x <= input.right) { cut(input.bottom - 1, input.top + 1); }
                    }
                    for (const existing of placed) {
                        if (horizontal(reserve, existing.reserve, config.gap)) {
                            cut(existing.reserve.bottom - config.gap - reserve.top, existing.reserve.top + config.gap - reserve.bottom);
                        }
                    }
                    intervals = intervals.filter(i => i.max >= i.min).sort((a, b) => (b.max - b.min) - (a.max - a.min));
                    for (const interval of intervals) {
                        // Backtracking over center and end positions allows later
                        // items to share a column in multiple rows when space permits.
                        for (const y of [(interval.min + interval.max) / 2, interval.max, interval.min]) {
                            const point = { x, y };
                            placed.push({ point, reserve: movedOfficeBounds(reserve, { x: 0, y }) });
                            positions[item.id] = point;
                            if (visit(index + 1)) { return true; }
                            placed.pop();
                            delete positions[item.id];
                            if (budget <= 0) { return false; }
                        }
                    }
                }
                return false;
            };
            return visit(0) ? positions : null;
        };
        let best: { positions: Record<string, PointData>; camera: number; score: number } | null = null;
        // Search only frame translations satisfying ALL rear support + cover
        // constraints, and prefer balanced clearances at the smallest zoom.
        for (let sample = 0; sample <= 16; sample += 1) {
            const camera = cameraMin + (cameraMax - cameraMin) * sample / 16;
            const positions = pack(camera);
            if (positions !== null) {
                let score = Infinity;
                for (const foot of geometry.supports) {
                    const wood = surface(foot.left, foot.right, camera);
                    if (wood !== null) { score = Math.min(score, wood.back - foot.top, foot.bottom - wood.front); }
                }
                for (const item of geometry.items) {
                    const body = movedOfficeBounds(item.bounds, positions[item.id]);
                    const wood = surface(body.left, body.right, camera);
                    if (wood !== null) { score = Math.min(score, body.bottom - wood.front, wood.back - body.top); }
                    for (const obstacle of geometry.obstacles) {
                        if (horizontal(body, obstacle, config.gap)) { score = Math.min(score, obstacle.bottom - body.top); }
                    }
                }
                if (best === null || score > best.score) { best = { positions, camera, score }; }
            }
            if (budget <= 0) { break; }
        }
        if (best !== null) {
            return { ok: true, backgroundScale: scale, backgroundOffsetY: best.camera - geometry.backgroundCenterY, positions: best.positions };
        }
        if (budget <= 0) { return fail('search-budget'); }
    }
    return fail('capacity-or-framing');
}
