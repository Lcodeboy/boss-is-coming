import { _decorator, Color, Component, Graphics, Label, Node, UITransform } from 'cc';
import { BossApproachSnapshot, BossStage } from '../core/BossApproachModel';
import { createLabel, createRoundedPanel, createUiNode, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

const STAGE_ORDER: readonly BossStage[] = [
    BossStage.GARAGE,
    BossStage.ELEVATOR,
    BossStage.ARRIVED,
    BossStage.CORRIDOR,
    BossStage.DOOR,
    BossStage.INSPECTION,
];

@ccclass('BossApproachView')
export class BossApproachView extends Component {
    private readonly _progressColor = new Color(Palette.blue.r, Palette.blue.g, Palette.blue.b, 255);
    private _stageLabel: Label | null = null;
    private _floorLabel: Label | null = null;
    private _timeLabel: Label | null = null;
    private _progressFill: Graphics | null = null;
    private _stageDots: readonly Node[] = [];
    private _shadowNode: Node | null = null;
    private _handleNode: Node | null = null;
    private _warningAccent: Graphics | null = null;
    private _lastStageText = '';
    private _lastFloorText = '';
    private _lastTimeText = '';
    private _prepared = false;
    private _formal = false;

    public initialize(formal = false): void {
        if (this._stageLabel !== null) {
            return;
        }
        this._formal = formal;

        drawRoundedPanel(
            this.node,
            formal ? Palette.backgroundDeep : Palette.panel,
            22,
            formal ? Palette.elevatorMetal : Palette.paleBlue,
            formal ? 2 : 3,
        );
        if (formal) {
            const accentNode = createUiNode(this.node, 'WarningAccent', 652, 16);
            accentNode.setPosition(0, 81);
            this._warningAccent = accentNode.addComponent(Graphics);
        }
        this._stageLabel = createLabel(this.node, 'Stage', '地下车库', 420, 48, {
            fontSize: 28,
            color: formal ? Palette.white : Palette.ink,
            bold: true,
        });
        this._stageLabel.node.setPosition(-105, 48);
        this._floorLabel = createLabel(this.node, 'Floor', 'B2', 112, 72, {
            fontSize: 38,
            color: formal ? Palette.led : Palette.blue,
            bold: true,
        });
        this._floorLabel.node.setPosition(272, 38);
        this._timeLabel = createLabel(this.node, 'Time', '预计 30 秒', 210, 42, {
            fontSize: 24,
            color: formal ? Palette.mutedLight : Palette.muted,
            bold: true,
        });
        this._timeLabel.node.setPosition(-216, 2);

        const track = createRoundedPanel(
            this.node,
            'ProgressTrack',
            620,
            18,
            formal ? Palette.backgroundSoft : Palette.paleBlue,
            9,
        );
        track.setPosition(-5, -38);
        const fillNode = createUiNode(track, 'ProgressFill', 620, 18);
        fillNode.getComponent(UITransform)?.setAnchorPoint(0, 0.5);
        fillNode.setPosition(-310, 0);
        this._progressFill = fillNode.addComponent(Graphics);

        const dots: Node[] = [];
        for (let index = 0; index < STAGE_ORDER.length; index += 1) {
            const dot = createRoundedPanel(
                this.node,
                `StageDot${index + 1}`,
                24,
                24,
                formal ? Palette.elevatorMetal : Palette.paleBlue,
                12,
            );
            dot.setPosition(-270 + index * 108, -75);
            dots.push(dot);
        }
        this._stageDots = dots;

        this._shadowNode = createRoundedPanel(this.node, 'DoorShadow', 66, 84, new Color(42, 52, 62, 220), 30);
        this._shadowNode.setPosition(248, -2);
        this._shadowNode.active = false;
        const shadowLabel = createLabel(this._shadowNode, 'ShadowLabel', '门外\n影子', 60, 70, {
            fontSize: 17,
            color: Palette.white,
            bold: true,
        });
        shadowLabel.node.setPosition(0, 0);
        this._handleNode = createRoundedPanel(this._shadowNode, 'DoorHandle', 12, 34, Palette.warning, 6);
        this._handleNode.setPosition(25, -5);
    }

    public render(snapshot: BossApproachSnapshot, remainingSeconds: number): void {
        if (this._stageLabel === null || this._floorLabel === null || this._timeLabel === null || this._progressFill === null) {
            return;
        }

        if (snapshot.stage === BossStage.INSPECTION) {
            this._prepared = false;
        }
        const floorText = snapshot.currentFloor < 0 ? `B${Math.abs(snapshot.currentFloor)}` : `${snapshot.currentFloor}F`;
        const timeText = remainingSeconds <= 0 ? '老板已到达' : `预计 ${Math.ceil(remainingSeconds)} 秒`;
        if (!this._prepared && snapshot.stageLabel !== this._lastStageText) {
            this._lastStageText = snapshot.stageLabel;
            this._stageLabel.string = snapshot.stageLabel;
        }
        if (floorText !== this._lastFloorText) {
            this._lastFloorText = floorText;
            this._floorLabel.string = floorText;
        }
        if (timeText !== this._lastTimeText) {
            this._lastTimeText = timeText;
            this._timeLabel.string = timeText;
        }

        this.mixProgressColor(snapshot.warningIntensity);
        this.renderWarningAccent(snapshot.warningIntensity);
        const width = Math.max(12, 620 * snapshot.progress);
        this._progressFill.clear();
        this._progressFill.fillColor = this._progressColor;
        this._progressFill.roundRect(0, -9, width, 18, 9);
        this._progressFill.fill();
        this._floorLabel.color = this._progressColor;
        this._timeLabel.color = snapshot.warningIntensity > 0
            ? this._progressColor
            : this._formal ? Palette.mutedLight : Palette.muted;

        const activeIndex = STAGE_ORDER.indexOf(snapshot.stage);
        for (let index = 0; index < this._stageDots.length; index += 1) {
            drawRoundedPanel(
                this._stageDots[index],
                index <= activeIndex
                    ? this._progressColor
                    : this._formal ? Palette.elevatorMetal : Palette.paleBlue,
                12,
            );
        }

        if (this._shadowNode !== null) {
            this._shadowNode.active = snapshot.showDoorShadow;
        }
        this._handleNode?.setRotationFromEuler(0, 0, snapshot.doorHandleProgress * -28);
    }

    public showPrepared(): void {
        this._prepared = true;
        if (this._stageLabel !== null) {
            this._lastStageText = '准备完毕 · 老板即将到达';
            this._stageLabel.string = this._lastStageText;
            this._stageLabel.color = Palette.success;
        }
    }

    public resetView(): void {
        this._prepared = false;
        this._lastStageText = '';
        this._lastFloorText = '';
        this._lastTimeText = '';
        if (this._stageLabel !== null) {
            this._stageLabel.color = this._formal ? Palette.white : Palette.ink;
        }
        this._shadowNode && (this._shadowNode.active = false);
    }

    private mixProgressColor(amount: number): void {
        const clamped = Math.max(0, Math.min(1, amount));
        this._progressColor.r = Math.round(Palette.blue.r + (Palette.warning.r - Palette.blue.r) * clamped);
        this._progressColor.g = Math.round(Palette.blue.g + (Palette.warning.g - Palette.blue.g) * clamped);
        this._progressColor.b = Math.round(Palette.blue.b + (Palette.warning.b - Palette.blue.b) * clamped);
        this._progressColor.a = 255;
    }

    private renderWarningAccent(amount: number): void {
        const graphics = this._warningAccent;
        if (graphics === null) {
            return;
        }
        const clamped = Math.max(0, Math.min(1, amount));
        graphics.clear();
        graphics.fillColor = clamped > 0 ? this._progressColor : Palette.blue;
        graphics.roundRect(-326, -4 - clamped * 3, 652, 8 + clamped * 6, 7);
        graphics.fill();
    }
}
