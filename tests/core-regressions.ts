import { GameState, GameStateMachine } from '../assets/scripts/core/GameStateMachine';
import { InspectionSequence } from '../assets/scripts/core/InspectionSequence';
import {
    calculateInspectionAnimationLayout,
    calculateInspectionAnimationTimeline,
    BOSS_MAGNIFIER_POP_OUT_SECONDS,
    BOSS_MAGNIFIER_PREPARE_SECONDS,
    BOSS_MAGNIFIER_RETURN_PREPARE_SECONDS,
    BOSS_MAGNIFIER_SETTLE_SECONDS,
    BOSS_MAGNIFIER_TRANSITION_SECONDS,
    BOSS_POSE_SWAP_OPACITY,
    BOSS_POSE_SWAP_OUT_SECONDS,
    BOSS_POSE_TRANSITION_SECONDS,
    FAILURE_BODY_REACTION,
    INSPECTION_FINAL_POSE_SECONDS,
    INSPECTION_MAX_PROGRESS_UPDATES,
    INSPECTION_MAX_TOTAL_SECONDS,
    INSPECTION_NORMAL_OUTCOME_SECONDS,
    INSPECTION_NORMAL_POSE_UPDATES,
    INSPECTION_NORMAL_TOTAL_SECONDS,
    INSPECTION_REDUCED_TOTAL_SECONDS,
    FAILURE_HEAD_REACTION,
    reactionDuration,
    RESULT_MODAL_ENTRANCE_SECONDS,
    RESULT_MODAL_REDUCED_ENTRANCE_SECONDS,
    SUCCESS_BODY_REACTION,
    SUCCESS_HEAD_REACTION,
} from '../assets/scripts/core/InspectionAnimation';
import {
    convertScreenRectToViewport,
    readDouyinMenuButtonRect,
    reserveDouyinMenuButtonSafeArea,
    ViewportRectData,
} from '../assets/scripts/core/DouyinSafeArea';
import {
    calculateCoverLayout,
    calculateFixedWidthViewport,
    calculateFullBleedBackgroundLayout,
    calculateFullscreenOverlayLayout,
    calculateGameTopNavigationLayout,
    calculateLevelSelectLayout,
    calculatePortraitGameLayout,
    calculateSafeModalLayout,
    calculateStartPageLayout,
    calculateWorkspaceLayout,
    DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS,
    WORKSPACE_BASE_CONTENT_HEIGHT,
    WORKSPACE_DESK_HEIGHT,
    WORKSPACE_TITLE_HEIGHT,
} from '../assets/scripts/core/ViewportLayout';
import {
    calculateCoveredRatio,
    LEVEL_ONE_PLANT_VISUAL_OFFSET_X,
    RESULT_VISUAL_METRICS,
} from '../assets/scripts/ui/VisualMetrics';

interface RoundResult {
    readonly inspectedIndexes: readonly number[];
    readonly settlementCount: number;
    readonly finalState: GameState;
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function centeredRect(x: number, y: number, width: number, height: number): ViewportRectData {
    return {
        left: x - width / 2,
        right: x + width / 2,
        top: y + height / 2,
        bottom: y - height / 2,
    };
}

function intersects(left: ViewportRectData, right: ViewportRectData): boolean {
    return left.left < right.right
        && left.right > right.left
        && left.bottom < right.top
        && left.top > right.bottom;
}

function runRound(
    machine: GameStateMachine,
    sequence: InspectionSequence,
    taskResults: readonly boolean[],
): RoundResult {
    if (machine.state === GameState.HOME) {
        assert(machine.transition(GameState.LEVEL_SELECT), 'HOME 应进入 LEVEL_SELECT');
        assert(machine.transition(GameState.READY), 'LEVEL_SELECT 应进入 READY');
    }
    assert(machine.transition(GameState.PLAYING), 'READY 应进入 PLAYING');
    const allCompleted = taskResults.every((passed) => passed);
    if (allCompleted) {
        assert(machine.transition(GameState.PREPARED), '全部任务完成后应进入 PREPARED');
    }
    assert(machine.transition(GameState.INSPECTING), 'PLAYING 应进入 INSPECTING');

    const inspectedIndexes: number[] = [];
    let settlementCount = 0;
    let event = sequence.start(taskResults.length);
    while (event.kind !== 'idle') {
        if (event.kind === 'step') {
            inspectedIndexes.push(event.index);
            assert(machine.state === GameState.INSPECTING, '检查项未完成前不得结算');
            event = sequence.advance();
        } else {
            settlementCount += 1;
            assert(machine.transition(allCompleted ? GameState.SUCCESS : GameState.FAILURE), '检查完成后应进入结算状态');
            event = sequence.advance();
        }
    }

    const finalState = machine.state;
    assert(machine.transition(GameState.READY), '结算后应能重新挑战');
    return { inspectedIndexes, settlementCount, finalState };
}

const requiredCases: readonly (readonly boolean[])[] = [
    [true, false, false, false],
    [false, true, true, true],
    [true, true, true, false],
    [true, true, true, true],
];

for (const stepCount of [0, 1, 4, 12, 40, 500]) {
    for (const reducedMotion of [false, true]) {
        const timeline = calculateInspectionAnimationTimeline(stepCount, reducedMotion);
        assert(timeline.totalSeconds >= 2.5, `${stepCount}项检查动画不得短于2.5秒`);
        assert(timeline.totalSeconds <= INSPECTION_MAX_TOTAL_SECONDS, `${stepCount}项检查动画不得超过3.2秒`);
        assert(
            timeline.totalSeconds === (reducedMotion ? INSPECTION_REDUCED_TOTAL_SECONDS : INSPECTION_NORMAL_TOTAL_SECONDS),
            `${stepCount}项检查总时长必须保持既定流程`,
        );
        assert(
            timeline.outcomeAtSeconds === (reducedMotion ? 1.68 : INSPECTION_NORMAL_OUTCOME_SECONDS),
            `${stepCount}项检查结果出现时间必须保持不变`,
        );
        assert(timeline.outcomeAtSeconds < timeline.totalSeconds, `${stepCount}项总结果必须在结算前展示`);
        assert(
            timeline.finalPoseAtSeconds === (reducedMotion ? timeline.outcomeAtSeconds : INSPECTION_FINAL_POSE_SECONDS),
            reducedMotion ? '减少动态必须在结果出现时直接显示最终姿势' : '最终通过/失败姿势必须在2.52秒切换',
        );
        assert(timeline.finalPoseAtSeconds < timeline.totalSeconds, '最终姿势必须在2.9秒结算前展示');
        assert(
            JSON.stringify(timeline.poseUpdates) === JSON.stringify(reducedMotion ? [] : INSPECTION_NORMAL_POSE_UPDATES),
            reducedMotion ? '减少动态必须跳过放大镜等快速姿势切换' : '正常检查姿势顺序和时间点必须固定',
        );
        assert(
            timeline.progressUpdates.length <= INSPECTION_MAX_PROGRESS_UPDATES,
            `${stepCount}项检查不得创建无限数量的进度回调`,
        );
        if (stepCount > 0) {
            assert(timeline.progressUpdates[0].index >= 0, `${stepCount}项检查首个进度必须有效`);
            assert(
                timeline.progressUpdates[timeline.progressUpdates.length - 1].index === stepCount - 1,
                `${stepCount}项检查最后必须快速推进到总数`,
            );
        }
        for (const update of timeline.progressUpdates) {
            assert(update.atSeconds < timeline.outcomeAtSeconds, `${stepCount}项进度必须在总结果前完成`);
        }
    }
}

assert(
    JSON.stringify(INSPECTION_NORMAL_POSE_UPDATES) === JSON.stringify([
        { pose: 'check', atSeconds: 0.58, durationSeconds: 0.1, transitionStyle: 'singleSwap' },
        { pose: 'magnifier', atSeconds: 1.02, durationSeconds: 0.17, transitionStyle: 'checkToMagnifier' },
        { pose: 'check', atSeconds: 1.42, durationSeconds: 0.1, transitionStyle: 'magnifierToCheck' },
        { pose: 'neutral', atSeconds: 1.82, durationSeconds: 0.1, transitionStyle: 'singleSwap' },
    ]),
    '正常动画必须严格按 neutral→check→magnifier→check→neutral reaction 切换',
);
assert(BOSS_POSE_TRANSITION_SECONDS >= 0.09 && BOSS_POSE_TRANSITION_SECONDS <= 0.12, '普通单帧换图必须在90～120ms内完成');
assert(BOSS_POSE_SWAP_OUT_SECONDS >= 0.04 && BOSS_POSE_SWAP_OUT_SECONDS <= 0.05, '普通姿势必须先收缩40～50ms');
assert(BOSS_POSE_SWAP_OPACITY === 210, '换图遮掩阶段必须保持可见且降低至Alpha 210');
assert(Math.abs(0.58 + BOSS_POSE_TRANSITION_SECONDS - 0.68) < 1e-9, 'neutral→check必须在0.68秒完成');
assert(
    BOSS_MAGNIFIER_PREPARE_SECONDS >= 0.05 && BOSS_MAGNIFIER_PREPARE_SECONDS <= 0.06,
    'check→magnifier必须先收缩50～60ms',
);
assert(BOSS_MAGNIFIER_POP_OUT_SECONDS === 0.06, 'magnifier必须用60ms从0.97恢复并轻微放大');
assert(BOSS_MAGNIFIER_SETTLE_SECONDS >= 0.05 && BOSS_MAGNIFIER_SETTLE_SECONDS <= 0.06, 'magnifier必须用50～60ms恢复到1.0');
assert(
    Math.abs(BOSS_MAGNIFIER_PREPARE_SECONDS + BOSS_MAGNIFIER_POP_OUT_SECONDS + BOSS_MAGNIFIER_SETTLE_SECONDS - BOSS_MAGNIFIER_TRANSITION_SECONDS) < 1e-9,
    'magnifier单帧换图及回弹总时间必须固定为170ms',
);
assert(1.42 - (1.02 + BOSS_MAGNIFIER_TRANSITION_SECONDS) >= 0.2, 'magnifier清晰停留不得短于200ms');
assert(1.42 - (1.02 + BOSS_MAGNIFIER_TRANSITION_SECONDS) <= 0.26, 'magnifier清晰停留不得超过260ms');
assert(
    BOSS_MAGNIFIER_RETURN_PREPARE_SECONDS >= 0.04 && BOSS_MAGNIFIER_RETURN_PREPARE_SECONDS <= 0.05,
    'magnifier→check必须先收缩40～50ms',
);
assert(Math.abs(1.82 + BOSS_POSE_TRANSITION_SECONDS - INSPECTION_NORMAL_OUTCOME_SECONDS) < 1e-9, '结果反应前必须完成check→neutral');
assert(Math.abs(INSPECTION_FINAL_POSE_SECONDS + BOSS_POSE_TRANSITION_SECONDS - 2.62) < 1e-9, '最终姿势单帧换图必须在2.62秒完成');
assert(Math.abs(INSPECTION_NORMAL_TOTAL_SECONDS - 2.62 - 0.28) < 1e-9, 'pass/fail最终姿势必须清晰保持280ms');
assert(Math.abs(INSPECTION_NORMAL_TOTAL_SECONDS + RESULT_MODAL_ENTRANCE_SECONDS - 3.08) < 1e-9, '结算弹窗必须在3.08秒稳定');
assert(INSPECTION_NORMAL_TOTAL_SECONDS + RESULT_MODAL_ENTRANCE_SECONDS <= INSPECTION_MAX_TOTAL_SECONDS, '正常模式整体视觉稳定不得超过3.20秒');
assert(Math.abs(INSPECTION_REDUCED_TOTAL_SECONDS + RESULT_MODAL_REDUCED_ENTRANCE_SECONDS - 2.63) < 1e-9, '减少动态检查仍在2.55秒结算，并仅淡入80ms');
const fourStepTimeline = calculateInspectionAnimationTimeline(4, false);
assert(
    fourStepTimeline.progressUpdates.some((update) => update.atSeconds >= 1.02 && update.atSeconds <= 1.42),
    'magnifier关键帧期间检查进度必须继续刷新',
);

const successNods = SUCCESS_HEAD_REACTION.filter((frame) => frame.y < 0);
assert(successNods.length === 2, '成功反应必须包含一大一小两次点头');
assert(successNods[0].y >= -22 && successNods[0].y <= -18, '首次点头必须下沉18～22设计像素');
assert(successNods[0].scaleY >= 0.93 && successNods[0].scaleY <= 0.95, '首次点头必须明显纵向压缩');
assert(successNods[1].y >= -12 && successNods[1].y <= -10, '第二次点头必须下沉10～12设计像素');
assert(successNods[1].scaleY === 0.96, '第二次点头必须保留0.96纵向压缩');
assert(SUCCESS_HEAD_REACTION[1].y >= 3 && SUCCESS_HEAD_REACTION[1].y <= 5, '首次点头后必须回弹到原位上方3～5设计像素');
assert(SUCCESS_HEAD_REACTION[3].y === 0 && SUCCESS_HEAD_REACTION[3].scaleY === 1, '第二次点头后必须再次回弹到中立姿态');
assert(SUCCESS_HEAD_REACTION.every((frame) => frame.angle === 0 && frame.x === 0), '成功点头不得使用左右摇摆作为主要动作');
assert(
    JSON.stringify(SUCCESS_HEAD_REACTION) === JSON.stringify([
        { seconds: 0.12, x: 0, y: -20, scaleY: 0.94, angle: 0, easing: 'quadIn' },
        { seconds: 0.12, x: 0, y: 4, scaleY: 1, angle: 0, easing: 'backOut' },
        { seconds: 0.12, x: 0, y: -11, scaleY: 0.96, angle: 0, easing: 'quadIn' },
        { seconds: 0.19, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'backOut' },
        { seconds: 0.05, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'quadOut' },
    ]),
    '成功点头已验收的位移、缩放、时长和缓动不得改变',
);
assert(
    FAILURE_HEAD_REACTION.slice(0, 5).map((frame) => frame.angle).join(',') === '-7,7,-5,5,0',
    '失败反应必须按-7°、+7°、-5°、+5°、0°依次摇头',
);
assert(FAILURE_HEAD_REACTION.every((frame) => Math.abs(frame.x) <= 3), '失败摇头水平位移不得超过3设计像素');
assert(FAILURE_HEAD_REACTION.every((frame) => frame.y === 0 && frame.scaleY === 1), '失败摇头不得使用上下点动作为主要动作');
assert(
    JSON.stringify(FAILURE_HEAD_REACTION) === JSON.stringify([
        { seconds: 0.09, x: -2, y: 0, scaleY: 1, angle: -7, easing: 'quadInOut' },
        { seconds: 0.1, x: 2, y: 0, scaleY: 1, angle: 7, easing: 'quadInOut' },
        { seconds: 0.09, x: -1.5, y: 0, scaleY: 1, angle: -5, easing: 'quadInOut' },
        { seconds: 0.1, x: 1.5, y: 0, scaleY: 1, angle: 5, easing: 'quadInOut' },
        { seconds: 0.14, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'quadOut' },
        { seconds: 0.06, x: 0, y: 0, scaleY: 1, angle: 0, easing: 'quadOut' },
    ]),
    '失败摇头的角度、位移、节奏和缓动不得改变',
);
assert(
    JSON.stringify(SUCCESS_HEAD_REACTION.map(({ x, y, scaleY, angle }) => ({ x, y, scaleY, angle })))
    !== JSON.stringify(FAILURE_HEAD_REACTION.map(({ x, y, scaleY, angle }) => ({ x, y, scaleY, angle }))),
    '点头和摇头轨迹必须明显不同',
);
const successLast = SUCCESS_HEAD_REACTION[SUCCESS_HEAD_REACTION.length - 1];
const failureLast = FAILURE_HEAD_REACTION[FAILURE_HEAD_REACTION.length - 1];
assert(successLast.x === 0 && successLast.y === 0 && successLast.scaleY === 1 && successLast.angle === 0, '点头结束必须恢复中立');
assert(failureLast.x === 0 && failureLast.y === 0 && failureLast.scaleY === 1 && failureLast.angle === 0, '摇头结束必须恢复中立');
for (const [name, reaction] of [
    ['点头', SUCCESS_HEAD_REACTION],
    ['摇头', FAILURE_HEAD_REACTION],
] as const) {
    const duration = reactionDuration(reaction);
    assert(duration >= 0.55 && duration <= 0.65, `${name}时长必须为0.55～0.65秒`);
    assert(INSPECTION_NORMAL_OUTCOME_SECONDS + duration < INSPECTION_NORMAL_TOTAL_SECONDS, `${name}必须在2.9秒流程内完成`);
}
assert(SUCCESS_BODY_REACTION.every((frame) => Math.abs(frame.y) <= 3 && frame.x === 0), '成功时身体最多下沉3设计像素');
assert(FAILURE_BODY_REACTION.every((frame) => Math.abs(frame.y) <= 2 && Math.abs(frame.x) <= 1), '失败时身体必须基本静止');
assert(
    Math.abs(reactionDuration(SUCCESS_BODY_REACTION) - reactionDuration(SUCCESS_HEAD_REACTION)) < 1e-9,
    '成功头身辅助动作必须同时结束',
);
assert(
    Math.abs(reactionDuration(FAILURE_BODY_REACTION) - reactionDuration(FAILURE_HEAD_REACTION)) < 1e-9,
    '失败头身辅助动作必须同时结束',
);

for (const taskResults of requiredCases) {
    const result = runRound(new GameStateMachine(), new InspectionSequence(), taskResults);
    assert(result.inspectedIndexes.join(',') === '0,1,2,3', '每轮必须依次检查四项');
    assert(result.settlementCount === 1, '每轮只能结算一次');
    assert(
        result.finalState === (taskResults.every(Boolean) ? GameState.SUCCESS : GameState.FAILURE),
        '结算状态必须匹配任务汇总',
    );
}

const retryMachine = new GameStateMachine();
const retrySequence = new InspectionSequence();
for (const taskResults of [
    [true, true, true, true],
    [true, false, false, false],
    [true, true, true, true],
] as const) {
    const result = runRound(retryMachine, retrySequence, taskResults);
    assert(result.inspectedIndexes.length === 4, '连续重试时每轮都必须检查四项');
    assert(result.settlementCount === 1, '连续重试时每轮只能结算一次');
}

const ratios = [
    { name: '750x1334', width: 750, height: 1334, expectedHeight: 1334 },
    { name: '360x640', width: 360, height: 640, expectedHeight: 1334 },
    { name: '360x780', width: 360, height: 780, expectedHeight: 1625 },
    { name: '360x800', width: 360, height: 800, expectedHeight: 5000 / 3 },
    { name: '393x852', width: 393, height: 852, expectedHeight: 750 * 852 / 393 },
    { name: '393x873', width: 393, height: 873, expectedHeight: 750 * 873 / 393 },
] as const;

let baseWorkspaceHeight = 0;
let tallWorkspaceHeight = 0;

for (let index = 0; index < ratios.length; index += 1) {
    const ratio = ratios[index];
    const viewport = calculateFixedWidthViewport(ratio.width, ratio.height, 750, 1334);
    assert(Math.abs(viewport.height - ratio.expectedHeight) < 0.01, `${ratio.name} 可视高度不正确`);
    assert(viewport.height >= 1334, `${ratio.name} 背景必须覆盖安全设计区`);
    const navigation = calculateGameTopNavigationLayout(viewport, null);
    const layout = calculatePortraitGameLayout(
        viewport,
        DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS,
        navigation.y,
    );
    const workspace = calculateWorkspaceLayout(layout.workspaceHeight);
    const startLayout = calculateStartPageLayout(viewport);
    const selectLayout = calculateLevelSelectLayout(viewport, 5);
    const overlayLayout = calculateFullscreenOverlayLayout(viewport);
    const backgroundLayout = calculateFullBleedBackgroundLayout(viewport);
    const inspectionLayout = calculateInspectionAnimationLayout(viewport);
    const coverLayout = calculateCoverLayout(backgroundLayout.width, backgroundLayout.height, 750, 1334);
    assert(
        backgroundLayout.x === 0
        && backgroundLayout.y === 0
        && backgroundLayout.width === 750
        && backgroundLayout.height === viewport.height,
        `${ratio.name} FullBleedBackground 必须覆盖完整可视设计区域`,
    );
    assert(
        coverLayout.renderedWidth + 0.01 >= backgroundLayout.width
        && coverLayout.renderedHeight + 0.01 >= backgroundLayout.height,
        `${ratio.name} cover 背景不得出现白边、黑边或断层`,
    );
    assert(
        Math.abs(coverLayout.renderedWidth / coverLayout.renderedHeight - 750 / 1334) < 0.0001,
        `${ratio.name} cover 背景不得非等比拉伸`,
    );
    const inspectionActorRect = centeredRect(
        inspectionLayout.actorX,
        inspectionLayout.actorY,
        inspectionLayout.actorWidth,
        inspectionLayout.actorHeight,
    );
    assert(inspectionActorRect.left >= -viewport.width / 2, `${ratio.name} Boss 左侧不得溢出屏幕`);
    assert(inspectionActorRect.right <= viewport.width / 2, `${ratio.name} Boss 右侧不得溢出屏幕`);
    assert(inspectionActorRect.top <= viewport.safeTop, `${ratio.name} Boss 头顶不得进入顶部安全区`);
    assert(inspectionActorRect.bottom >= viewport.safeBottom, `${ratio.name} Boss 双脚不得越过底部安全区`);
    assert(
        Math.abs(inspectionLayout.actorWidth / inspectionLayout.actorHeight - 1024 / 1536) < 0.0001,
        `${ratio.name} Boss 必须按原图比例等比缩放`,
    );
    assert(
        inspectionLayout.actorEntryX - inspectionLayout.actorWidth / 2 >= viewport.width / 2,
        `${ratio.name} Boss 进场起点必须位于屏幕右侧之外`,
    );
    assert(inspectionLayout.titleY <= viewport.safeTop, `${ratio.name} 检查标题不得进入顶部安全区`);
    assert(inspectionLayout.feedbackY - 46 >= viewport.safeBottom, `${ratio.name} 检查结果不得越过底部安全区`);
    const backButtonRect = centeredRect(
        navigation.backButtonX,
        navigation.y,
        navigation.backButtonSize,
        navigation.backButtonSize,
    );
    const titleRect = centeredRect(
        navigation.titleX,
        navigation.y,
        navigation.titleWidth,
        navigation.titleHeight,
    );
    assert(backButtonRect.left >= -viewport.width / 2, `${ratio.name} 返回按钮不得越过左侧安全边界`);
    assert(backButtonRect.top <= viewport.safeTop, `${ratio.name} 返回按钮不得越过Web顶部安全边界`);
    assert(
        navigation.backButtonSize >= 72 && navigation.backButtonSize <= 80,
        `${ratio.name} 返回按钮触摸区必须保持72～80设计像素`,
    );
    assert(!intersects(backButtonRect, titleRect), `${ratio.name} 标题不得与返回按钮重叠`);
    assert(
        titleRect.left - backButtonRect.right >= 16 && titleRect.left - backButtonRect.right <= 20,
        `${ratio.name} 返回箭头与标题间距必须保持16～20设计像素`,
    );
    assert(layout.headerY === navigation.y, `${ratio.name} 标题与返回按钮必须处于同一行`);
    assert(layout.bossY < layout.headerY, `${ratio.name} 老板进度必须位于标题下方`);
    assert(layout.taskY < layout.bossY, `${ratio.name} 任务清单必须位于老板进度下方`);
    assert(layout.workspaceHeight >= 690 && layout.workspaceHeight <= 1120, `${ratio.name} 工位高度越界`);
    assert(layout.helperY > viewport.safeBottom, `${ratio.name} 底部提示必须位于底部安全区内`);
    assert(startLayout.titleY < viewport.safeTop, `${ratio.name} 开始页标题必须位于顶部安全区内`);
    assert(startLayout.startButtonY - 52 > viewport.safeBottom, `${ratio.name} 开始按钮必须位于底部安全区上方`);
    assert(startLayout.elevatorTop < startLayout.subtitleY - 20, `${ratio.name} 电梯不得遮挡副标题`);
    assert(startLayout.elevatorBottom > startLayout.startButtonY + 52, `${ratio.name} 电梯不得遮挡开始按钮`);

    const bossBottom = layout.bossY - DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.bossHeight / 2;
    const bossTop = layout.bossY + DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.bossHeight / 2;
    const navigationBottom = navigation.y - navigation.height / 2;
    const taskTop = layout.taskY + DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.taskHeight / 2;
    const taskBottom = layout.taskY - DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.taskHeight / 2;
    const workspaceTop = layout.workspaceY + layout.workspaceHeight / 2;
    const workspaceBottom = layout.workspaceY - layout.workspaceHeight / 2;
    const helperTop = layout.helperY + DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.helperHeight / 2;
    assert(
        navigationBottom - bossTop >= 16 && navigationBottom - bossTop <= 20,
        `${ratio.name} 老板进度与顶部导航应保持16～20设计像素净间距`,
    );
    assert(bossBottom - taskTop >= 12, `${ratio.name} 老板进度与任务清单不得重叠`);
    assert(taskBottom - workspaceTop >= 12, `${ratio.name} 任务清单与办公室场景不得重叠`);
    assert(workspaceBottom - helperTop >= 12, `${ratio.name} 工位与操作提示不得重叠`);

    const workspaceTitleTop = layout.workspaceY + workspace.titleY + WORKSPACE_TITLE_HEIGHT / 2;
    const taskToTitleGap = taskBottom - workspaceTitleTop;
    assert(
        taskToTitleGap >= 20 && taskToTitleGap <= 30.01,
        `${ratio.name} 任务面板到工位标题应保持20～30设计像素，实际为${taskToTitleGap}`,
    );

    const workspaceTitleBottom = layout.workspaceY + workspace.titleY - WORKSPACE_TITLE_HEIGHT / 2;
    const deskTop = layout.workspaceY + workspace.deskY + WORKSPACE_DESK_HEIGHT / 2;
    const titleToDeskGap = workspaceTitleBottom - deskTop;
    assert(
        titleToDeskGap >= 0 && titleToDeskGap <= 30,
        `${ratio.name} 工位标题到桌面不应超过30设计像素，实际为${titleToDeskGap}`,
    );

    const baselineBottomTargetCenterY = -230;
    const baselineBottomTargetHeight = 150;
    const bottomTargetBottom = layout.workspaceY
        + workspace.bottomContentY
        + baselineBottomTargetCenterY
        - baselineBottomTargetHeight / 2;
    const workspaceOccupiedHeight = deskTop - bottomTargetBottom;
    assert(
        workspaceOccupiedHeight / layout.workspaceHeight >= 0.7,
        `${ratio.name} 桌面与底部目标应共同占用工位至少70%高度`,
    );
    assert(
        Math.abs(workspace.topContentY - (layout.workspaceHeight - WORKSPACE_BASE_CONTENT_HEIGHT) / 2) < 0.01,
        `${ratio.name} 基准内容必须锚定工位顶部`,
    );
    assert(
        Math.abs(workspace.bottomContentY + (layout.workspaceHeight - WORKSPACE_BASE_CONTENT_HEIGHT) / 2) < 0.01,
        `${ratio.name} 底部目标必须锚定工位底部`,
    );
    const helperBottom = layout.helperY - DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.helperHeight / 2;
    assert(
        helperBottom >= viewport.safeBottom + DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.bottomPadding,
        `${ratio.name} 操作提示必须位于底部安全区上方`,
    );
    assert(selectLayout.panelHeight <= viewport.safeHeight, `${ratio.name} 关卡面板必须位于安全区内`);
    assert(selectLayout.titleY > selectLayout.listTop, `${ratio.name} 关卡标题必须位于列表上方`);
    assert(selectLayout.entryHeight >= 108 && selectLayout.entryHeight <= 126, `${ratio.name} 关卡记录行应保持紧凑`);
    assert(selectLayout.backButtonY < selectLayout.listBottom, `${ratio.name} 返回首页必须位于列表下方`);
    const selectContentTop = selectLayout.panelY + selectLayout.panelHeight / 2;
    const selectContentBottom = selectLayout.panelY - selectLayout.panelHeight / 2;
    assert(selectContentTop <= viewport.safeTop, `${ratio.name} 选关内容顶部不得超出安全区`);
    assert(selectContentBottom >= viewport.safeBottom, `${ratio.name} 选关内容底部不得超出安全区`);
    const firstEntryTop = selectLayout.panelY + selectLayout.listTop;
    const lastEntryBottom = selectLayout.panelY
        + selectLayout.listTop
        - 4 * (selectLayout.entryHeight + selectLayout.entryGap)
        - selectLayout.entryHeight;
    assert(firstEntryTop <= viewport.safeTop, `${ratio.name} 第一张关卡卡片不得超出安全区`);
    assert(lastEntryBottom >= viewport.safeBottom, `${ratio.name} 第五张关卡卡片不得超出安全区`);
    assert(
        selectLayout.panelY + selectLayout.backButtonY - 41 >= viewport.safeBottom,
        `${ratio.name} 返回首页按钮不得超出底部安全区`,
    );
    assert(
        overlayLayout.x === 0
        && overlayLayout.y === 0
        && overlayLayout.width === viewport.width
        && overlayLayout.height === viewport.height,
        `${ratio.name} 教学、检查和结算遮罩必须完整覆盖屏幕`,
    );
    for (const modalHeight of [760, 520, 490, 470, RESULT_VISUAL_METRICS.cardHeight, 310]) {
        const modal = calculateSafeModalLayout(viewport, modalHeight);
        assert(modal.top <= viewport.safeTop, `${ratio.name} 高${modalHeight}弹窗不得超出顶部安全区`);
        assert(modal.bottom >= viewport.safeBottom, `${ratio.name} 高${modalHeight}弹窗不得超出底部安全区`);
    }
    const occupiedListHeight = selectLayout.entryHeight * 5 + selectLayout.entryGap * 4;
    assert(
        Math.abs(occupiedListHeight - (selectLayout.listTop - selectLayout.listBottom)) < 0.01,
        `${ratio.name} 关卡列表必须使用完整剩余高度`,
    );
    if (index === 0) {
        baseWorkspaceHeight = layout.workspaceHeight;
    }
    if (index === ratios.length - 1) {
        tallWorkspaceHeight = layout.workspaceHeight;
    }
}

assert(readDouyinMenuButtonRect({}) === null, 'Web 环境不得伪造抖音胶囊安全区');
assert(
    readDouyinMenuButtonRect({ tt: { getMenuButtonBoundingClientRect: () => { throw new Error('unsupported'); } } }) === null,
    '抖音胶囊接口异常时必须安全降级',
);
const simulatedMenuRect = readDouyinMenuButtonRect({
    tt: {
        getMenuButtonBoundingClientRect: () => ({ left: 270, top: 14, right: 382, bottom: 53 }),
    },
});
assert(simulatedMenuRect !== null, '应通过能力检测读取抖音胶囊矩形');

for (const ratio of ratios) {
    const webViewport = calculateFixedWidthViewport(ratio.width, ratio.height, 750, 1334);
    const unchangedWebViewport = reserveDouyinMenuButtonSafeArea(
        webViewport,
        ratio.width,
        ratio.height,
        750,
        null,
    );
    assert(unchangedWebViewport === webViewport, `${ratio.name} Web 布局必须保持原有效果`);
    const screenScale = ratio.width / 393;
    const ratioMenuRect = readDouyinMenuButtonRect({
        tt: {
            getMenuButtonBoundingClientRect: () => ({
                left: ratio.width - 123 * screenScale,
                top: 14 * screenScale,
                right: ratio.width - 12 * screenScale,
                bottom: 53 * screenScale,
            }),
        },
    });
    assert(ratioMenuRect !== null, `${ratio.name} 应生成模拟抖音胶囊矩形`);
    if (ratioMenuRect === null) { continue; }
    const menuRect = convertScreenRectToViewport(ratioMenuRect, ratio.width, ratio.height, 750);
    assert(menuRect !== null, `${ratio.name} 胶囊矩形应能转换到设计坐标`);
    if (menuRect === null) { continue; }
    const douyinViewport = reserveDouyinMenuButtonSafeArea(
        webViewport,
        ratio.width,
        ratio.height,
        750,
        ratioMenuRect,
    );
    const navigation = calculateGameTopNavigationLayout(douyinViewport, menuRect);
    const gameLayout = calculatePortraitGameLayout(
        douyinViewport,
        DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS,
        navigation.y,
    );
    const startLayout = calculateStartPageLayout(douyinViewport);
    const selectLayout = calculateLevelSelectLayout(douyinViewport, 5);
    const levelSelectTitleY = selectLayout.panelY + selectLayout.titleY;
    const protectedNodes = [
        { name: '首页标题', rect: centeredRect(0, startLayout.titleY, 610, 96) },
        { name: '设置按钮', rect: centeredRect(284, douyinViewport.safeTop - 50, 112, 80) },
        {
            name: '游戏页返回按钮',
            rect: centeredRect(
                navigation.backButtonX,
                navigation.y,
                navigation.backButtonSize,
                navigation.backButtonSize,
            ),
        },
        {
            name: '游戏页标题',
            rect: centeredRect(
                navigation.titleX,
                navigation.y,
                navigation.titleWidth,
                navigation.titleHeight,
            ),
        },
        { name: '选关页标题', rect: centeredRect(0, levelSelectTitleY, 560, 64) },
    ];
    for (let index = 0; index < 5; index += 1) {
        protectedNodes.push({
            name: `第${index + 1}张关卡卡片`,
            rect: centeredRect(
                0,
                selectLayout.panelY
                    + selectLayout.listTop
                    - selectLayout.entryHeight / 2
                    - index * (selectLayout.entryHeight + selectLayout.entryGap),
                610,
                selectLayout.entryHeight,
            ),
        });
    }
    for (const node of protectedNodes) {
        assert(!intersects(node.rect, menuRect), `${ratio.name} ${node.name}不得与抖音胶囊相交`);
    }
    const gameBackRect = protectedNodes[2].rect;
    const gameTitleRect = protectedNodes[3].rect;
    const bossRect = centeredRect(
        0,
        gameLayout.bossY,
        680,
        DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.bossHeight,
    );
    assert(!intersects(gameBackRect, gameTitleRect), `${ratio.name} 游戏页标题不得与返回按钮重叠`);
    assert(gameBackRect.left >= -douyinViewport.width / 2, `${ratio.name} 返回按钮不得越过左侧安全边界`);
    assert(gameBackRect.top <= douyinViewport.height / 2, `${ratio.name} 返回按钮不得越过屏幕顶部`);
    assert(gameBackRect.bottom >= douyinViewport.safeBottom, `${ratio.name} 返回按钮不得越过底部安全边界`);
    assert(
        Math.abs(navigation.y - (menuRect.top + menuRect.bottom) / 2) < 0.01,
        `${ratio.name} 返回按钮与标题必须和抖音胶囊垂直居中`,
    );
    assert(
        navigation.contentRight <= menuRect.left - 24 + 0.01,
        `${ratio.name} 顶部导航与胶囊左边缘至少保留24设计像素`,
    );
    assert(!intersects(bossRect, gameBackRect), `${ratio.name} 老板进度不得与返回按钮重叠`);
    assert(!intersects(bossRect, gameTitleRect), `${ratio.name} 老板进度不得与标题重叠`);
    assert(!intersects(bossRect, menuRect), `${ratio.name} 老板进度不得与抖音胶囊重叠`);
    const navigationAndCapsuleBottom = Math.min(gameBackRect.bottom, menuRect.bottom);
    assert(
        navigationAndCapsuleBottom - bossRect.top >= 16
        && navigationAndCapsuleBottom - bossRect.top <= 20,
        `${ratio.name} 老板进度与顶部导航及胶囊应保留16～20设计像素`,
    );
    for (const modalHeight of [760, 520, 490, 470, RESULT_VISUAL_METRICS.cardHeight, 310]) {
        const modal = calculateSafeModalLayout(douyinViewport, modalHeight);
        const modalRect = centeredRect(0, modal.centerY, 680, modalHeight);
        assert(!intersects(modalRect, menuRect), `${ratio.name} 高${modalHeight}弹窗不得与抖音胶囊相交`);
        assert(modal.top <= douyinViewport.safeTop, `${ratio.name} 弹窗顶部必须位于抖音安全区内`);
        assert(modal.bottom >= douyinViewport.safeBottom, `${ratio.name} 弹窗底部必须位于抖音安全区内`);
    }
    const overlayLayout = calculateFullscreenOverlayLayout(douyinViewport);
    assert(
        overlayLayout.width === douyinViewport.width && overlayLayout.height === douyinViewport.height,
        `${ratio.name} 抖音安全区调整后弹窗遮罩仍须完整覆盖屏幕`,
    );
}

assert(tallWorkspaceHeight > baseWorkspaceHeight, '长屏增加的空间应优先扩展工位区域');

const resultStatusBottom = RESULT_VISUAL_METRICS.statusCenterY - RESULT_VISUAL_METRICS.statusHeight / 2;
const resultTitleTop = RESULT_VISUAL_METRICS.titleCenterY + RESULT_VISUAL_METRICS.titleHeight / 2;
assert(resultStatusBottom - resultTitleTop >= 24, '成功对勾与结算标题至少间隔24设计像素');
for (const ratio of ratios.filter((entry) => entry.name === '360x640' || entry.name.startsWith('393x'))) {
    const viewport = calculateFixedWidthViewport(ratio.width, ratio.height, 750, 1334);
    assert(RESULT_VISUAL_METRICS.cardHeight <= viewport.safeHeight, `${ratio.name} 结算卡片必须完整位于安全区`);
}

const trayBounds = { left: 108, right: 328, bottom: 61, top: 203 } as const;
const plantArtworkBounds = {
    left: 72 + LEVEL_ONE_PLANT_VISUAL_OFFSET_X - 57,
    right: 72 + LEVEL_ONE_PLANT_VISUAL_OFFSET_X + 57,
    bottom: 82 - 66,
    top: 82 + 103,
} as const;
const trayCoveredRatio = calculateCoveredRatio(trayBounds, plantArtworkBounds);
assert(trayCoveredRatio <= 0.2, `第一关待检查托盘至少应有80%区域清晰可见，遮挡率为${trayCoveredRatio}`);

const notchedViewport = calculateFixedWidthViewport(
    360,
    800,
    750,
    1334,
    { y: 28, height: 1572 },
);
assert(notchedViewport.bottomSafeInset >= 28, '应换算设备底部安全区');
assert(notchedViewport.topSafeInset > 60, '应换算设备顶部安全区');

console.log('PASS: gameplay flow, full-bleed office layout, modal safety, capsule regressions');
