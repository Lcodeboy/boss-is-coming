import {
    _decorator,
    BlockInputEvents,
    Color,
    Component,
    Label,
    Node,
    Tween,
    tween,
    UIOpacity,
    sys,
    view,
} from 'cc';
import { AudioFeedback } from '../core/AudioFeedback';
import { BossApproachSnapshot } from '../core/BossApproachModel';
import { GameState } from '../core/GameStateMachine';
import { LevelSessionSnapshot, LevelSessionUpdate } from '../core/LevelSession';
import { ProgressData } from '../core/ProgressService';
import {
    calculateFixedWidthViewport,
    calculatePortraitGameLayout,
    calculateWorkspaceLayout,
    DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS,
    FixedWidthViewport,
    WORKSPACE_BASE_CONTENT_HEIGHT,
    WORKSPACE_DESK_BASELINE_Y,
    WORKSPACE_DESK_HEIGHT,
    WORKSPACE_TITLE_BASELINE_Y,
    WORKSPACE_TITLE_HEIGHT,
} from '../core/ViewportLayout';
import { LevelConfig } from '../data/LevelTypes';
import { DropZone } from '../game/DropZone';
import { WorkItem } from '../game/WorkItem';
import { ActionButton } from './ActionButton';
import { BossApproachView } from './BossApproachView';
import { InspectionFinished, InspectionStep, InspectionView } from './InspectionView';
import { LevelSelectView } from './LevelSelectView';
import { ResultActions, ResultPresentation, ResultView } from './ResultView';
import { TaskPanelView } from './TaskPanelView';
import { TutorialView } from './TutorialView';
import { createLabel, createRoundedPanel, createUiNode, DESIGN_HEIGHT, DESIGN_WIDTH, Palette } from './UIFactory';

const { ccclass } = _decorator;

export interface GameViewActions extends ResultActions {
    readonly onStartChallenge: () => void;
    readonly onReturnHome: () => void;
    readonly onSelectLevel: (levelId: string) => void;
    readonly onBeginLevel: () => void;
    readonly onTutorialAcknowledged: () => void;
    readonly onItemAction: (itemId: string) => void;
    readonly onAbortLevel: () => void;
    readonly canInteract: () => boolean;
}

@ccclass('GameView')
export class GameView extends Component {
    private _gameRoot: Node | null = null;
    private _gameLayer: Node | null = null;
    private _startOverlay: Node | null = null;
    private _introOverlay: Node | null = null;
    private _toastNode: Node | null = null;
    private _toastLabel: Label | null = null;
    private _toastOpacity: UIOpacity | null = null;
    private _bossView: BossApproachView | null = null;
    private _taskView: TaskPanelView | null = null;
    private _levelSelectView: LevelSelectView | null = null;
    private _tutorialView: TutorialView | null = null;
    private _inspectionView: InspectionView | null = null;
    private _resultView: ResultView | null = null;
    private readonly _workItems = new Map<string, WorkItem>();
    private readonly _dropZones = new Map<string, DropZone>();
    private _viewport: FixedWidthViewport = calculateFixedWidthViewport(
        DESIGN_WIDTH,
        DESIGN_HEIGHT,
        DESIGN_WIDTH,
        DESIGN_HEIGHT,
    );
    private _actions: GameViewActions | null = null;
    private _audio: AudioFeedback | null = null;

    public initialize(
        levels: readonly LevelConfig[],
        progress: ProgressData,
        actions: GameViewActions,
        audio: AudioFeedback,
    ): void {
        if (this._gameRoot !== null) {
            return;
        }
        const frameSize = view.getFrameSize();
        const safeArea = sys.getSafeAreaRect(false);
        this._viewport = calculateFixedWidthViewport(
            frameSize.width,
            frameSize.height,
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            { y: safeArea.y, height: safeArea.height },
        );
        this._actions = actions;
        this._audio = audio;
        this.buildBackground();
        this.buildStartOverlay();
        this.buildLevelSelect(levels);
        this.buildPersistentOverlays();
        this.buildToast();
        this.showStartPage();
        this._levelSelectView?.show(progress.highestUnlockedLevel);
        this._levelSelectView?.hide();
    }

    public onStateChanged(state: GameState): void {
        if (state === GameState.PREPARED) {
            this._bossView?.showPrepared();
            this.showToast('准备完毕！老板正在快速完成最后路程', true, 1.1);
        }
    }

    public showStartPage(): void {
        this.cancelTransientViews();
        this.setLevelActive(false);
        if (this._startOverlay !== null) {
            this._startOverlay.active = true;
        }
        this._levelSelectView?.hide();
    }

    public showLevelSelect(highestUnlockedLevel: number): void {
        this.cancelTransientViews();
        this.setLevelActive(false);
        if (this._startOverlay !== null) {
            this._startOverlay.active = false;
        }
        this._levelSelectView?.show(highestUnlockedLevel);
    }

    public configureLevel(level: LevelConfig, snapshot: LevelSessionSnapshot): void {
        this.cancelTransientViews();
        this.teardownLevel();
        this.buildGameLayer(level, snapshot);
        this.buildIntroOverlay(level, snapshot.activeTaskIds);
        this._levelSelectView?.hide();
        if (this._startOverlay !== null) {
            this._startOverlay.active = false;
        }
        this.showLevelIntro();
    }

    public showLevelIntro(): void {
        this.setLevelActive(false);
        if (this._introOverlay !== null) {
            this._introOverlay.active = true;
        }
    }

    public showTutorial(messages: readonly string[]): void {
        if (this._introOverlay !== null) {
            this._introOverlay.active = false;
        }
        this.bringToFront(this._tutorialView?.node ?? null);
        this._tutorialView?.show(messages);
    }

    public beginPlaying(): void {
        this._tutorialView?.hide();
        this._resultView?.hide();
        this._inspectionView?.cancel();
        if (this._introOverlay !== null) {
            this._introOverlay.active = false;
        }
        this.setLevelActive(true);
    }

    public updateApproach(snapshot: BossApproachSnapshot, remainingSeconds: number): void {
        this._bossView?.render(snapshot, remainingSeconds);
    }

    public applySessionUpdate(update: LevelSessionUpdate): void {
        for (const taskId of update.activatedTaskIds) {
            this._taskView?.activateTask(taskId);
        }
        for (const itemId of update.activatedItemIds) {
            this._workItems.get(itemId)?.setAvailable(true);
        }
        for (const taskId of update.completedTaskIds) {
            this._taskView?.setCompleted(taskId);
        }
        for (const progress of update.zoneProgress) {
            this._dropZones.get(progress.zoneId)?.setProgress(progress.completed, progress.total);
        }
        for (const event of update.triggeredEvents) {
            this.showToast(event.notification, false, 1.7);
        }
    }

    public playInspection(steps: readonly InspectionStep[], onFinished: InspectionFinished): void {
        this.hideToast();
        for (const item of this._workItems.values()) {
            item.stopInteraction();
        }
        this.bringToFront(this._inspectionView?.node ?? null);
        this._inspectionView?.play(steps, onFinished);
    }

    public showResult(result: ResultPresentation): void {
        this.bringToFront(this._resultView?.node ?? null);
        this._resultView?.show(result);
    }

    public cancelGameplay(): void {
        this.cancelTransientViews();
        this.setLevelActive(false);
        if (this._introOverlay !== null) {
            this._introOverlay.active = false;
        }
    }

    public showToast(message: string, success: boolean, visibleSeconds = 0.85): void {
        if (this._toastNode === null || this._toastLabel === null || this._toastOpacity === null) {
            return;
        }
        this.stopToastTween();
        this._toastLabel.string = message;
        this._toastLabel.color = success ? Palette.success : Palette.warning;
        this._toastOpacity.opacity = 255;
        this._toastNode.active = true;
        this.bringToFront(this._toastNode);
        tween(this._toastOpacity)
            .delay(visibleSeconds)
            .to(0.25, { opacity: 0 })
            .call(() => {
                if (this._toastNode !== null) {
                    this._toastNode.active = false;
                }
            })
            .start();
    }

    private buildBackground(): void {
        const gameLayout = calculatePortraitGameLayout(this._viewport, DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS);
        this._gameRoot = createUiNode(this.node, 'GameRoot', this._viewport.width, this._viewport.height);
        createRoundedPanel(this._gameRoot, 'Background', this._viewport.width, this._viewport.height, Palette.background, 0);
        const accentHeight = Math.max(180, this._viewport.topSafeInset + 190);
        const topAccent = createRoundedPanel(
            this._gameRoot,
            'TopAccent',
            this._viewport.width,
            accentHeight,
            Palette.blueGrayDark,
            0,
        );
        topAccent.setPosition(0, this._viewport.height / 2 - accentHeight / 2);
        const brand = createLabel(
            this._gameRoot,
            'Brand',
            '老板上来了',
            320,
            DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS.headerHeight,
            {
                fontSize: 32,
                color: Palette.white,
                bold: true,
                wrap: false,
            },
        );
        brand.node.setPosition(-175, gameLayout.headerY);
        const floorLine = createRoundedPanel(
            this._gameRoot,
            'FloorLine',
            this._viewport.width,
            8,
            new Color(202, 199, 187, 255),
            0,
        );
        floorLine.setPosition(0, this._viewport.safeBottom + 76);
    }

    private buildStartOverlay(): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        this._startOverlay = this.createBlockingOverlay('StartOverlay', Palette.background);
        const cardHeight = Math.max(760, Math.min(1400, this._viewport.safeHeight - 96));
        const card = createRoundedPanel(this._startOverlay, 'StartCard', 650, cardHeight, Palette.panel, 34, Palette.paleBlue, 4);
        card.setPosition(0, (this._viewport.safeTop + this._viewport.safeBottom) / 2);
        const badge = createRoundedPanel(card, 'Badge', 210, 58, Palette.warningPale, 20);
        badge.setPosition(0, cardHeight * 0.32);
        createLabel(badge, 'BadgeText', '五关办公室挑战', 190, 45, {
            fontSize: 20,
            color: Palette.warning,
            bold: true,
            wrap: false,
        });
        const title = createLabel(card, 'Title', '老板上来了', 560, 110, {
            fontSize: 60,
            color: Palette.ink,
            bold: true,
        });
        title.node.setPosition(0, cardHeight * 0.20);
        const subtitle = createLabel(card, 'Subtitle', '在老板进门前整理好工位', 540, 80, {
            fontSize: 31,
            color: Palette.muted,
            wrap: false,
        });
        subtitle.node.setPosition(0, cardHeight * 0.10);
        const elevator = createRoundedPanel(card, 'ElevatorIcon', 230, 150, Palette.paleBlue, 18, Palette.blueGray, 4);
        elevator.setPosition(0, -cardHeight * 0.08);
        createLabel(elevator, 'ElevatorText', 'B2  ↑  18F\n老板正在接近', 200, 120, {
            fontSize: 27,
            color: Palette.blueGrayDark,
            bold: true,
        });
        const startButton = this.createButton(card, 'StartButton', '开始挑战', this._actions.onStartChallenge, 360, 104);
        startButton.setPosition(0, -cardHeight * 0.34);
    }

    private buildLevelSelect(levels: readonly LevelConfig[]): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        const node = this.createBlockingOverlay('LevelSelectOverlay', Palette.background);
        this._levelSelectView = node.addComponent(LevelSelectView);
        this._levelSelectView.initialize(levels, this._viewport, this._actions.onSelectLevel, this._actions.onReturnHome);
    }

    private buildPersistentOverlays(): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        const tutorialNode = this.createBlockingOverlay('TutorialOverlay', Palette.overlay);
        this._tutorialView = tutorialNode.addComponent(TutorialView);
        this._tutorialView.initialize(this._actions.onTutorialAcknowledged);

        const inspectionNode = this.createBlockingOverlay('InspectionOverlay', Palette.overlay);
        this._inspectionView = inspectionNode.addComponent(InspectionView);
        this._inspectionView.initialize();

        const resultNode = this.createBlockingOverlay('ResultOverlay', Palette.overlay);
        this._resultView = resultNode.addComponent(ResultView);
        this._resultView.initialize(this._actions);
    }

    private buildToast(): void {
        if (this._gameRoot === null) {
            return;
        }
        this._toastNode = createRoundedPanel(this._gameRoot, 'Toast', 620, 82, Palette.panel, 24, Palette.paleBlue, 3);
        this._toastNode.setPosition(0, this._viewport.safeBottom + 124);
        this._toastLabel = createLabel(this._toastNode, 'ToastText', '', 570, 62, {
            fontSize: 23,
            color: Palette.success,
            bold: true,
            wrap: false,
        });
        this._toastOpacity = this._toastNode.addComponent(UIOpacity);
        this._toastNode.active = false;
    }

    private buildGameLayer(level: LevelConfig, snapshot: LevelSessionSnapshot): void {
        if (this._gameRoot === null || this._actions === null || this._audio === null) {
            return;
        }
        const layout = calculatePortraitGameLayout(this._viewport, DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS);
        this._gameLayer = createUiNode(this._gameRoot, 'GameLayer', DESIGN_WIDTH, this._viewport.height);
        const bossNode = createRoundedPanel(this._gameLayer, 'BossApproach', 680, 190, Palette.panel, 22);
        bossNode.setPosition(0, layout.bossY);
        this._bossView = bossNode.addComponent(BossApproachView);
        this._bossView.initialize();

        const taskNode = createRoundedPanel(this._gameLayer, 'TaskPanel', 680, 164, Palette.panel, 20);
        taskNode.setPosition(0, layout.taskY);
        this._taskView = taskNode.addComponent(TaskPanelView);
        this._taskView.initialize(level.tasks, snapshot.activeTaskIds);
        const abortButton = this.createButton(
            this._gameLayer,
            'AbortButton',
            '退出',
            this._actions.onAbortLevel,
            112,
            80,
            new Color(104, 113, 120, 255),
        );
        abortButton.setPosition(284, layout.headerY);

        const workspace = createRoundedPanel(
            this._gameLayer,
            'Workspace',
            700,
            layout.workspaceHeight,
            new Color(230, 231, 226, 255),
            24,
            Palette.paleBlue,
        );
        workspace.setPosition(0, layout.workspaceY);
        const workspaceLayout = calculateWorkspaceLayout(layout.workspaceHeight);
        const floor = createRoundedPanel(
            workspace,
            'OfficeFloor',
            660,
            workspaceLayout.floorHeight,
            new Color(215, 220, 218, 255),
            22,
            new Color(194, 205, 207, 255),
            3,
        );
        floor.setPosition(0, workspaceLayout.floorY);
        const targetBand = createRoundedPanel(
            workspace,
            'TargetBand',
            650,
            workspaceLayout.targetBandHeight,
            new Color(205, 215, 218, 255),
            20,
            Palette.blueGray,
            2,
        );
        targetBand.setPosition(0, workspaceLayout.targetBandY);
        const targetBandTitle = createLabel(targetBand, 'TargetBandTitle', '收纳处理区', 190, 34, {
            fontSize: 19,
            color: Palette.blueGrayDark,
            bold: true,
            wrap: false,
        });
        targetBandTitle.node.setPosition(-210, workspaceLayout.targetBandHeight / 2 - 25);

        const workspaceContent = createUiNode(
            workspace,
            'WorkspaceContent',
            700,
            WORKSPACE_BASE_CONTENT_HEIGHT,
        );
        workspaceContent.setPosition(0, workspaceLayout.topContentY);
        const bottomContent = createUiNode(
            workspace,
            'WorkspaceBottomContent',
            700,
            WORKSPACE_BASE_CONTENT_HEIGHT,
        );
        bottomContent.setPosition(0, workspaceLayout.bottomContentY);
        const desk = createRoundedPanel(
            workspaceContent,
            'Desk',
            660,
            WORKSPACE_DESK_HEIGHT,
            new Color(178, 193, 201, 255),
            24,
            Palette.blueGray,
        );
        desk.setPosition(0, WORKSPACE_DESK_BASELINE_Y);
        const deskTitle = createLabel(
            workspaceContent,
            'DeskTitle',
            '我的工位',
            180,
            WORKSPACE_TITLE_HEIGHT,
            {
                fontSize: 24,
                color: Palette.blueGrayDark,
                bold: true,
                wrap: false,
            },
        );
        deskTitle.node.setPosition(-238, WORKSPACE_TITLE_BASELINE_Y);

        for (const zoneConfig of level.zones) {
            const zoneParent = zoneConfig.position.y >= 0 ? workspaceContent : bottomContent;
            const zoneNode = createRoundedPanel(
                zoneParent,
                `Zone-${zoneConfig.id}`,
                zoneConfig.size.width,
                zoneConfig.size.height,
                Palette.paleBlue,
                16,
            );
            const zone = zoneNode.addComponent(DropZone);
            zone.configure(zoneConfig);
            this._dropZones.set(zoneConfig.id, zone);
        }

        const zones = [...this._dropZones.values()];
        for (const itemConfig of level.items) {
            const itemNode = createUiNode(
                workspaceContent,
                `Item-${itemConfig.id}`,
                itemConfig.size.width,
                itemConfig.size.height,
            );
            const item = itemNode.addComponent(WorkItem);
            item.configure(
                itemConfig,
                zones,
                this._actions.canInteract,
                this._actions.onItemAction,
                (message, success) => this.showToast(message, success),
                this._audio,
            );
            this._workItems.set(itemConfig.id, item);
            item.setAvailable(snapshot.activeItemIds.indexOf(itemConfig.id) >= 0);
        }

        for (const progress of snapshot.zoneProgress) {
            this._dropZones.get(progress.zoneId)?.setProgress(progress.completed, progress.total);
        }
        const helper = createLabel(this._gameLayer, 'DragHelper', '轻触电脑 · 长按拖动物品', 500, 38, {
            fontSize: 20,
            color: Palette.muted,
            wrap: false,
        });
        helper.node.setPosition(0, layout.helperY);
        this._gameLayer.active = false;
    }

    private buildIntroOverlay(level: LevelConfig, activeTaskIds: readonly string[]): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        this._introOverlay = this.createBlockingOverlay('IntroOverlay', Palette.overlay);
        const card = createRoundedPanel(this._introOverlay, 'IntroCard', 650, 850, Palette.panel, 30, Palette.warning, 4);
        const title = createLabel(card, 'LevelName', `第${level.order}关 · ${level.name}`, 570, 72, {
            fontSize: 40,
            color: Palette.warning,
            bold: true,
            wrap: false,
        });
        title.node.setPosition(0, 320);
        const intro = createLabel(card, 'IntroText', level.intro, 550, 145, {
            fontSize: 27,
            color: Palette.ink,
        });
        intro.node.setPosition(0, 215);
        const listPanel = createRoundedPanel(card, 'IntroTasks', 550, 330, Palette.paleBlue, 20);
        listPanel.setPosition(0, -18);
        const listTitle = createLabel(listPanel, 'ListTitle', `${level.durationSeconds} 秒整理目标`, 470, 48, {
            fontSize: 27,
            color: Palette.blueGrayDark,
            bold: true,
            wrap: false,
        });
        listTitle.node.setPosition(0, 126);
        const visibleTasks = level.tasks.filter((task) => activeTaskIds.indexOf(task.id) >= 0);
        for (let index = 0; index < visibleTasks.length; index += 1) {
            const task = visibleTasks[index];
            const label = createLabel(listPanel, `IntroTask-${task.id}`, `${index + 1}. ${task.prompt}`, 480, 54, {
                fontSize: 22,
                color: Palette.ink,
                wrap: false,
            });
            label.node.setPosition(0, 68 - index * 58);
        }
        const beginButton = this.createButton(card, 'BeginButton', '马上整理', this._actions.onBeginLevel, 300, 94);
        beginButton.setPosition(155, -337);
        const backButton = this.createButton(card, 'BackButton', '返回关卡', this._actions.onAbortLevel, 220, 94, Palette.blueGray);
        backButton.setPosition(-165, -337);
    }

    private createBlockingOverlay(name: string, color: Color): Node {
        if (this._gameRoot === null) {
            throw new Error('GameRoot 尚未初始化');
        }
        const overlay = createRoundedPanel(this._gameRoot, name, this._viewport.width, this._viewport.height, color, 0);
        overlay.addComponent(BlockInputEvents);
        return overlay;
    }

    private createButton(
        parent: Node,
        name: string,
        text: string,
        action: () => void,
        width: number,
        height: number,
        color: Color = Palette.blue,
    ): Node {
        const button = createRoundedPanel(parent, name, width, height, color, 24);
        createLabel(button, 'ButtonText', text, width - 24, height - 16, {
            fontSize: Math.min(32, height * 0.34),
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        button.addComponent(ActionButton).configure(action);
        return button;
    }

    private setLevelActive(active: boolean): void {
        if (this._gameLayer !== null) {
            this._gameLayer.active = active;
        }
    }

    private bringToFront(node: Node | null): void {
        if (node?.parent !== null && node?.parent !== undefined) {
            node.setSiblingIndex(node.parent.children.length - 1);
        }
    }

    private cancelTransientViews(): void {
        this._tutorialView?.hide();
        this._inspectionView?.cancel();
        this._resultView?.hide();
        this.hideToast();
    }

    private teardownLevel(): void {
        this._introOverlay?.destroy();
        this._introOverlay = null;
        if (this._gameLayer !== null) {
            this._gameLayer.active = false;
            this._gameLayer.destroy();
        }
        this._gameLayer = null;
        this._bossView = null;
        this._taskView = null;
        this._workItems.clear();
        this._dropZones.clear();
    }

    private hideToast(): void {
        this.stopToastTween();
        if (this._toastOpacity !== null) {
            this._toastOpacity.opacity = 0;
        }
        if (this._toastNode !== null) {
            this._toastNode.active = false;
        }
    }

    private stopToastTween(): void {
        if (this._toastOpacity !== null) {
            Tween.stopAllByTarget(this._toastOpacity);
        }
    }

    protected override onDestroy(): void {
        this.stopToastTween();
        this.teardownLevel();
        this._actions = null;
        this._audio = null;
    }
}
