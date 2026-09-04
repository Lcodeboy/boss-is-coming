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
    view,
} from 'cc';
import { AudioFeedback } from '../core/AudioFeedback';
import { BossApproachSnapshot } from '../core/BossApproachModel';
import { GameState } from '../core/GameStateMachine';
import { calculateFixedWidthViewport } from '../core/ViewportLayout';
import { LevelConfig } from '../data/LevelTypes';
import { DropZone } from '../game/DropZone';
import { WorkItem } from '../game/WorkItem';
import { ActionButton } from './ActionButton';
import { BossApproachView } from './BossApproachView';
import { InspectionFinished, InspectionStep, InspectionView } from './InspectionView';
import { ResultPresentation, ResultView } from './ResultView';
import { createLabel, createRoundedPanel, createUiNode, DESIGN_HEIGHT, DESIGN_WIDTH, Palette } from './UIFactory';
import { TaskPanelView } from './TaskPanelView';

const { ccclass } = _decorator;

export interface GameViewActions {
    readonly onStartChallenge: () => void;
    readonly onBeginLevel: () => void;
    readonly onRetry: () => void;
    readonly onTaskCompleted: (taskId: string) => void;
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
    private _inspectionView: InspectionView | null = null;
    private _resultView: ResultView | null = null;
    private _workItems: readonly WorkItem[] = [];
    private _dropZones: readonly DropZone[] = [];
    private _viewportWidth = DESIGN_WIDTH;
    private _viewportHeight = DESIGN_HEIGHT;

    public initialize(level: LevelConfig, actions: GameViewActions, audio: AudioFeedback): void {
        if (this._gameRoot !== null) {
            return;
        }
        const frameSize = view.getFrameSize();
        const viewport = calculateFixedWidthViewport(frameSize.width, frameSize.height, DESIGN_WIDTH, DESIGN_HEIGHT);
        this._viewportWidth = viewport.width;
        this._viewportHeight = viewport.height;
        this.buildBackground();
        this.buildGameLayer(level, actions, audio);
        this.buildStartOverlay(actions.onStartChallenge);
        this.buildIntroOverlay(level, actions.onBeginLevel);
        this.buildInspectionAndResult(actions.onRetry);
        this.buildToast();
        this.showStartPage();
    }

    public onStateChanged(state: GameState): void {
        if (state === GameState.PREPARED) {
            this._bossView?.showPrepared();
            this.showToast('准备完毕！老板正在快速完成最后路程', true);
        }
    }

    public showStartPage(): void {
        if (this._gameLayer !== null) {
            this._gameLayer.active = false;
        }
        if (this._startOverlay !== null) {
            this._startOverlay.active = true;
        }
        if (this._introOverlay !== null) {
            this._introOverlay.active = false;
        }
        this._inspectionView?.cancel();
        this._resultView?.hide();
    }

    public showLevelIntro(): void {
        if (this._startOverlay !== null) {
            this._startOverlay.active = false;
        }
        if (this._introOverlay !== null) {
            this._introOverlay.active = true;
        }
    }

    public beginPlaying(): void {
        if (this._gameLayer !== null) {
            this._gameLayer.active = true;
        }
        if (this._startOverlay !== null) {
            this._startOverlay.active = false;
        }
        if (this._introOverlay !== null) {
            this._introOverlay.active = false;
        }
        this._resultView?.hide();
        this._inspectionView?.cancel();
    }

    public updateApproach(snapshot: BossApproachSnapshot, remainingSeconds: number): void {
        this._bossView?.render(snapshot, remainingSeconds);
    }

    public markTaskCompleted(taskId: string, completedCount: number): void {
        this._taskView?.setCompleted(taskId, completedCount);
    }

    public playInspection(steps: readonly InspectionStep[], onFinished: InspectionFinished): void {
        for (const item of this._workItems) {
            item.stopInteraction();
        }
        this._inspectionView?.play(steps, onFinished);
    }

    public showResult(result: ResultPresentation): void {
        this._resultView?.show(result);
    }

    public resetForRetry(): void {
        this._inspectionView?.cancel();
        this._resultView?.hide();
        this._taskView?.resetView();
        this._bossView?.resetView();
        for (const zone of this._dropZones) {
            zone.resetVisual();
        }
        for (const item of this._workItems) {
            item.resetItem();
        }
        if (this._gameLayer !== null) {
            this._gameLayer.active = false;
        }
        if (this._introOverlay !== null) {
            this._introOverlay.active = true;
        }
        this.hideToast();
    }

    public showToast(message: string, success: boolean): void {
        if (this._toastNode === null || this._toastLabel === null || this._toastOpacity === null) {
            return;
        }
        Tween.stopAllByTarget(this._toastOpacity);
        this._toastLabel.string = message;
        this._toastLabel.color = success ? Palette.success : Palette.warning;
        this._toastOpacity.opacity = 255;
        this._toastNode.active = true;
        tween(this._toastOpacity)
            .delay(0.85)
            .to(0.25, { opacity: 0 })
            .call(() => {
                if (this._toastNode !== null) {
                    this._toastNode.active = false;
                }
            })
            .start();
    }

    protected override onDestroy(): void {
        if (this._toastOpacity !== null) {
            Tween.stopAllByTarget(this._toastOpacity);
        }
    }

    private buildBackground(): void {
        this._gameRoot = createUiNode(this.node, 'GameRoot', this._viewportWidth, this._viewportHeight);
        createRoundedPanel(this._gameRoot, 'Background', this._viewportWidth, this._viewportHeight, Palette.background, 0);

        const topAccent = createRoundedPanel(this._gameRoot, 'TopAccent', this._viewportWidth, 210, Palette.blueGrayDark, 0);
        topAccent.setPosition(0, 612);
        const brand = createLabel(this._gameRoot, 'Brand', '老板上来了', 500, 60, {
            fontSize: 34,
            color: Palette.white,
            bold: true,
        });
        brand.node.setPosition(0, 628);

        const floorLine = createRoundedPanel(this._gameRoot, 'FloorLine', this._viewportWidth, 8, new Color(202, 199, 187, 255), 0);
        floorLine.setPosition(0, -585);
    }

    private buildGameLayer(level: LevelConfig, actions: GameViewActions, audio: AudioFeedback): void {
        if (this._gameRoot === null) {
            return;
        }
        this._gameLayer = createUiNode(this._gameRoot, 'GameLayer', DESIGN_WIDTH, DESIGN_HEIGHT);

        const bossNode = createRoundedPanel(this._gameLayer, 'BossApproach', 680, 190, Palette.panel, 22);
        bossNode.setPosition(0, 492);
        this._bossView = bossNode.addComponent(BossApproachView);
        this._bossView.initialize();

        const taskNode = createRoundedPanel(this._gameLayer, 'TaskPanel', 680, 164, Palette.panel, 20);
        taskNode.setPosition(0, 294);
        this._taskView = taskNode.addComponent(TaskPanelView);
        this._taskView.initialize(level.tasks);

        const workspace = createRoundedPanel(this._gameLayer, 'Workspace', 700, 690, new Color(230, 231, 226, 255), 24, Palette.paleBlue);
        workspace.setPosition(0, -155);
        const desk = createRoundedPanel(workspace, 'Desk', 660, 405, new Color(178, 193, 201, 255), 24, Palette.blueGray);
        desk.setPosition(0, 48);
        const deskTitle = createLabel(workspace, 'DeskTitle', '我的工位', 180, 42, {
            fontSize: 24,
            color: Palette.blueGrayDark,
            bold: true,
        });
        deskTitle.node.setPosition(-238, 306);

        const zones: DropZone[] = [];
        for (const zoneConfig of level.zones) {
            const zoneNode = createRoundedPanel(workspace, `Zone-${zoneConfig.id}`, zoneConfig.size.width, zoneConfig.size.height, Palette.paleBlue, 16);
            const zone = zoneNode.addComponent(DropZone);
            zone.configure(zoneConfig);
            zones.push(zone);
        }
        this._dropZones = zones;

        const items: WorkItem[] = [];
        for (const itemConfig of level.items) {
            const itemNode = createUiNode(workspace, `Item-${itemConfig.id}`, itemConfig.size.width, itemConfig.size.height);
            const item = itemNode.addComponent(WorkItem);
            item.configure(
                itemConfig,
                this._dropZones,
                actions.canInteract,
                actions.onTaskCompleted,
                (message, success) => this.showToast(message, success),
                audio,
            );
            items.push(item);
        }
        this._workItems = items;

        const helper = createLabel(workspace, 'DragHelper', '轻触电脑 · 长按拖动物品', 500, 38, {
            fontSize: 20,
            color: Palette.muted,
        });
        helper.node.setPosition(0, -315);
    }

    private buildStartOverlay(onStart: () => void): void {
        if (this._gameRoot === null) {
            return;
        }
        this._startOverlay = this.createBlockingOverlay('StartOverlay', Palette.background);
        const card = createRoundedPanel(this._startOverlay, 'StartCard', 650, 710, Palette.panel, 34, Palette.paleBlue, 4);
        card.setPosition(0, -25);
        const badge = createRoundedPanel(card, 'Badge', 180, 58, Palette.warningPale, 20);
        badge.setPosition(0, 240);
        createLabel(badge, 'BadgeText', '办公室生存挑战', 160, 45, {
            fontSize: 20,
            color: Palette.warning,
            bold: true,
        });
        const title = createLabel(card, 'Title', '老板上来了', 560, 110, {
            fontSize: 60,
            color: Palette.ink,
            bold: true,
        });
        title.node.setPosition(0, 132);
        const subtitle = createLabel(card, 'Subtitle', '在老板进门前整理好工位', 540, 80, {
            fontSize: 31,
            color: Palette.muted,
        });
        subtitle.node.setPosition(0, 42);
        const elevator = createRoundedPanel(card, 'ElevatorIcon', 230, 150, Palette.paleBlue, 18, Palette.blueGray, 4);
        elevator.setPosition(0, -92);
        createLabel(elevator, 'ElevatorText', 'B2  ↑  18F\n老板正在接近', 200, 120, {
            fontSize: 27,
            color: Palette.blueGrayDark,
            bold: true,
        });
        const startButton = this.createButton(card, 'StartButton', '开始挑战', onStart);
        startButton.setPosition(0, -254);
    }

    private buildIntroOverlay(level: LevelConfig, onBegin: () => void): void {
        if (this._gameRoot === null) {
            return;
        }
        this._introOverlay = this.createBlockingOverlay('IntroOverlay', Palette.overlay);
        const card = createRoundedPanel(this._introOverlay, 'IntroCard', 650, 790, Palette.panel, 30, Palette.warning, 4);
        const title = createLabel(card, 'LevelName', `第一关 · ${level.name}`, 560, 74, {
            fontSize: 42,
            color: Palette.warning,
            bold: true,
        });
        title.node.setPosition(0, 294);
        const intro = createLabel(card, 'IntroText', level.intro, 550, 150, {
            fontSize: 29,
            color: Palette.ink,
        });
        intro.node.setPosition(0, 182);
        const listPanel = createRoundedPanel(card, 'IntroTasks', 550, 330, Palette.paleBlue, 20);
        listPanel.setPosition(0, -50);
        const listTitle = createLabel(listPanel, 'ListTitle', '30 秒整理目标', 470, 48, {
            fontSize: 27,
            color: Palette.blueGrayDark,
            bold: true,
        });
        listTitle.node.setPosition(0, 126);
        for (let index = 0; index < level.tasks.length; index += 1) {
            const task = level.tasks[index];
            const taskLabel = createLabel(listPanel, `IntroTask-${task.id}`, `${index + 1}. ${task.prompt}`, 475, 54, {
                fontSize: 23,
                color: Palette.ink,
            });
            taskLabel.node.setPosition(0, 70 - index * 58);
        }
        const beginButton = this.createButton(card, 'BeginButton', '马上整理', onBegin);
        beginButton.setPosition(0, -308);
        this._introOverlay.active = false;
    }

    private buildInspectionAndResult(onRetry: () => void): void {
        if (this._gameRoot === null) {
            return;
        }
        const inspectionNode = createUiNode(this._gameRoot, 'InspectionOverlay', this._viewportWidth, this._viewportHeight);
        inspectionNode.addComponent(BlockInputEvents);
        this._inspectionView = inspectionNode.addComponent(InspectionView);
        this._inspectionView.initialize();

        const resultNode = createUiNode(this._gameRoot, 'ResultOverlay', this._viewportWidth, this._viewportHeight);
        resultNode.addComponent(BlockInputEvents);
        this._resultView = resultNode.addComponent(ResultView);
        this._resultView.initialize(onRetry);
    }

    private buildToast(): void {
        if (this._gameRoot === null) {
            return;
        }
        this._toastNode = createRoundedPanel(this._gameRoot, 'Toast', 590, 76, Palette.panel, 24, Palette.paleBlue, 3);
        this._toastNode.setPosition(0, -530);
        this._toastLabel = createLabel(this._toastNode, 'ToastText', '', 540, 58, {
            fontSize: 24,
            color: Palette.success,
            bold: true,
        });
        this._toastOpacity = this._toastNode.addComponent(UIOpacity);
        this._toastNode.active = false;
    }

    private createBlockingOverlay(name: string, color: Color): Node {
        if (this._gameRoot === null) {
            throw new Error('GameRoot 尚未初始化');
        }
        const overlay = createRoundedPanel(this._gameRoot, name, this._viewportWidth, this._viewportHeight, color, 0);
        overlay.addComponent(BlockInputEvents);
        return overlay;
    }

    private createButton(parent: Node, name: string, text: string, action: () => void): Node {
        const button = createRoundedPanel(parent, name, 360, 104, Palette.blue, 28);
        createLabel(button, 'ButtonText', text, 320, 86, {
            fontSize: 34,
            color: Palette.white,
            bold: true,
        });
        button.addComponent(ActionButton).configure(action);
        return button;
    }

    private hideToast(): void {
        if (this._toastOpacity !== null) {
            Tween.stopAllByTarget(this._toastOpacity);
            this._toastOpacity.opacity = 0;
        }
        if (this._toastNode !== null) {
            this._toastNode.active = false;
        }
    }
}
