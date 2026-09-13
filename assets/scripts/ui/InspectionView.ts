import { _decorator, Component, director, Label, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import {
    calculateInspectionAnimationLayout,
    calculateInspectionAnimationTimeline,
} from '../core/InspectionAnimation';
import { FixedWidthViewport } from '../core/ViewportLayout';
import { prefersReducedMotion } from '../game/CocosFeedbackProviders';
import { BossInspectionActor } from './BossInspectionActor';
import { createLabel, createRoundedPanel, createUiNode, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

export interface InspectionStep {
    readonly passed: boolean;
    readonly message: string;
}

export type InspectionFinished = () => void;

@ccclass('InspectionView')
export class InspectionView extends Component {
    private _titleLabel: Label | null = null;
    private _progressLabel: Label | null = null;
    private _statusPanel: Node | null = null;
    private _feedbackPanel: Node | null = null;
    private _feedbackLabel: Label | null = null;
    private _shadeOpacity: UIOpacity | null = null;
    private _feedbackOpacity: UIOpacity | null = null;
    private _bossActor: BossInspectionActor | null = null;
    private _steps: readonly InspectionStep[] = [];
    private _onFinished: InspectionFinished | null = null;
    private _formal = false;
    private _paused = false;
    private _reducedMotion = false;
    private _outcomeShown = false;
    private _actorGeneration = 0;

    public initialize(viewport: FixedWidthViewport): void {
        // 根节点继续承担 BlockInputEvents，视觉遮罩由独立子节点渐变，避免连带淡入角色。
        drawRoundedPanel(this.node, Palette.transparent, 0);
        const layout = calculateInspectionAnimationLayout(viewport);
        const shade = createRoundedPanel(
            this.node,
            'InspectionShade',
            viewport.width,
            viewport.height,
            Palette.overlay,
            0,
        );
        this._shadeOpacity = shade.addComponent(UIOpacity);
        this._shadeOpacity.opacity = 0;

        const actorNode = createUiNode(
            this.node,
            'BossRoot',
            layout.actorWidth,
            layout.actorHeight,
        );
        this._bossActor = actorNode.addComponent(BossInspectionActor);
        this._bossActor.initialize(layout);

        this._statusPanel = createRoundedPanel(
            this.node,
            'InspectionStatus',
            520,
            112,
            Palette.hudPanel,
            24,
            Palette.hudStroke,
            2,
        );
        this._statusPanel.setPosition(0, layout.titleY - 20);
        this._titleLabel = createLabel(this._statusPanel, 'Title', '老板进场检查…', 470, 46, {
            fontSize: 31,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        this._titleLabel.node.setPosition(0, 20);
        this._progressLabel = createLabel(this._statusPanel, 'Progress', '检查 0/0', 430, 34, {
            fontSize: 21,
            color: Palette.mutedLight,
            bold: true,
            wrap: false,
        });
        this._progressLabel.node.setPosition(0, -27);

        this._feedbackPanel = createRoundedPanel(
            this.node,
            'InspectionOutcome',
            560,
            92,
            Palette.successPale,
            24,
            Palette.success,
            3,
        );
        this._feedbackPanel.setPosition(0, layout.feedbackY);
        this._feedbackOpacity = this._feedbackPanel.addComponent(UIOpacity);
        this._feedbackOpacity.opacity = 0;
        this._feedbackLabel = createLabel(this._feedbackPanel, 'OutcomeText', '', 500, 62, {
            fontSize: 27,
            color: Palette.success,
            bold: true,
            wrap: false,
        });
        this.node.active = false;
    }

    public setFormalTheme(formal: boolean): void {
        this._formal = formal;
        if (this._statusPanel !== null) {
            drawRoundedPanel(
                this._statusPanel,
                Palette.hudPanel,
                24,
                formal ? Palette.blue : Palette.hudStroke,
                formal ? 2 : 1.5,
            );
        }
    }

    public play(steps: readonly InspectionStep[], onFinished: InspectionFinished): void {
        this.cancel();
        this._steps = steps;
        this._onFinished = onFinished;
        this._outcomeShown = false;
        this._reducedMotion = prefersReducedMotion();
        const timeline = calculateInspectionAnimationTimeline(steps.length, this._reducedMotion);

        if (this._titleLabel !== null) {
            this._titleLabel.string = '老板进场检查…';
            this._titleLabel.color = Palette.white;
        }
        if (this._progressLabel !== null) {
            this._progressLabel.string = `检查 0/${steps.length}`;
            this._progressLabel.color = Palette.mutedLight;
        }
        this.resetVisualState();
        this.node.active = true;
        if (this._shadeOpacity !== null) {
            if (this._reducedMotion) {
                this._shadeOpacity.opacity = 255;
            } else {
                tween(this._shadeOpacity).to(timeline.shadeSeconds, { opacity: 255 }).start();
            }
        }
        const actorGeneration = this._bossActor?.play(this._reducedMotion) ?? 0;
        this._actorGeneration = actorGeneration;

        for (const update of timeline.progressUpdates) {
            this.scheduleOnce(() => this.showProgress(update.index), update.atSeconds);
        }
        for (const update of timeline.poseUpdates) {
            this.scheduleOnce(() => this._bossActor?.transitionPoseWithoutGhost(
                update.pose,
                update.durationSeconds,
                update.transitionStyle,
                actorGeneration,
            ), update.atSeconds);
        }
        this.scheduleOnce(this.showOutcome, timeline.outcomeAtSeconds);
        if (!this._reducedMotion) {
            this.scheduleOnce(this.showFinalPose, timeline.finalPoseAtSeconds);
        }
        this.scheduleOnce(this.finishInspection, timeline.totalSeconds);
    }

    public cancel(): void {
        const target: Pick<Component, 'uuid'> = this;
        director.getScheduler().resumeTarget(target);
        this._paused = false;
        this.clearPlayback();
        this.node.active = false;
    }

    public setPaused(paused: boolean): void {
        if (paused === this._paused) {
            return;
        }
        this._paused = paused;
        const target: Pick<Component, 'uuid'> = this;
        if (paused) {
            director.getScheduler().pauseTarget(target);
            this.pauseVisualTweens();
        } else {
            director.getScheduler().resumeTarget(target);
            this.resumeVisualTweens();
        }
        this._bossActor?.setPaused(paused);
    }

    protected override onDisable(): void {
        this.clearPlayback();
    }

    protected override onDestroy(): void {
        this.clearPlayback();
        this._bossActor = null;
    }

    private showProgress(index: number): void {
        if (this._onFinished === null || this._progressLabel === null) {
            return;
        }
        const visibleIndex = Math.max(0, Math.min(this._steps.length - 1, index));
        this._progressLabel.string = `检查 ${visibleIndex + 1}/${this._steps.length}`;
    }

    private readonly showOutcome = (): void => {
        if (this._onFinished === null || this._outcomeShown) {
            return;
        }
        this._outcomeShown = true;
        const failedCount = this._steps.filter((step) => !step.passed).length;
        const passed = failedCount === 0;
        this._bossActor?.playResultReaction(passed, this._reducedMotion, this._actorGeneration);
        if (this._titleLabel !== null) {
            this._titleLabel.string = passed ? '检查完成' : '发现问题';
            this._titleLabel.color = passed ? Palette.success : Palette.warning;
        }
        if (this._progressLabel !== null) {
            this._progressLabel.string = `检查 ${this._steps.length}/${this._steps.length}`;
            this._progressLabel.color = passed ? Palette.success : Palette.warning;
        }
        if (this._feedbackPanel === null || this._feedbackLabel === null || this._feedbackOpacity === null) {
            return;
        }
        drawRoundedPanel(
            this._feedbackPanel,
            passed ? Palette.successPale : Palette.warningPale,
            24,
            passed ? Palette.success : Palette.warning,
            this._formal ? 2 : 3,
        );
        this._feedbackLabel.string = passed
            ? '✓  全部合格'
            : `×  ${this._steps.find((step) => !step.passed)?.message ?? `发现 ${failedCount} 项未完成`}`;
        this._feedbackLabel.color = passed ? Palette.success : Palette.warning;
        this._feedbackOpacity.opacity = 0;
        if (this._reducedMotion) {
            this._feedbackPanel.setScale(Vec3.ONE);
            this._feedbackOpacity.opacity = 255;
            return;
        }
        this._feedbackPanel.setScale(0.94, 0.94, 1);
        tween(this._feedbackOpacity).to(0.12, { opacity: 255 }).start();
        tween(this._feedbackPanel)
            .to(0.14, { scale: new Vec3(1.035, 1.035, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: Vec3.ONE }, { easing: 'quadOut' })
            .start();
    };

    private readonly showFinalPose = (): void => {
        if (this._onFinished === null || !this._outcomeShown || this._reducedMotion) {
            return;
        }
        this._bossActor?.showFinalPose(this._actorGeneration);
    };

    private readonly finishInspection = (): void => {
        if (this._onFinished === null) {
            return;
        }
        this.unscheduleAllCallbacks();
        const finished = this._onFinished;
        this._onFinished = null;
        this._steps = [];
        this._outcomeShown = false;
        this.stopVisualTweens();
        this._bossActor?.reset();
        this._actorGeneration = 0;
        this.node.active = false;
        finished();
    };

    private resetVisualState(): void {
        this.stopVisualTweens();
        if (this._shadeOpacity !== null) {
            this._shadeOpacity.opacity = 0;
        }
        if (this._feedbackOpacity !== null) {
            this._feedbackOpacity.opacity = 0;
        }
        this._feedbackPanel?.setScale(Vec3.ONE);
    }

    private clearPlayback(): void {
        const target: Pick<Component, 'uuid'> = this;
        director.getScheduler().resumeTarget(target);
        this._paused = false;
        this.unscheduleAllCallbacks();
        this._steps = [];
        this._onFinished = null;
        this._outcomeShown = false;
        this.stopVisualTweens();
        this._bossActor?.reset();
        this._actorGeneration = 0;
    }

    private pauseVisualTweens(): void {
        for (const target of [this._shadeOpacity, this._feedbackOpacity, this._feedbackPanel]) {
            if (target !== null) {
                Tween.pauseAllByTarget(target);
            }
        }
    }

    private resumeVisualTweens(): void {
        for (const target of [this._shadeOpacity, this._feedbackOpacity, this._feedbackPanel]) {
            if (target !== null) {
                Tween.resumeAllByTarget(target);
            }
        }
    }

    private stopVisualTweens(): void {
        for (const target of [this._shadeOpacity, this._feedbackOpacity, this._feedbackPanel]) {
            if (target !== null) {
                Tween.stopAllByTarget(target);
            }
        }
    }
}
