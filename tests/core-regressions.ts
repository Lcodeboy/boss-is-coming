import { GameState, GameStateMachine } from '../assets/scripts/core/GameStateMachine';
import { InspectionSequence } from '../assets/scripts/core/InspectionSequence';
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
    calculateLevelSelectLayout,
    calculatePortraitGameLayout,
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
    const layout = calculatePortraitGameLayout(viewport, DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS);
    const workspace = calculateWorkspaceLayout(layout.workspaceHeight);
    const startLayout = calculateStartPageLayout(viewport);
    const selectLayout = calculateLevelSelectLayout(viewport, 5);
    const overlayLayout = calculateFullscreenOverlayLayout(viewport);
    const backgroundLayout = calculateFullBleedBackgroundLayout(viewport);
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
    assert(layout.headerY < viewport.safeTop, `${ratio.name} 标题必须位于顶部安全区内`);
    assert(layout.bossY < layout.headerY, `${ratio.name} 老板进度必须位于标题下方`);
    assert(layout.taskY < layout.bossY, `${ratio.name} 任务清单必须位于老板进度下方`);
    assert(layout.workspaceHeight >= 690 && layout.workspaceHeight <= 1120, `${ratio.name} 工位高度越界`);
    assert(layout.helperY > viewport.safeBottom, `${ratio.name} 底部提示必须位于底部安全区内`);
    assert(startLayout.titleY < viewport.safeTop, `${ratio.name} 开始页标题必须位于顶部安全区内`);
    assert(startLayout.startButtonY - 52 > viewport.safeBottom, `${ratio.name} 开始按钮必须位于底部安全区上方`);
    assert(startLayout.elevatorTop < startLayout.subtitleY - 20, `${ratio.name} 电梯不得遮挡副标题`);
    assert(startLayout.elevatorBottom > startLayout.startButtonY + 52, `${ratio.name} 电梯不得遮挡开始按钮`);

    const taskBottom = layout.taskY - DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.taskHeight / 2;
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

for (const ratio of ratios.filter((entry) => entry.name === '393x852' || entry.name === '393x873')) {
    const webViewport = calculateFixedWidthViewport(ratio.width, ratio.height, 750, 1334);
    const unchangedWebViewport = reserveDouyinMenuButtonSafeArea(
        webViewport,
        ratio.width,
        ratio.height,
        750,
        null,
    );
    assert(unchangedWebViewport === webViewport, `${ratio.name} Web 布局必须保持原有效果`);
    if (simulatedMenuRect === null) { continue; }
    const menuRect = convertScreenRectToViewport(simulatedMenuRect, ratio.width, ratio.height, 750);
    assert(menuRect !== null, `${ratio.name} 胶囊矩形应能转换到设计坐标`);
    if (menuRect === null) { continue; }
    const douyinViewport = reserveDouyinMenuButtonSafeArea(
        webViewport,
        ratio.width,
        ratio.height,
        750,
        simulatedMenuRect,
    );
    const gameLayout = calculatePortraitGameLayout(douyinViewport, DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS);
    const startLayout = calculateStartPageLayout(douyinViewport);
    const selectLayout = calculateLevelSelectLayout(douyinViewport, 5);
    const levelSelectTitleY = selectLayout.panelY + selectLayout.titleY;
    const protectedNodes = [
        { name: '首页标题', rect: centeredRect(0, startLayout.titleY, 610, 96) },
        { name: '设置按钮', rect: centeredRect(284, douyinViewport.safeTop - 50, 112, 80) },
        { name: '游戏页标题', rect: centeredRect(-175, gameLayout.headerY, 320, 54) },
        { name: '退出按钮', rect: centeredRect(284, gameLayout.headerY, 112, 80) },
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

console.log('PASS: inspection failure paths, single settlement, three retries, fixed-width portrait ratios');
