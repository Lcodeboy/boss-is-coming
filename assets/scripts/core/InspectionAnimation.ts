import { FixedWidthViewport } from './ViewportLayout';

export interface InspectionProgressUpdate {
    readonly index: number;
    readonly atSeconds: number;
}

export interface InspectionAnimationTimeline {
    readonly totalSeconds: number;
    readonly shadeSeconds: number;
    readonly outcomeAtSeconds: number;
    readonly progressUpdates: readonly InspectionProgressUpdate[];
}

export interface InspectionAnimationLayout {
    readonly actorWidth: number;
    readonly actorHeight: number;
    readonly actorX: number;
    readonly actorY: number;
    readonly actorEntryX: number;
    readonly titleY: number;
    readonly feedbackY: number;
}

export const INSPECTION_NORMAL_TOTAL_SECONDS = 2.9;
export const INSPECTION_REDUCED_TOTAL_SECONDS = 2.55;
export const INSPECTION_MAX_TOTAL_SECONDS = 3.2;
export const INSPECTION_MAX_PROGRESS_UPDATES = 12;
export const INSPECTION_NORMAL_OUTCOME_SECONDS = 1.92;
export const BOSS_HEAD_NECK_PIVOT_SOURCE_Y = 792;

export interface HeadReactionKeyframe {
    readonly seconds: number;
    readonly x: number;
    readonly y: number;
    readonly scaleY: number;
    readonly angle: number;
    readonly easing: 'quadIn' | 'quadOut' | 'quadInOut' | 'backOut';
}

export interface BodyReactionKeyframe {
    readonly seconds: number;
    readonly x: number;
    readonly y: number;
    readonly easing: 'quadIn' | 'quadOut';
}

export const SUCCESS_HEAD_REACTION: readonly HeadReactionKeyframe[] = [
    { seconds: 0.12, x: 0, y: -20, scaleY: 0.94, angle: 0, easing: 'quadIn' },
    { seconds: 0.12, x: 0, y: 4, scaleY: 1, angle: 0, easing: 'backOut' },
    { seconds: 0.12, x: 0, y: -11, scaleY: 0.96, angle: 0, easing: 'quadIn' },
    { seconds: 0.19, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'backOut' },
    { seconds: 0.05, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'quadOut' },
];

export const FAILURE_HEAD_REACTION: readonly HeadReactionKeyframe[] = [
    { seconds: 0.09, x: -2, y: 0, scaleY: 1, angle: -7, easing: 'quadInOut' },
    { seconds: 0.1, x: 2, y: 0, scaleY: 1, angle: 7, easing: 'quadInOut' },
    { seconds: 0.09, x: -1.5, y: 0, scaleY: 1, angle: -5, easing: 'quadInOut' },
    { seconds: 0.1, x: 1.5, y: 0, scaleY: 1, angle: 5, easing: 'quadInOut' },
    { seconds: 0.14, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'quadOut' },
    { seconds: 0.06, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'quadOut' },
];

export const SUCCESS_BODY_REACTION: readonly BodyReactionKeyframe[] = [
    { seconds: 0.14, x: 0, y: -3, easing: 'quadIn' },
    { seconds: 0.18, x: 0, y: 0, easing: 'quadOut' },
    { seconds: 0.28, x: 0, y: 0, easing: 'quadOut' },
];

export const FAILURE_BODY_REACTION: readonly BodyReactionKeyframe[] = [
    { seconds: 0.12, x: -1, y: 2, easing: 'quadOut' },
    { seconds: 0.16, x: 0, y: 0, easing: 'quadOut' },
    { seconds: 0.3, x: 0, y: 0, easing: 'quadOut' },
];

export function reactionDuration(
    keyframes: readonly { readonly seconds: number }[],
): number {
    return keyframes.reduce((total, frame) => total + frame.seconds, 0);
}

const BOSS_SOURCE_ASPECT = 1024 / 1536;

/** 检查项只在固定时间窗内快速扫过，项目数不会延长总动画。 */
export function calculateInspectionAnimationTimeline(
    stepCount: number,
    reducedMotion: boolean,
): InspectionAnimationTimeline {
    if (!Number.isInteger(stepCount) || stepCount < 0) {
        throw new Error('检查项数量必须是非负整数');
    }
    const totalSeconds = reducedMotion
        ? INSPECTION_REDUCED_TOTAL_SECONDS
        : INSPECTION_NORMAL_TOTAL_SECONDS;
    const progressStart = reducedMotion ? 0.28 : 0.7;
    const progressEnd = reducedMotion ? 1.42 : 1.58;
    const outcomeAtSeconds = reducedMotion ? 1.68 : INSPECTION_NORMAL_OUTCOME_SECONDS;
    const updateCount = Math.min(stepCount, INSPECTION_MAX_PROGRESS_UPDATES);
    const progressUpdates: InspectionProgressUpdate[] = [];
    for (let updateIndex = 0; updateIndex < updateCount; updateIndex += 1) {
        const ratio = updateCount <= 1 ? 1 : updateIndex / (updateCount - 1);
        const index = Math.min(
            stepCount - 1,
            Math.ceil((updateIndex + 1) * stepCount / updateCount) - 1,
        );
        progressUpdates.push({
            index,
            atSeconds: progressStart + (progressEnd - progressStart) * ratio,
        });
    }
    return {
        totalSeconds,
        shadeSeconds: reducedMotion ? 0.12 : 0.3,
        outcomeAtSeconds,
        progressUpdates,
    };
}

/**
 * 角色只按高度等比缩放；静止位置完整位于平台安全区内，进场起点在屏幕右侧之外。
 */
export function calculateInspectionAnimationLayout(
    viewport: FixedWidthViewport,
): InspectionAnimationLayout {
    const horizontalHeightLimit = Math.max(1, (viewport.width - 72) / BOSS_SOURCE_ASPECT);
    const verticalHeightLimit = Math.max(1, viewport.safeHeight - 360);
    const actorHeight = Math.min(700, horizontalHeightLimit, verticalHeightLimit);
    const actorWidth = actorHeight * BOSS_SOURCE_ASPECT;
    const safeCenterY = (viewport.safeTop + viewport.safeBottom) / 2;
    const actorX = 42;
    const actorY = safeCenterY - 18;
    const actorTop = actorY + actorHeight / 2;
    const actorBottom = actorY - actorHeight / 2;
    return {
        actorWidth,
        actorHeight,
        actorX,
        actorY,
        actorEntryX: viewport.width / 2 + actorWidth / 2 + 36,
        titleY: Math.min(viewport.safeTop - 58, actorTop + 92),
        feedbackY: Math.max(viewport.safeBottom + 78, actorBottom - 82),
    };
}
