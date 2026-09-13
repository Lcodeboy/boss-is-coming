import { _decorator, Component, Label, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import {
    RESULT_MODAL_ENTRANCE_SECONDS,
    RESULT_MODAL_REDUCED_ENTRANCE_SECONDS,
} from '../core/InspectionAnimation';
import { calculateSafeModalLayout, FixedWidthViewport } from '../core/ViewportLayout';
import { prefersReducedMotion } from '../game/CocosFeedbackProviders';
import { ActionButton } from './ActionButton';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette } from './UIFactory';
import { createModalCard, createThemedButton, paintButton, paintModalCard } from './VisualFactory';
import { RESULT_VISUAL_METRICS } from './VisualMetrics';

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
    private _evaluationPanel: Node | null = null;
    private _nextNode: Node | null = null;
    private _nextButton: ActionButton | null = null;
    private _retryNode: Node | null = null;
    private _retryLabel: Label | null = null;
    private _retryButton: ActionButton | null = null;
    private _returnNode: Node | null = null;
    private _returnButton: ActionButton | null = null;
    private _statusBadge: Node | null = null;
    private _statusBadgeLabel: Label | null = null;
    private _cardOpacity: UIOpacity | null = null;
    private _formal = false;

    public initialize(viewport: FixedWidthViewport, actions: ResultActions): void {
        this._card = createModalCard(
            this.node,
            'ResultCard',
            680,
            RESULT_VISUAL_METRICS.cardHeight,
            Palette.blue,
        );
        this._card.setPosition(
            0,
            calculateSafeModalLayout(viewport, RESULT_VISUAL_METRICS.cardHeight).centerY,
        );
        this._cardOpacity = this._card.addComponent(UIOpacity);
        this._cardOpacity.opacity = 255;
        this._statusBadge = createRoundedPanel(
            this._card,
            'StatusBadge',
            RESULT_VISUAL_METRICS.statusHeight,
            RESULT_VISUAL_METRICS.statusHeight,
            Palette.success,
            RESULT_VISUAL_METRICS.statusHeight / 2,
        );
        this._statusBadge.setPosition(0, RESULT_VISUAL_METRICS.statusCenterY);
        this._statusBadgeLabel = createLabel(this._statusBadge, 'StatusIcon', '✓', 60, 60, {
            fontSize: 38,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
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
        this._evaluationPanel = createRoundedPanel(this._card, 'EvaluationPanel', 560, 150, Palette.paleBlue, 20);
        this._evaluationPanel.setPosition(0, -5);
        this._evaluationLabel = createLabel(this._evaluationPanel, 'Evaluation', '', 500, 118, {
            fontSize: 26,
            color: Palette.ink,
        });

        const next = this.createResultButton(this._card, 'NextButton', '下一关', actions.onNextLevel, 'primary');
        this._nextNode = next.node;
        this._nextButton = next.button;
        const retry = this.createResultButton(this._card, 'RetryButton', '重新挑战', actions.onRetry, 'secondary');
        this._retryNode = retry.node;
        this._retryLabel = retry.label;
        this._retryButton = retry.button;
        const back = this.createResultButton(this._card, 'ReturnButton', '返回关卡', actions.onReturnToLevels, 'secondary');
        this._returnNode = back.node;
        this._returnButton = back.button;
        this.node.active = false;
    }

    public setFormalTheme(formal: boolean): void {
        this._formal = formal;
        if (this._card !== null) {
            paintModalCard(this._card, formal ? Palette.blue : Palette.blueGray);
        }
        if (this._statusBadge !== null) {
            this._statusBadge.active = formal;
        }
        this._titleLabel?.node.setPosition(0, formal ? RESULT_VISUAL_METRICS.titleCenterY : 238);
        this._summaryLabel?.node.setPosition(0, formal ? RESULT_VISUAL_METRICS.summaryCenterY : 118);
        this._evaluationPanel?.setPosition(0, formal ? RESULT_VISUAL_METRICS.evaluationCenterY : -5);
    }

    public show(result: ResultPresentation): void {
        if (this._card === null || this._titleLabel === null || this._summaryLabel === null || this._evaluationLabel === null) {
            return;
        }
        const statusColor = result.success ? Palette.success : Palette.warning;
        paintModalCard(this._card, this._formal ? Palette.blue : statusColor);
        this._titleLabel.string = result.success ? '挑战成功' : '挑战失败';
        this._titleLabel.color = statusColor;
        this._summaryLabel.string = `完成任务  ${result.completedCount}/${result.totalCount}\n剩余时间  ${Math.max(0, Math.ceil(result.remainingSeconds))} 秒`;
        this._evaluationLabel.string = result.evaluation;
        if (this._statusBadge !== null && this._statusBadgeLabel !== null) {
            drawRoundedPanel(this._statusBadge, statusColor, RESULT_VISUAL_METRICS.statusHeight / 2);
            this._statusBadgeLabel.string = result.success ? '✓' : '!';
        }
        this.layoutButtons(result);
        this.setButtonsEnabled(true);
        this.stopEntranceAnimation();
        const reducedMotion = prefersReducedMotion();
        this._card.setScale(reducedMotion ? Vec3.ONE : new Vec3(0.96, 0.96, 1));
        if (this._cardOpacity !== null) {
            this._cardOpacity.opacity = 0;
        }
        this.node.active = true;
        if (this._cardOpacity !== null) {
            tween(this._cardOpacity)
                .to(
                    reducedMotion ? RESULT_MODAL_REDUCED_ENTRANCE_SECONDS : RESULT_MODAL_ENTRANCE_SECONDS,
                    { opacity: 255 },
                    { easing: 'quadOut' },
                )
                .start();
        }
        if (!reducedMotion) {
            tween(this._card)
                .to(RESULT_MODAL_ENTRANCE_SECONDS, { scale: Vec3.ONE }, { easing: 'backOut' })
                .start();
        }
    }

    public hide(): void {
        this.stopEntranceAnimation();
        this.restoreEntranceState();
        this.node.active = false;
    }

    public setPaused(paused: boolean): void {
        if (!paused) {
            return;
        }
        this.stopEntranceAnimation();
        this.restoreEntranceState();
    }

    protected override onDisable(): void {
        this.stopEntranceAnimation();
        this.restoreEntranceState();
    }

    protected override onDestroy(): void {
        this.stopEntranceAnimation();
        this._cardOpacity = null;
        this._card = null;
    }

    private layoutButtons(result: ResultPresentation): void {
        if (this._nextNode === null || this._retryNode === null || this._returnNode === null || this._retryLabel === null) {
            return;
        }
        const showNext = result.success && result.hasNextLevel;
        this._nextNode.active = showNext;
        if (showNext) {
            paintButton(this._nextNode, 'primary');
        }
        this._retryLabel.string = result.success && !result.hasNextLevel ? '再次挑战' : '重新挑战';
        paintButton(this._retryNode, result.success && showNext ? 'secondary' : 'primary');
        this._retryLabel.color = result.success && showNext ? Palette.blueGrayDark : Palette.white;
        paintButton(this._returnNode, 'secondary');
        if (showNext) {
            this._nextNode.setPosition(-210, -245);
            this._retryNode.setPosition(0, -245);
            this._returnNode.setPosition(210, -245);
        } else {
            this._retryNode.setPosition(-125, -245);
            this._returnNode.setPosition(125, -245);
        }
    }

    private createResultButton(
        parent: Node,
        name: string,
        text: string,
        action: () => void,
        variant: 'primary' | 'secondary',
    ): {
        readonly node: Node;
        readonly label: Label;
        readonly button: ActionButton;
    } {
        const themed = createThemedButton(parent, name, text, action, 190, 94, variant);
        themed.label.node.name = 'Text';
        const node = themed.node;
        const label = themed.label;
        const button = themed.button;
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

    private stopEntranceAnimation(): void {
        if (this._cardOpacity !== null) {
            Tween.stopAllByTarget(this._cardOpacity);
        }
        if (this._card !== null) {
            Tween.stopAllByTarget(this._card);
        }
    }

    private restoreEntranceState(): void {
        if (this._cardOpacity !== null) {
            this._cardOpacity.opacity = 255;
        }
        this._card?.setScale(Vec3.ONE);
    }
}
