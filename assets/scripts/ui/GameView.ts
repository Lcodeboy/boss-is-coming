import {
    _decorator,
    BlockInputEvents,
    Color,
    Component,
    HorizontalTextAlignment,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
    Tween,
    tween,
    UIOpacity,
    isValid,
    sys,
    view,
} from 'cc';
import { AudioFeedback } from '../core/AudioFeedback';
import { BossApproachSnapshot } from '../core/BossApproachModel';
import {
    convertScreenRectToViewport,
    readDouyinMenuButtonRect,
    reserveDouyinMenuButtonSafeArea,
    ViewportRectData,
} from '../core/DouyinSafeArea';
import { GameState } from '../core/GameStateMachine';
import { LevelSessionSnapshot, LevelSessionUpdate } from '../core/LevelSession';
import { ProgressData } from '../core/ProgressService';
import {
    calculateFixedWidthViewport,
    calculateFullscreenOverlayLayout,
    calculateGameTopNavigationLayout,
    calculatePortraitGameLayout,
    calculateSafeModalLayout,
    calculateStartPageLayout,
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
import { BossApproachView } from './BossApproachView';
import { EventMessageView } from './EventMessageView';
import { FullBleedBackground, FullBleedBackgroundKind } from './FullBleedBackground';
import { InspectionFinished, InspectionStep, InspectionView } from './InspectionView';
import { LevelSelectView } from './LevelSelectView';
import { ResultActions, ResultPresentation, ResultView } from './ResultView';
import { TaskPanelView } from './TaskPanelView';
import { TutorialView } from './TutorialView';
import { createLabel, createRoundedPanel, createUiNode, DESIGN_HEIGHT, DESIGN_WIDTH, Palette } from './UIFactory';
import {
    createBackArrowButton,
    createElevatorHall,
    createModalCard,
    createThemedButton,
    paintBossSilhouette,
    paintFormalDesk,
    paintFormalOfficeFloor,
    paintStorageArea,
    paintWorkspaceDepth,
} from './VisualFactory';
import { ThemeButtonVariant } from './VisualTheme';
import { ActionButton } from './ActionButton';
import { SettingsView } from './SettingsView';
import {
    DEFAULT_OFFICE_THEME_ID,
    OfficeThemeId,
    OfficeBounds,
    OfficeDeskGeometry,
    OfficeDeskLayout,
    OfficeThemeAssetKey,
    solveOfficeDeskLayout,
    unionOfficeBounds,
} from './OfficeTheme';
import { LoadedOfficeThemeAssets, requestOfficeThemeAssets } from './OfficeThemeAssets';
import { ITEM_VISUAL_TOP_OVERFLOW } from './VisualMetrics';
import { reserveOfficeSlots, validateOfficeLevelLayout } from './OfficeLayoutCatalog';
import { OFFICE_LABEL_BACKDROP_PREFIX } from './OfficeLabelBackdrops';

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
    readonly onContinue: () => void;
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
    private _eventMessageView: EventMessageView | null = null;
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
    private _formalLevel = false;
    private _resumeOverlay: Node | null = null;
    private _settingsView: SettingsView | null = null;
    private _edgePulse: UIOpacity | null = null;
    private _menuButtonRect: ViewportRectData | null = null;
    private _gameBackground: FullBleedBackground | null = null;
    private _homeBackground: FullBleedBackground | null = null;
    private _levelSelectBackground: FullBleedBackground | null = null;
    private readonly _officeThemeId: OfficeThemeId = DEFAULT_OFFICE_THEME_ID;
    private _officeThemeAssets: LoadedOfficeThemeAssets | null = null;
    private _cancelOfficeThemeLoad: (() => void) | null = null;
    private _officeThemeLoadGeneration = 0;
    private _officeThemeLoadSettled = false;
    private readonly _gameBackgroundAccentNodes: Node[] = [];
    private readonly _vectorOfficeNodes: Node[] = [];
    private _officeDeskContext: { level: LevelConfig; content: Node } | null = null;
    private _officeDeskLayout: OfficeDeskLayout | null = null;
    private _officeDeskGeometry: OfficeDeskGeometry | null = null;

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
        const baseViewport = calculateFixedWidthViewport(
            frameSize.width,
            frameSize.height,
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            { y: safeArea.y, height: safeArea.height },
        );
        const menuButtonRect = readDouyinMenuButtonRect();
        this._menuButtonRect = menuButtonRect === null
            ? null
            : convertScreenRectToViewport(
                menuButtonRect,
                frameSize.width,
                frameSize.height,
                DESIGN_WIDTH,
            );
        this._viewport = reserveDouyinMenuButtonSafeArea(
            baseViewport,
            frameSize.width,
            frameSize.height,
            DESIGN_WIDTH,
            menuButtonRect,
        );
        this._actions = actions;
        this._audio = audio;
        this.buildBackground();
        this.requestDefaultOfficeTheme();
        this.buildStartOverlay();
        this.buildLevelSelect(levels);
        this.buildPersistentOverlays();
        this.buildToast();
        audio.onBeat = (seconds) => this.showEdgePulse(seconds);
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
        this._formalLevel = level.order === 1;
        this._inspectionView?.setFormalTheme(this._formalLevel);
        this._resultView?.setFormalTheme(this._formalLevel);
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
            const levelId = this._officeDeskContext?.level.id;
            const previous = levelId === undefined ? undefined : this._officeThemeAssets?.theme.levelLayouts[levelId]?.replaces[itemId];
            if (previous !== undefined) { this._workItems.get(previous)?.finishCollectedLayoutTransition(); }
            this._workItems.get(itemId)?.setAvailable(true);
        }
        for (const taskId of update.completedTaskIds) {
            this._taskView?.setCompleted(taskId);
        }
        for (const progress of update.zoneProgress) {
            this._dropZones.get(progress.zoneId)?.setProgress(progress.completed, progress.total);
        }
        for (const event of update.triggeredEvents) {
            this._audio?.message(event.id);
            this._eventMessageView?.show(event.notification, event.messageStyle);
        }
    }

    public playInspection(steps: readonly InspectionStep[], onFinished: InspectionFinished): void {
        this.hideToast();
        this._eventMessageView?.cancel();
        for (const item of this._workItems.values()) {
            item.stopInteraction();
        }
        this.bringToFront(this._inspectionView?.node ?? null);
        this._inspectionView?.play(steps, onFinished);
        this._audio?.inspection();
        this.stopEdgePulse();
    }

    public showResult(result: ResultPresentation): void {
        this.bringToFront(this._resultView?.node ?? null);
        this._resultView?.show(result);
    }

    public setHomeBackgroundSpriteFrame(spriteFrame: SpriteFrame | null): void {
        this._homeBackground?.setSpriteFrame(spriteFrame);
    }

    public setGameBackgroundSpriteFrame(spriteFrame: SpriteFrame | null): void {
        this._gameBackground?.setSpriteFrame(spriteFrame);
    }

    public setLevelSelectBackgroundSpriteFrame(spriteFrame: SpriteFrame | null): void {
        this._levelSelectBackground?.setSpriteFrame(spriteFrame);
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
        this._gameRoot = createUiNode(this.node, 'GameRoot', this._viewport.width, this._viewport.height);
        this._gameBackground = this.createFullBleedBackground(this._gameRoot, 'FullBleedBackground', 'game');
        const accentHeight = Math.max(180, this._viewport.topSafeInset + 190);
        const topAccent = createRoundedPanel(
            this._gameRoot,
            'TopAccent',
            this._viewport.width,
            accentHeight,
            Palette.backgroundDeep,
            0,
        );
        this._gameBackgroundAccentNodes.push(topAccent);
        topAccent.setPosition(0, this._viewport.height / 2 - accentHeight / 2);
        const floorLine = createRoundedPanel(
            this._gameRoot,
            'FloorLine',
            this._viewport.width,
            6,
            new Color(112, 135, 143, 120),
            0,
        );
        this._gameBackgroundAccentNodes.push(floorLine);
        floorLine.setPosition(0, this._viewport.safeBottom + 76);
    }

    private buildStartOverlay(): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        this._startOverlay = this.createBlockingOverlay('StartOverlay', new Color(0, 0, 0, 0));
        this._homeBackground = this.createFullBleedBackground(
            this._startOverlay,
            'HomeFullBleedBackground',
            'home',
        );
        const hall = createElevatorHall(this._startOverlay, this._viewport);
        const startLayout = calculateStartPageLayout(this._viewport);
        const title = createLabel(hall, 'Title', '老板要来了', 610, 96, {
            fontSize: 62,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        title.node.setPosition(0, startLayout.titleY);
        const subtitle = createLabel(hall, 'Subtitle', '在老板进门前整理好工位', 560, 54, {
            fontSize: 27,
            color: Palette.mutedLight,
            wrap: false,
        });
        subtitle.node.setPosition(0, startLayout.subtitleY);

        const led = createRoundedPanel(hall, 'FloorLed', 260, 66, Palette.backgroundDeep, 12, Palette.elevatorMetal, 3);
        led.setPosition(0, startLayout.ledY);
        createLabel(led, 'FloorLedText', 'B2  ↑  18F', 230, 52, {
            fontSize: 29,
            color: Palette.led,
            bold: true,
            wrap: false,
        });
        const alert = createRoundedPanel(hall, 'AlertBadge', 190, 44, Palette.warningPale, 22);
        alert.setPosition(-142, startLayout.alertY);
        createLabel(alert, 'AlertText', '突击检查预警', 190, 38, {
            fontSize: 19,
            color: Palette.warning,
            bold: true,
            wrap: false,
        });
        const boss = createUiNode(hall, 'BossSilhouette', 150, 190);
        boss.setPosition(260, startLayout.bossY);
        paintBossSilhouette(boss);
        const startButton = this.createButton(
            hall,
            'StartButton',
            '开始挑战',
            this._actions.onStartChallenge,
            360,
            104,
            'primary',
        );
        startButton.setPosition(0, startLayout.startButtonY);
        this.createButton(hall, 'SettingsButton', '设置', () => {
            this.bringToFront(this._settingsView?.node ?? null);
            this._settingsView?.show();
        }, 112, 80, 'quiet').setPosition(284, this._viewport.safeTop - 50);
    }

    private buildLevelSelect(levels: readonly LevelConfig[]): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        const node = this.createBlockingOverlay('LevelSelectOverlay', new Color(0, 0, 0, 0));
        this._levelSelectBackground = this.createFullBleedBackground(
            node,
            'LevelSelectFullBleedBackground',
            'level-select',
        );
        this._levelSelectView = node.addComponent(LevelSelectView);
        this._levelSelectView.initialize(levels, this._viewport, this._actions.onSelectLevel, this._actions.onReturnHome);
    }

    private buildPersistentOverlays(): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        const tutorialNode = this.createBlockingOverlay('TutorialOverlay', Palette.overlay);
        this._tutorialView = tutorialNode.addComponent(TutorialView);
        this._tutorialView.initialize(this._viewport, this._actions.onTutorialAcknowledged);

        const inspectionNode = this.createBlockingOverlay('InspectionOverlay', Palette.overlay);
        this._inspectionView = inspectionNode.addComponent(InspectionView);
        this._inspectionView.initialize(this._viewport);

        const resultNode = this.createBlockingOverlay('ResultOverlay', Palette.overlay);
        this._resultView = resultNode.addComponent(ResultView);
        this._resultView.initialize(this._viewport, this._actions);

        const settingsNode = this.createBlockingOverlay('SettingsOverlay', Palette.overlay);
        this._settingsView = settingsNode.addComponent(SettingsView);
        if (this._audio !== null) { this._settingsView.initialize(this._viewport, this._audio.settings); }

        this._resumeOverlay = this.createBlockingOverlay('ResumeOverlay', Palette.overlay);
        const resumeCardHeight = 310;
        const card = createModalCard(this._resumeOverlay, 'ResumeCard', 600, resumeCardHeight, Palette.blue);
        card.setPosition(0, calculateSafeModalLayout(this._viewport, resumeCardHeight).centerY);
        createLabel(card, 'PauseTitle', '整理已暂停', 510, 64, { fontSize: 38, color: Palette.ink, bold: true }).node.setPosition(0, 74);
        const continueButton = this.createButton(card, 'ContinueButton', '继续整理', this._actions.onContinue, 330, 94);
        continueButton.setPosition(0, -58);
        continueButton.getComponent(ActionButton)?.setAllowedWhilePaused(true);
        this._resumeOverlay.active = false;
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
        const navigation = calculateGameTopNavigationLayout(this._viewport, this._menuButtonRect);
        const layout = calculatePortraitGameLayout(
            this._viewport,
            DEFAULT_PORTRAIT_GAME_LAYOUT_OPTIONS,
            navigation.y,
        );
        this._gameLayer = createUiNode(this._gameRoot, 'GameLayer', DESIGN_WIDTH, this._viewport.height);
        const formal = true;
        const backButton = createBackArrowButton(
            this._gameLayer,
            'GameBackButton',
            this._actions.onAbortLevel,
            navigation.backButtonSize,
        );
        backButton.setPosition(navigation.backButtonX, navigation.y);
        const title = createLabel(
            this._gameLayer,
            'GameTitle',
            '老板要来了',
            navigation.titleWidth,
            navigation.titleHeight,
            {
                fontSize: 32,
                color: Palette.white,
                horizontalAlign: HorizontalTextAlignment.LEFT,
                bold: true,
                wrap: false,
            },
        );
        title.node.setPosition(navigation.titleX, navigation.y);
        const bossNode = createUiNode(this._gameLayer, 'BossApproach', 680, 190);
        bossNode.setPosition(0, layout.bossY);
        this._bossView = bossNode.addComponent(BossApproachView);
        this._bossView.initialize(formal);

        const taskNode = createUiNode(this._gameLayer, 'TaskPanel', 680, 164);
        taskNode.setPosition(0, layout.taskY);
        this._taskView = taskNode.addComponent(TaskPanelView);
        this._taskView.initialize(level.tasks, snapshot.activeTaskIds, formal);
        // Workspace 只保留原尺寸和定位坐标，不再绘制包围整个工位的浅色圆角卡片。
        const workspace = createUiNode(
            this._gameLayer,
            'Workspace',
            700,
            layout.workspaceHeight,
        );
        workspace.setPosition(0, layout.workspaceY);
        const workspaceLayout = calculateWorkspaceLayout(layout.workspaceHeight);
        const floor = createUiNode(
            workspace,
            'OfficeFloor',
            DESIGN_WIDTH,
            workspaceLayout.floorHeight,
        );
        this._vectorOfficeNodes.push(floor);
        floor.setPosition(0, workspaceLayout.floorY);
        if (formal) {
            if (this._officeThemeAssets === null) {
                paintFormalOfficeFloor(floor);
            } else {
                floor.active = false;
            }
            const workspaceDepth = createUiNode(
                workspace,
                'WorkspaceDepth',
                DESIGN_WIDTH,
                layout.workspaceHeight,
            );
            this._vectorOfficeNodes.push(workspaceDepth);
            if (this._officeThemeAssets === null) {
                paintWorkspaceDepth(workspaceDepth, workspaceLayout);
            } else {
                workspaceDepth.active = false;
            }
        }
        const targetBand = createUiNode(
            workspace,
            'TargetBand',
            DESIGN_WIDTH,
            workspaceLayout.targetBandHeight,
        );
        targetBand.setPosition(0, workspaceLayout.targetBandY);
        paintStorageArea(targetBand);
        const targetBandTitle = createLabel(targetBand, 'TargetBandTitle', formal ? '快速收纳区' : '收纳处理区', 190, 34, {
            fontSize: formal ? 21 : 19,
            color: formal ? new Color(226, 235, 238, 255) : Palette.mutedLight,
            bold: true,
            wrap: false,
        });
        targetBandTitle.node.setPosition(0, workspaceLayout.targetBandHeight / 2 - 25);

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
        const desk = createUiNode(
            workspaceContent,
            'Desk',
            660,
            WORKSPACE_DESK_HEIGHT,
        );
        desk.setPosition(0, WORKSPACE_DESK_BASELINE_Y);
        if (formal) {
            this._vectorOfficeNodes.push(desk);
            if (this._officeThemeAssets === null) {
                paintFormalDesk(desk);
            } else {
                desk.active = false;
            }
        }
        const deskTitle = createLabel(
            workspaceContent,
            'DeskTitle',
            '我的工位',
            180,
            WORKSPACE_TITLE_HEIGHT,
            {
                fontSize: 24,
                color: Palette.white,
                bold: true,
                wrap: false,
            },
        );
        deskTitle.node.setPosition(-238, WORKSPACE_TITLE_BASELINE_Y);

        for (const zoneConfig of level.zones) {
            const zoneParent = zoneConfig.position.y >= 0 ? workspaceContent : bottomContent;
            const zoneNode = createUiNode(
                zoneParent,
                `Zone-${zoneConfig.id}`,
                zoneConfig.size.width,
                zoneConfig.size.height,
            );
            const zone = zoneNode.addComponent(DropZone);
            zone.configure(zoneConfig, formal, this._officeThemeAssets);
            this._dropZones.set(zoneConfig.id, zone);
        }

        const zones = Array.from(this._dropZones.values());
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
                () => this._actions?.canInteract() === true && this._officeThemeLoadSettled
                    && (this._officeThemeAssets === null || this._officeDeskLayout?.ok === true),
                this._actions.onItemAction,
                (message, success) => this.showToast(message, success),
                this._audio,
                formal,
                this._officeThemeAssets,
                itemConfig.initialPosition,
                formal,
            );
            if (this._officeThemeAssets !== null) {
                item.setOfficeThemeAssets(this._officeThemeAssets);
            }
            this._workItems.set(itemConfig.id, item);
            item.setAvailable(snapshot.activeItemIds.indexOf(itemConfig.id) >= 0);
        }
        this._officeDeskContext = { level, content: workspaceContent };
        this.applyOfficeDeskLayout();

        for (const progress of snapshot.zoneProgress) {
            this._dropZones.get(progress.zoneId)?.setProgress(progress.completed, progress.total);
        }
        const helper = createLabel(this._gameLayer, 'DragHelper', '轻触电脑 · 长按拖动物品', 500, 38, {
            fontSize: 20,
            color: formal ? Palette.mutedLight : Palette.muted,
            wrap: false,
        });
        helper.node.setPosition(0, layout.helperY);
        const eventMessageNode = createUiNode(this._gameLayer, 'EventMessage', 500, 88);
        eventMessageNode.setPosition(105, layout.workspaceY + layout.workspaceHeight / 2 - 82);
        this._eventMessageView = eventMessageNode.addComponent(EventMessageView);
        this._eventMessageView.initialize();
        const pulseNode = createUiNode(this._gameLayer, 'WarningEdgePulse', this._viewport.width, this._viewport.height);
        this._edgePulse = pulseNode.addComponent(UIOpacity);
        this._edgePulse.opacity = 0;
        for (const side of [-1, 1]) {
            const strip = createRoundedPanel(pulseNode, `WarningEdge${side}`, 8, this._viewport.height, Palette.warning, 0);
            strip.setPosition(side * (this._viewport.width / 2 - 4), 0);
        }
        this._gameLayer.active = false;
    }

    private buildIntroOverlay(level: LevelConfig, activeTaskIds: readonly string[]): void {
        if (this._gameRoot === null || this._actions === null) {
            return;
        }
        this._introOverlay = this.createBlockingOverlay('IntroOverlay', Palette.overlay);
        const formal = level.order === 1;
        const introCardHeight = 760;
        const card = createModalCard(
            this._introOverlay,
            'IntroCard',
            650,
            introCardHeight,
            formal ? Palette.blue : Palette.warning,
        );
        card.setPosition(0, calculateSafeModalLayout(this._viewport, introCardHeight).centerY);
        if (formal) {
            const eyebrow = createRoundedPanel(card, 'UrgentBadge', 170, 46, Palette.warningPale, 23);
            eyebrow.setPosition(0, 342);
            createLabel(eyebrow, 'UrgentText', '办公室警报', 150, 34, {
                fontSize: 18,
                color: Palette.warning,
                bold: true,
                wrap: false,
            });
        }
        const title = createLabel(card, 'LevelName', `第${level.order}关 · ${level.name}`, 570, 72, {
            fontSize: 40,
            color: formal ? Palette.blueGrayDark : Palette.warning,
            bold: true,
            wrap: false,
        });
        title.node.setPosition(0, 286);
        const intro = createLabel(card, 'IntroText', level.intro, 550, 145, {
            fontSize: 27,
            color: Palette.ink,
        });
        intro.node.setPosition(0, 188);
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
        const beginButton = this.createButton(card, 'BeginButton', '马上整理', this._actions.onBeginLevel, 300, 94, 'primary');
        beginButton.setPosition(155, -306);
        const backButton = this.createButton(card, 'BackButton', '返回关卡', this._actions.onAbortLevel, 220, 94, 'secondary');
        backButton.setPosition(-165, -306);
    }

    private createBlockingOverlay(name: string, color: Color): Node {
        if (this._gameRoot === null) {
            throw new Error('GameRoot 尚未初始化');
        }
        const layout = calculateFullscreenOverlayLayout(this._viewport);
        const overlay = createRoundedPanel(this._gameRoot, name, layout.width, layout.height, color, 0);
        overlay.setPosition(layout.x, layout.y);
        overlay.addComponent(BlockInputEvents);
        return overlay;
    }

    private createFullBleedBackground(
        parent: Node,
        name: string,
        kind: FullBleedBackgroundKind,
    ): FullBleedBackground {
        const node = createUiNode(parent, name, this._viewport.width, this._viewport.height);
        const background = node.addComponent(FullBleedBackground);
        const gameNavigationY = kind === 'game'
            ? calculateGameTopNavigationLayout(this._viewport, this._menuButtonRect).y
            : undefined;
        background.initialize(this._viewport, kind, gameNavigationY);
        node.setSiblingIndex(0);
        return background;
    }

    private createButton(
        parent: Node,
        name: string,
        text: string,
        action: () => void,
        width: number,
        height: number,
        variant: ThemeButtonVariant = 'primary',
    ): Node {
        return createThemedButton(parent, name, text, action, width, height, variant).node;
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
        if (this._resumeOverlay !== null) { this._resumeOverlay.active = false; }
        if (this._settingsView !== null) { this._settingsView.node.active = false; }
        this.stopEdgePulse();
        this._tutorialView?.hide();
        this._inspectionView?.cancel();
        this._resultView?.hide();
        this._eventMessageView?.cancel();
        this.hideToast();
    }

    private teardownLevel(): void {
        this._officeDeskContext = null;
        this._officeDeskLayout = null;
        this._officeDeskGeometry = null;
        this._gameBackground?.setArtworkFraming(null);
        this.stopEdgePulse();
        this._edgePulse = null;
        this._eventMessageView?.cancel();
        this._eventMessageView = null;
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
        this._vectorOfficeNodes.length = 0;
        this._formalLevel = false;
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

    protected override onEnable(): void {
        if (this._gameRoot !== null && this._officeThemeAssets === null && this._cancelOfficeThemeLoad === null) {
            this.requestDefaultOfficeTheme();
        }
    }

    protected override onDisable(): void {
        this._officeThemeLoadGeneration += 1;
        this._cancelOfficeThemeLoad?.();
        this._cancelOfficeThemeLoad = null;
    }

    protected override onDestroy(): void {
        this._officeThemeLoadGeneration += 1;
        this._cancelOfficeThemeLoad?.();
        this._cancelOfficeThemeLoad = null;
        if (this._audio !== null) { this._audio.onBeat = null; }
        this._inspectionView?.cancel();
        this.stopToastTween();
        this.teardownLevel();
        this._inspectionView = null;
        this._actions = null;
        this._audio = null;
    }

    private requestDefaultOfficeTheme(): void {
        this._officeThemeLoadSettled = false;
        this._officeThemeLoadGeneration += 1;
        const generation = this._officeThemeLoadGeneration;
        this._cancelOfficeThemeLoad?.();
        this._cancelOfficeThemeLoad = requestOfficeThemeAssets(this._officeThemeId, (assets) => {
            if (generation !== this._officeThemeLoadGeneration || !isValid(this.node, true)) {
                return;
            }
            this._cancelOfficeThemeLoad = null;
            this.applyOfficeThemeAssets(assets);
            this._officeThemeLoadSettled = true;
        });
    }

    private applyOfficeThemeAssets(assets: LoadedOfficeThemeAssets | null): void {
        this._officeThemeAssets = assets;
        const enabled = assets !== null;
        this._gameBackground?.setSpriteFrame(
            assets?.frames[assets.theme.backgroundAsset] ?? null,
        );
        for (const node of this._gameBackgroundAccentNodes) {
            node.active = !enabled;
        }
        for (const node of this._vectorOfficeNodes) {
            node.active = !enabled;
        }
        for (const item of this._workItems.values()) {
            item.setOfficeThemeAssets(assets);
        }
        for (const zone of this._dropZones.values()) {
            zone.setOfficeThemeAssets(assets);
        }
        this.applyOfficeDeskLayout();
    }

    /** Resolve one immutable initial/home layout after theme artwork exists. */
    private applyOfficeDeskLayout(): void {
        const context = this._officeDeskContext;
        const assets = this._officeThemeAssets;
        const background = this._gameBackground;
        if (context === null || assets === null || background === null || this._officeDeskLayout !== null) { return; }
        const layout = assets.theme.levelLayouts[context.level.id];
        validateOfficeLevelLayout(context.level, layout);
        // An unusually late asset callback must never teleport a pressed,
        // returned or completed item. The next entry/retry will use the cache.
        if (Array.from(this._workItems.values()).some(item => !item.canApplyInitialLayout)) { return; }
        const space = context.content.getComponent(UITransform);
        if (space === null) { return; }
        const visibleWithin = (node: Node, root: Node): boolean => {
            for (let current: Node | null = node; current !== null && current !== root; current = current.parent) {
                if (!current.active) { return false; }
            }
            return true;
        };
        const rectangle = (transform: UITransform, left: number, right: number, bottom: number, top: number): OfficeBounds => {
            const points = [[left, bottom], [left, top], [right, bottom], [right, top]].map(([x, y]) =>
                space.convertToNodeSpaceAR(transform.convertToWorldSpaceAR(new Vec3(x, y, 0))));
            return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
                bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y)) };
        };
        const touchBounds = (root: Node): OfficeBounds => {
            const t = root.getComponent(UITransform);
            if (t === null) { throw new Error('Office layout: missing touch transform'); }
            return rectangle(t, -t.width * t.anchorX, t.width * (1 - t.anchorX), -t.height * t.anchorY, t.height * (1 - t.anchorY));
        };
        const measure = (root: Node): { visuals: OfficeBounds[]; supports: OfficeBounds[] } => {
            const visuals: OfficeBounds[] = [];
            const supports: OfficeBounds[] = [];
            let themedSprites = 0;
            for (const sprite of root.getComponentsInChildren(Sprite)) {
                if (!visibleWithin(sprite.node, root)) { continue; }
                const key = (Object.keys(assets.frames) as OfficeThemeAssetKey[]).find(k => assets.frames[k] === sprite.spriteFrame);
                const t = sprite.node.getComponent(UITransform);
                if (key === undefined || t === null) { continue; }
                const spec = assets.theme.assets[key];
                themedSprites += 1;
                const px = (x: number): number => (x / spec.width - t.anchorX) * t.width;
                const py = (y: number): number => (1 - y / spec.height - t.anchorY) * t.height;
                visuals.push(rectangle(t, px(spec.visibleAlphaLeft ?? 0), px(spec.visibleAlphaRight ?? spec.width),
                    py(spec.visibleAlphaBottom ?? spec.height), py(spec.visibleAlphaTop ?? 0)));
                if (spec.supportLeft !== undefined && spec.supportRight !== undefined) {
                    const y = py(spec.visibleAlphaBottom ?? spec.height);
                    supports.push(rectangle(t, px(spec.supportLeft), px(spec.supportRight), y, y));
                }
            }
            for (const label of root.getComponentsInChildren(Label)) {
                if (!label.string || !visibleWithin(label.node, root)) { continue; }
                // Public Label/UITransform bounds reserve all possible glyphs
                // (SHRINK overflow), also on mini-game platforms without DOM.
                // Browser acceptance separately measures actual glyph Alpha.
                visuals.push(touchBounds(label.node));
            }
            for (const transform of root.getComponentsInChildren(UITransform)) {
                if (transform.node.name.startsWith(OFFICE_LABEL_BACKDROP_PREFIX) && visibleWithin(transform.node, root)) {
                    visuals.push(touchBounds(transform.node));
                }
            }
            if (themedSprites === 0) {
                // Existing vector items (e.g. coffee) still reserve their body,
                // not just the text Label. Known vector top overflow is shared
                // with the existing visual regressions, never redefined here.
                const config = context.level.items.find(item => this._workItems.get(item.id)?.node === root);
                const overflow = config === undefined ? 0 : (ITEM_VISUAL_TOP_OVERFLOW as Readonly<Partial<Record<string, number>>>)[config.visual] ?? 0;
                const body = touchBounds(root);
                visuals.push({ ...body, top: body.top + overflow });
            }
            return { visuals, supports };
        };
        const obstacles: OfficeBounds[] = [];
        const inputBlockers: OfficeBounds[] = [];
        const supports: OfficeBounds[] = [];
        const items = context.level.items.filter(item => item.interaction === 'drag').map((config) => {
            const node = this._workItems.get(config.id)?.node;
            if (node === undefined) { throw new Error(`Office layout: missing item ${config.id}`); }
            const center = space.convertToNodeSpaceAR(node.worldPosition);
            const local = (r: OfficeBounds): OfficeBounds => ({ left: r.left - center.x, right: r.right - center.x, bottom: r.bottom - center.y, top: r.top - center.y });
            return { id: config.id, bounds: local(measure(node).visuals.reduce(unionOfficeBounds)), touch: local(touchBounds(node)), fixedColumn: layout.itemColumns[config.id] };
        });
        for (const config of context.level.items.filter(item => item.interaction !== 'drag')) {
            const node = this._workItems.get(config.id)?.node;
            if (node === undefined) { continue; }
            const measured = measure(node);
            if (!measured.supports.length) { throw new Error(`Office layout: missing rear support metadata for ${config.id}`); }
            obstacles.push(...measured.visuals);
            supports.push(...measured.supports);
            if (config.interaction !== 'static') { inputBlockers.push(touchBounds(node)); }
        }
        for (const config of context.level.zones.filter(zone => zone.position.y >= 0)) {
            const node = this._dropZones.get(config.id)?.node;
            if (node === undefined) { continue; }
            const measured = measure(node);
            if (!measured.supports.length) { throw new Error(`Office layout: missing target support metadata for ${config.id}`); }
            obstacles.push(...measured.visuals);
            supports.push(...measured.supports);
        }
        const geometry: OfficeDeskGeometry = { viewportWidth: this._viewport.width, viewportHeight: this._viewport.height,
            backgroundCenterY: space.convertToNodeSpaceAR(background.node.worldPosition).y, items, obstacles, inputBlockers, supports };
        const packed = solveOfficeDeskLayout(layout.tabletop, { ...geometry, items: reserveOfficeSlots(layout, items) });
        const resolved: OfficeDeskLayout = packed.ok ? { ...packed, positions: {
            ...packed.positions,
            ...Object.keys(layout.replaces).reduce<Record<string, { x: number; y: number }>>((positions, id) => {
                positions[id] = packed.positions[layout.replaces[id]]; return positions;
            }, {}),
        } } : packed;
        this._officeDeskGeometry = geometry;
        this._officeDeskLayout = resolved;
        if (!resolved.ok) {
            throw new Error(`Office layout ${context.level.id}: ${resolved.reason}; items: ${resolved.itemIds.join(', ')}. Adjust level capacity, not touch sizes.`);
        }
        background.setArtworkFraming({ scale: resolved.backgroundScale, offsetY: resolved.backgroundOffsetY });
        for (const id of Object.keys(resolved.positions)) {
            this._workItems.get(id)?.applyInitialLayout(resolved.positions[id]);
        }
    }

    public setLifecyclePaused(paused: boolean, showContinue: boolean): void {
        this._inspectionView?.setPaused(paused);
        this._resultView?.setPaused(paused);
        if (paused) {
            this._workItems.forEach((item) => item.cancelFeedback());
            this._gameRoot?.getComponentsInChildren(ActionButton).forEach((button) => button.cancelFeedback());
            this._bossView?.cancelFeedback();
            this._eventMessageView?.cancel();
            this.hideToast();
            this.stopEdgePulse();
        }
        if (this._resumeOverlay !== null) {
            this._resumeOverlay.active = showContinue;
            if (showContinue) { this.bringToFront(this._resumeOverlay); }
        }
    }

    private showEdgePulse(seconds: number): void {
        if (seconds > 3 || this._audio?.reducedMotion || this._edgePulse === null) { return; }
        Tween.stopAllByTarget(this._edgePulse);
        this._edgePulse.opacity = 0;
        tween(this._edgePulse).to(0.12, { opacity: 80 + (3 - seconds) * 25 }).to(0.28, { opacity: 0 }).start();
    }

    private stopEdgePulse(): void {
        if (this._edgePulse === null) { return; }
        Tween.stopAllByTarget(this._edgePulse);
        this._edgePulse.opacity = 0;
    }
}
