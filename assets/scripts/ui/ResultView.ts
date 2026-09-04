import { _decorator, Component, Label } from 'cc';
import { ActionButton } from './ActionButton';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

export interface ResultPresentation {
    readonly success: boolean;
    readonly completedCount: number;
    readonly totalCount: number;
    readonly remainingSeconds: number;
    readonly evaluation: string;
}

@ccclass('ResultView')
export class ResultView extends Component {
    private _card: ReturnType<typeof createRoundedPanel> | null = null;
    private _titleLabel: Label | null = null;
    private _summaryLabel: Label | null = null;
    private _evaluationLabel: Label | null = null;
    private _retryButton: ActionButton | null = null;

    public initialize(onRetry: () => void): void {
        drawRoundedPanel(this.node, Palette.overlay, 0);
        this._card = createRoundedPanel(this.node, 'ResultCard', 650, 610, Palette.panel, 30);
        this._titleLabel = createLabel(this._card, 'ResultTitle', '挑战成功', 540, 90, {
            fontSize: 52,
            color: Palette.success,
            bold: true,
        });
        this._titleLabel.node.setPosition(0, 205);
        this._summaryLabel = createLabel(this._card, 'ResultSummary', '', 520, 120, {
            fontSize: 29,
            color: Palette.ink,
            bold: true,
        });
        this._summaryLabel.node.setPosition(0, 78);
        const evaluationPanel = createRoundedPanel(this._card, 'EvaluationPanel', 540, 150, Palette.paleBlue, 20);
        evaluationPanel.setPosition(0, -54);
        this._evaluationLabel = createLabel(evaluationPanel, 'Evaluation', '', 480, 118, {
            fontSize: 27,
            color: Palette.ink,
        });
        const retryNode = createRoundedPanel(this._card, 'RetryButton', 340, 100, Palette.blue, 28);
        retryNode.setPosition(0, -215);
        createLabel(retryNode, 'RetryText', '重新挑战', 300, 82, {
            fontSize: 34,
            color: Palette.white,
            bold: true,
        });
        this._retryButton = retryNode.addComponent(ActionButton);
        this._retryButton.configure(onRetry);
        this.node.active = false;
    }

    public show(result: ResultPresentation): void {
        if (this._card === null || this._titleLabel === null || this._summaryLabel === null || this._evaluationLabel === null) {
            return;
        }
        const statusColor = result.success ? Palette.success : Palette.warning;
        drawRoundedPanel(this._card, Palette.panel, 30, statusColor, 4);
        this._titleLabel.string = result.success ? '挑战成功' : '挑战失败';
        this._titleLabel.color = statusColor;
        this._summaryLabel.string = `完成任务  ${result.completedCount}/${result.totalCount}\n剩余时间  ${Math.max(0, Math.ceil(result.remainingSeconds))} 秒`;
        this._evaluationLabel.string = result.evaluation;
        this.node.active = true;
        this._retryButton?.setInteractable(true);
    }

    public hide(): void {
        this.node.active = false;
    }
}
