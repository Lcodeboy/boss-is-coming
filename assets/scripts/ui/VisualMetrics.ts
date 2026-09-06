/** 不依赖 Cocos 运行时的视觉几何指标，便于在回归测试中直接校验。 */
export const RESULT_VISUAL_METRICS = {
    cardHeight: 680,
    statusCenterY: 292,
    statusHeight: 70,
    titleCenterY: 180,
    titleHeight: 90,
    summaryCenterY: 70,
    evaluationCenterY: -75,
} as const;

/** 第一关绿植仅移动画面，不改变静态物品节点及任何投放碰撞范围。 */
export const LEVEL_ONE_PLANT_VISUAL_OFFSET_X = -44;

/** 部分矢量轮廓会超出逻辑节点上边缘；仅供视觉占位校验，不参与碰撞。 */
export const ITEM_VISUAL_TOP_OVERFLOW = {
    coffee: 18,
    'visitor-badge': 28,
} as const;

export interface VisualRect {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly top: number;
}

export function calculateCoveredRatio(target: VisualRect, obstruction: VisualRect): number {
    const targetWidth = Math.max(0, target.right - target.left);
    const targetHeight = Math.max(0, target.top - target.bottom);
    const targetArea = targetWidth * targetHeight;
    if (targetArea <= 0) {
        return 0;
    }
    const overlapWidth = Math.max(0, Math.min(target.right, obstruction.right) - Math.max(target.left, obstruction.left));
    const overlapHeight = Math.max(0, Math.min(target.top, obstruction.top) - Math.max(target.bottom, obstruction.bottom));
    return overlapWidth * overlapHeight / targetArea;
}
