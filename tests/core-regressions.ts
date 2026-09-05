import { GameState, GameStateMachine } from '../assets/scripts/core/GameStateMachine';
import { InspectionSequence } from '../assets/scripts/core/InspectionSequence';
import {
    calculateFixedWidthViewport,
    calculateLevelSelectLayout,
    calculatePortraitGameLayout,
    calculateWorkspaceLayout,
    DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS,
    WORKSPACE_BASE_CONTENT_HEIGHT,
    WORKSPACE_DESK_HEIGHT,
    WORKSPACE_TITLE_HEIGHT,
} from '../assets/scripts/core/ViewportLayout';

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
    const selectLayout = calculateLevelSelectLayout(viewport, 5);
    assert(layout.headerY < viewport.safeTop, `${ratio.name} 标题必须位于顶部安全区内`);
    assert(layout.bossY < layout.headerY, `${ratio.name} 老板进度必须位于标题下方`);
    assert(layout.taskY < layout.bossY, `${ratio.name} 任务清单必须位于老板进度下方`);
    assert(layout.workspaceHeight >= 690 && layout.workspaceHeight <= 1120, `${ratio.name} 工位高度越界`);
    assert(layout.helperY > viewport.safeBottom, `${ratio.name} 底部提示必须位于底部安全区内`);

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
    assert(selectLayout.backButtonY < selectLayout.listBottom, `${ratio.name} 返回首页必须位于列表下方`);
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

assert(tallWorkspaceHeight > baseWorkspaceHeight, '长屏增加的空间应优先扩展工位区域');

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
