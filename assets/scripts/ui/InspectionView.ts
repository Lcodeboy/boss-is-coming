import { _decorator, Component, Label } from 'cc';
import { InspectionSequence, InspectionSequenceEvent } from '../core/InspectionSequence';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

export interface InspectionStep {
    readonly passed: boolean;
    readonly message: string;
}

export type InspectionFinished = () => void;

export const INSPECTION_STEP_DURATION_SECONDS = 0.82;

@ccclass('InspectionView')
export class InspectionView extends Component {
    private readonly _sequence = new InspectionSequence();
    private _titleLabel: Label | null = null;
    private _messageLabel: Label | null = null;
    private _progressLabel: Label | null = null;
    private _messagePanel: ReturnType<typeof createRoundedPanel> | null = null;
    private _steps: readonly InspectionStep[] = [];
    private _index = 0;
    private _onFinished: InspectionFinished | null = null;

    public initialize(): void {
        drawRoundedPanel(this.node, Palette.overlay, 0);
        const card = createRoundedPanel(this.node, 'InspectionCard', 650, 470, Palette.panel, 28);
        this._titleLabel = createLabel(card, 'Title', '老板开始检查…', 560, 64, {
            fontSize: 38,
            color: Palette.ink,
            bold: true,
        });
        this._titleLabel.node.setPosition(0, 150);
        this._progressLabel = createLabel(card, 'Progress', '检查 1/4', 500, 38, {
            fontSize: 22,
            color: Palette.muted,
        });
        this._progressLabel.node.setPosition(0, 95);
        this._messagePanel = createRoundedPanel(card, 'MessageBubble', 550, 185, Palette.paleBlue, 22);
        this._messagePanel.setPosition(0, -20);
        this._messageLabel = createLabel(this._messagePanel, 'Message', '', 480, 145, {
            fontSize: 29,
            color: Palette.ink,
            bold: true,
        });
        const footer = createLabel(card, 'Footer', '检查结果将逐项给出', 500, 40, {
            fontSize: 20,
            color: Palette.muted,
        });
        footer.node.setPosition(0, -168);
        this.node.active = false;
    }

    public play(steps: readonly InspectionStep[], onFinished: InspectionFinished): void {
        this.cancel();
        this._steps = steps;
        this._onFinished = onFinished;
        this.node.active = true;
        const firstEvent = this._sequence.start(steps.length);
        this.consumeSequenceEvent(firstEvent);
        if (firstEvent.kind === 'step' && this._onFinished !== null) {
            // 只注册一次；避免在一次性回调执行期间重新注册同一函数而被调度器吞掉。
            this.schedule(this.advance, INSPECTION_STEP_DURATION_SECONDS);
        }
    }

    public cancel(): void {
        this.unscheduleAllCallbacks();
        this._sequence.cancel();
        this._steps = [];
        this._index = 0;
        this._onFinished = null;
        this.node.active = false;
    }

    protected override onDestroy(): void {
        this.cancel();
    }

    private showCurrentStep(index: number): void {
        this._index = index;
        const step = this._steps[this._index];
        if (step === undefined || this._messageLabel === null || this._progressLabel === null || this._messagePanel === null) {
            this.finishInspection();
            return;
        }

        this._progressLabel.string = `检查 ${this._index + 1}/${this._steps.length}`;
        this._messageLabel.string = step.message;
        this._messageLabel.color = step.passed ? Palette.success : Palette.warning;
        drawRoundedPanel(
            this._messagePanel,
            step.passed ? Palette.successPale : Palette.warningPale,
            22,
            step.passed ? Palette.success : Palette.warning,
            3,
        );
    }

    private readonly advance = (): void => {
        this.consumeSequenceEvent(this._sequence.advance());
    };

    private readonly finishInspection = (): void => {
        if (this._onFinished === null) {
            return;
        }
        this.unschedule(this.advance);
        this._sequence.cancel();
        const finished = this._onFinished;
        this._onFinished = null;
        this.node.active = false;
        finished?.();
    };

    private consumeSequenceEvent(event: InspectionSequenceEvent): void {
        if (event.kind === 'step') {
            this.showCurrentStep(event.index);
        } else if (event.kind === 'completed') {
            this.finishInspection();
        }
    }
}
