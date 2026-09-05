import { _decorator, Component, Label, Node } from 'cc';
import { ActionButton } from './ActionButton';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

export interface ResultPresentation {
    readonly success: boolean;
    readonly completedCount: number;
    readonly totalCount: number;
    readonly remainingSeconds: number;
    readonly evaluation: string;
    readonly hasNextLevel: boolean;
}

export interface ResultActions {
    readonly onRetry: () => void;
    readonly onNextLevel: () => void;
    readonly onReturnToLevels: () => void;
}

@ccclass('ResultView')
export class ResultView extends Component {
    private _card: Node | null = null;
    private _titleLabel: Label | null = null;
    private _summaryLabel: Label | null = null;
    private _evaluationLabel: Label | null = null;
    private _nextNode: Node | null = null;
    private _nextButton: ActionButton | null = null;
    private _retryNode: Node | null = null;
    private _retryLabel: Label | null = null;
    private _retryButton: ActionButton | null = null;
    private _returnNode: Node | null = null;
    private _returnButton: ActionButton | null = null;

    public initialize(actions: ResultActions): void {
        drawRoundedPanel(this.node, Palette.overlay, 0);
        this._card = createRoundedPanel(this.node, 'ResultCard', 680, 680, Palette.panel, 30);
        this._titleLabel = createLabel(this._card, 'ResultTitle', '挑战成功', 560, 90, {
            fontSize: 50,
            color: Palette.success,
            bold: true,
        });
        this._titleLabel.node.setPosition(0, 238);
        this._summaryLabel = createLabel(this._card, 'ResultSummary', '', 540, 108, {
            fontSize: 28,
            color: Palette.ink,
            bold: true,
        });
        this._summaryLabel.node.setPosition(0, 118);
        const evaluationPanel = createRoundedPanel(this._card, 'EvaluationPanel', 560, 150, Palette.paleBlue, 20);
        evaluationPanel.setPosition(0, -5);
        this._evaluationLabel = createLabel(evaluationPanel, 'Evaluation', '', 500, 118, {
            fontSize: 26,
            color: Palette.ink,
        });

        const next = this.createResultButton(this._card, 'NextButton', '下一关', actions.onNextLevel);
        this._nextNode = next.node;
        this._nextButton = next.button;
        const retry = this.createResultButton(this._card, 'RetryButton', '重新挑战', actions.onRetry);
        this._retryNode = retry.node;
        this._retryLabel = retry.label;
        this._retryButton = retry.button;
        const back = this.createResultButton(this._card, 'ReturnButton', '返回关卡', actions.onReturnToLevels);
        this._returnNode = back.node;
        this._returnButton = back.button;
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
        this.layoutButtons(result);
        this.setButtonsEnabled(true);
        this.node.active = true;
    }

    public hide(): void {
        this.node.active = false;
    }

    private layoutButtons(result: ResultPresentation): void {
        if (this._nextNode === null || this._retryNode === null || this._returnNode === null || this._retryLabel === null) {
            return;
        }
        const showNext = result.success && result.hasNextLevel;
        this._nextNode.active = showNext;
        this._retryLabel.string = result.success && !result.hasNextLevel ? '再次挑战' : '重新挑战';
        if (showNext) {
            this._nextNode.setPosition(-210, -245);
            this._retryNode.setPosition(0, -245);
            this._returnNode.setPosition(210, -245);
        } else {
            this._retryNode.setPosition(-125, -245);
            this._returnNode.setPosition(125, -245);
        }
    }

    private createResultButton(parent: Node, name: string, text: string, action: () => void): {
        readonly node: Node;
        readonly label: Label;
        readonly button: ActionButton;
    } {
        const node = createRoundedPanel(parent, name, 190, 94, Palette.blue, 24);
        const label = createLabel(node, 'Text', text, 170, 72, {
            fontSize: 25,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        const button = node.addComponent(ActionButton);
        button.configure(() => {
            this.setButtonsEnabled(false);
            action();
        });
        return { node, label, button };
    }

    private setButtonsEnabled(enabled: boolean): void {
        this._nextButton?.setInteractable(enabled);
        this._retryButton?.setInteractable(enabled);
        this._returnButton?.setInteractable(enabled);
    }
}
