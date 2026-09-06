export interface FixedWidthViewport {
    readonly width: number;
    readonly height: number;
    readonly extraVerticalSpace: number;
    readonly topSafeInset: number;
    readonly bottomSafeInset: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly safeHeight: number;
}

export interface SafeAreaRectData {
    readonly y: number;
    readonly height: number;
}

export interface PortraitGameLayout {
    readonly headerY: number;
    readonly bossY: number;
    readonly taskY: number;
    readonly workspaceY: number;
    readonly workspaceHeight: number;
    readonly helperY: number;
}

export interface PortraitGameLayoutOptions {
    readonly topPadding: number;
    readonly bottomPadding: number;
    readonly headerHeight: number;
    readonly bossHeight: number;
    readonly taskHeight: number;
    readonly helperHeight: number;
    readonly sectionGap: number;
    readonly workspaceMinHeight: number;
    readonly workspaceMaxHeight: number;
}

export interface LevelSelectLayout {
    readonly panelY: number;
    readonly panelHeight: number;
    readonly titleY: number;
    readonly subtitleY: number;
    readonly backButtonY: number;
    readonly listTop: number;
    readonly listBottom: number;
    readonly entryHeight: number;
    readonly entryGap: number;
}

export interface WorkspaceLayout {
    readonly topContentY: number;
    readonly bottomContentY: number;
    readonly titleY: number;
    readonly deskY: number;
    readonly floorY: number;
    readonly floorHeight: number;
    readonly targetBandY: number;
    readonly targetBandHeight: number;
}

export interface StartPageLayout {
    readonly titleY: number;
    readonly subtitleY: number;
    readonly elevatorY: number;
    readonly elevatorHeight: number;
    readonly elevatorTop: number;
    readonly elevatorBottom: number;
    readonly ledY: number;
    readonly alertY: number;
    readonly startButtonY: number;
    readonly bossY: number;
}

export const WORKSPACE_BASE_CONTENT_HEIGHT = 690;
export const WORKSPACE_TITLE_BASELINE_Y = 306;
export const WORKSPACE_TITLE_HEIGHT = 42;
export const WORKSPACE_DESK_BASELINE_Y = 53;
export const WORKSPACE_DESK_HEIGHT = 405;

export const DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS: PortraitGameLayoutOptions = {
    topPadding: 18,
    bottomPadding: 20,
    headerHeight: 54,
    bossHeight: 190,
    taskHeight: 164,
    helperHeight: 38,
    sectionGap: 12,
    workspaceMinHeight: 690,
    workspaceMaxHeight: 1120,
};

/** 计算 FIXED_WIDTH 下的可视设计尺寸，并将系统安全区换算到居中坐标。 */
export function calculateFixedWidthViewport(
    frameWidth: number,
    frameHeight: number,
    designWidth: number,
    safeHeight: number,
    safeArea?: SafeAreaRectData,
): FixedWidthViewport {
    if (frameWidth <= 0 || frameHeight <= 0 || designWidth <= 0 || safeHeight <= 0) {
        return createViewport(designWidth, safeHeight, safeHeight, safeHeight, undefined);
    }

    const visibleHeight = designWidth * frameHeight / frameWidth;
    const coveredHeight = Math.max(safeHeight, visibleHeight);
    return createViewport(designWidth, coveredHeight, visibleHeight, safeHeight, safeArea);
}

/** 根据安全区纵向排列游戏主界面；尺寸变化不会缩放工位内部坐标。 */
export function calculatePortraitGameLayout(
    viewport: FixedWidthViewport,
    options: PortraitGameLayoutOptions,
): PortraitGameLayout {
    const headerY = viewport.safeTop - options.topPadding - options.headerHeight / 2;
    const bossY = headerY
        - options.headerHeight / 2
        - options.sectionGap
        - options.bossHeight / 2;
    const taskY = bossY
        - options.bossHeight / 2
        - options.sectionGap
        - options.taskHeight / 2;
    const helperY = viewport.safeBottom + options.bottomPadding + options.helperHeight / 2;
    const workspaceTop = taskY - options.taskHeight / 2 - options.sectionGap;
    const workspaceBottom = helperY + options.helperHeight / 2 + options.sectionGap;
    const availableWorkspaceHeight = Math.max(0, workspaceTop - workspaceBottom);
    const workspaceHeight = clamp(
        availableWorkspaceHeight,
        options.workspaceMinHeight,
        options.workspaceMaxHeight,
    );

    return {
        headerY,
        bossY,
        taskY,
        // 工位达到最大高度后仍贴住任务面板，多余高度留给底部背景而不是再次均分。
        workspaceY: workspaceTop - workspaceHeight / 2,
        workspaceHeight,
        helperY,
    };
}

/** 让关卡标题、列表和返回按钮分别使用顶部、剩余区和底部安全区。 */
export function calculateLevelSelectLayout(
    viewport: FixedWidthViewport,
    entryCount: number,
): LevelSelectLayout {
    const panelTop = viewport.safeTop - 24;
    const panelBottom = viewport.safeBottom + 24;
    const panelHeight = Math.max(1, panelTop - panelBottom);
    const panelY = (panelTop + panelBottom) / 2;
    const titleY = panelHeight / 2 - 62;
    const subtitleY = panelHeight / 2 - 118;
    const backButtonY = -panelHeight / 2 + 68;
    const listTop = panelHeight / 2 - 158;
    const listBottom = backButtonY + 70;
    const listHeight = Math.max(1, listTop - listBottom);
    const safeEntryCount = Math.max(0, Math.floor(entryCount));
    const minimumGap = 16;

    if (safeEntryCount === 0) {
        return {
            panelY,
            panelHeight,
            titleY,
            subtitleY,
            backButtonY,
            listTop,
            listBottom,
            entryHeight: 0,
            entryGap: 0,
        };
    }

    const entryHeight = clamp(listHeight / safeEntryCount - minimumGap, 108, 126);
    const entryGap = safeEntryCount > 1
        ? Math.max(minimumGap, (listHeight - entryHeight * safeEntryCount) / (safeEntryCount - 1))
        : 0;
    return {
        panelY,
        panelHeight,
        titleY,
        subtitleY,
        backButtonY,
        listTop,
        listBottom,
        entryHeight,
        entryGap,
    };
}

/** 将690高基准内容分别锚定工位顶部和底部，不缩放内部物品与碰撞坐标。 */
export function calculateWorkspaceLayout(workspaceHeight: number): WorkspaceLayout {
    const safeHeight = Math.max(WORKSPACE_BASE_CONTENT_HEIGHT, workspaceHeight);
    const contentOffset = (safeHeight - WORKSPACE_BASE_CONTENT_HEIGHT) / 2;
    const floorBottom = -safeHeight / 2 + 18;
    const floorHeight = Math.max(300, safeHeight - 390);
    const targetBandHeight = 210;
    const targetBandY = -safeHeight / 2 + 28 + targetBandHeight / 2;
    return {
        topContentY: contentOffset,
        bottomContentY: -contentOffset,
        titleY: contentOffset + WORKSPACE_TITLE_BASELINE_Y,
        deskY: contentOffset + WORKSPACE_DESK_BASELINE_Y,
        floorY: floorBottom + floorHeight / 2,
        floorHeight,
        targetBandY,
        targetBandHeight,
    };
}

/** 开始页在安全区内分配标题、电梯和主按钮，长屏增加电梯门与墙面高度。 */
export function calculateStartPageLayout(viewport: FixedWidthViewport): StartPageLayout {
    const elevatorBottom = viewport.safeBottom + 180;
    const desiredElevatorTop = viewport.safeTop - 250;
    const elevatorHeight = Math.min(1200, Math.max(760, desiredElevatorTop - elevatorBottom));
    const elevatorY = elevatorBottom + elevatorHeight / 2;
    const elevatorTop = elevatorY + elevatorHeight / 2;
    return {
        titleY: viewport.safeTop - 82,
        subtitleY: viewport.safeTop - 154,
        elevatorY,
        elevatorHeight,
        elevatorTop,
        elevatorBottom,
        ledY: elevatorTop + 44,
        alertY: elevatorTop - 56,
        startButtonY: viewport.safeBottom + 86,
        bossY: viewport.safeBottom + 238,
    };
}

function createViewport(
    designWidth: number,
    coveredHeight: number,
    visibleHeight: number,
    baseSafeHeight: number,
    safeArea: SafeAreaRectData | undefined,
): FixedWidthViewport {
    const viewportPadding = Math.max(0, coveredHeight - visibleHeight) / 2;
    let bottomSafeInset = viewportPadding;
    let topSafeInset = viewportPadding;

    if (
        safeArea !== undefined
        && Number.isFinite(safeArea.y)
        && Number.isFinite(safeArea.height)
        && safeArea.height > 0
    ) {
        const safeBottom = clamp(safeArea.y, 0, visibleHeight);
        const safeTop = clamp(safeArea.y + safeArea.height, safeBottom, visibleHeight);
        bottomSafeInset += safeBottom;
        topSafeInset += visibleHeight - safeTop;
    }

    const safeTop = coveredHeight / 2 - topSafeInset;
    const safeBottom = -coveredHeight / 2 + bottomSafeInset;
    return {
        width: designWidth,
        height: coveredHeight,
        extraVerticalSpace: Math.max(0, coveredHeight - baseSafeHeight),
        topSafeInset,
        bottomSafeInset,
        safeTop,
        safeBottom,
        safeHeight: Math.max(0, safeTop - safeBottom),
    };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}
