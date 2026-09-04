import { _decorator, Component, error, ResolutionPolicy, view } from 'cc';
import { AudioFeedback } from '../core/AudioFeedback';
import { BossApproachModel } from '../core/BossApproachModel';
import { CountdownTimer } from '../core/CountdownTimer';
import { GameState, GameStateMachine } from '../core/GameStateMachine';
import { TaskTracker } from '../core/TaskTracker';
import { LevelRepository } from '../data/LevelRepository';
import { LevelConfig } from '../data/LevelTypes';
import { GameView, GameViewActions } from '../ui/GameView';
import { InspectionStep } from '../ui/InspectionView';
import { createLabel, createRoundedPanel, DESIGN_HEIGHT, DESIGN_WIDTH, Palette } from '../ui/UIFactory';

const { ccclass } = _decorator;

@ccclass('GameFlowController')
export class GameFlowController extends Component {
    private readonly _stateMachine = new GameStateMachine();
    private readonly _taskTracker = new TaskTracker();
    private readonly _approach = new BossApproachModel();
    private _timer: CountdownTimer | null = null;
    private _audio: AudioFeedback | null = null;
    private _gameView: GameView | null = null;
    private _level: LevelConfig | null = null;
    private _resultRemainingSeconds = 0;
    private _inspectionStarted = false;
    private _warningPlayed = false;
    private _disposed = false;

    protected override onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        this._timer = this.node.addComponent(CountdownTimer);
        this._audio = this.node.addComponent(AudioFeedback);
        this._stateMachine.setListener((state) => this._gameView?.onStateChanged(state));
        void this.loadLevel();
    }

    protected override onDestroy(): void {
        this._disposed = true;
        this._timer?.stopTimer();
        this._stateMachine.setListener(null);
        this._gameView = null;
        this._level = null;
    }

    private async loadLevel(): Promise<void> {
        try {
            const level = await LevelRepository.load('level-001');
            if (this._disposed) {
                return;
            }
            this._level = level;
            this._taskTracker.configure(level.tasks);
            this._resultRemainingSeconds = level.durationSeconds;
            this._gameView = this.node.addComponent(GameView);
            this._gameView.initialize(level, this.createActions(), this.requireAudio());
        } catch (loadError: unknown) {
            const message = loadError instanceof Error ? loadError.message : String(loadError);
            error(message);
            if (!this._disposed) {
                this.showLoadFailure(message);
            }
        }
    }

    private createActions(): GameViewActions {
        return {
            onStartChallenge: () => this.handleStartChallenge(),
            onBeginLevel: () => this.handleBeginLevel(),
            onRetry: () => this.handleRetry(),
            onTaskCompleted: (taskId) => this.handleTaskCompleted(taskId),
            canInteract: () => this._stateMachine.state === GameState.PLAYING,
        };
    }

    private handleStartChallenge(): void {
        if (this._stateMachine.state !== GameState.READY) {
            return;
        }
        this._audio?.play('button');
        this._gameView?.showLevelIntro();
    }

    private handleBeginLevel(): void {
        const level = this._level;
        if (level === null || this._stateMachine.state !== GameState.READY) {
            return;
        }
        if (!this._stateMachine.transition(GameState.PLAYING)) {
            return;
        }

        this._audio?.play('button');
        this._taskTracker.reset();
        this._inspectionStarted = false;
        this._warningPlayed = false;
        this._resultRemainingSeconds = level.durationSeconds;
        this._gameView?.beginPlaying();
        this.requireTimer().startTimer(
            level.durationSeconds,
            (remainingSeconds) => this.handleTimerUpdate(remainingSeconds),
            () => this.handleTimerElapsed(),
        );
    }

    private handleTaskCompleted(taskId: string): void {
        if (this._stateMachine.state !== GameState.PLAYING || !this._taskTracker.complete(taskId)) {
            return;
        }
        this._gameView?.markTaskCompleted(taskId, this._taskTracker.completedCount);
        if (!this._taskTracker.allCompleted) {
            return;
        }

        const timer = this.requireTimer();
        this._resultRemainingSeconds = Math.max(0, timer.remainingSeconds);
        if (this._stateMachine.transition(GameState.PREPARED)) {
            timer.finishQuickly(1.35);
        }
    }

    private handleTimerUpdate(remainingSeconds: number): void {
        const level = this._level;
        const state = this._stateMachine.state;
        if (level === null || (state !== GameState.PLAYING && state !== GameState.PREPARED)) {
            return;
        }
        const snapshot = this._approach.calculate(level.durationSeconds, remainingSeconds, level.targetFloor);
        this._gameView?.updateApproach(snapshot, remainingSeconds);
        if (!this._warningPlayed && remainingSeconds <= 5) {
            this._warningPlayed = true;
            this._audio?.play('warning');
        }
    }

    private handleTimerElapsed(): void {
        const state = this._stateMachine.state;
        if (state !== GameState.PLAYING && state !== GameState.PREPARED) {
            return;
        }
        if (state === GameState.PLAYING) {
            this._resultRemainingSeconds = 0;
        }
        this.beginInspection();
    }

    private beginInspection(): void {
        const level = this._level;
        if (level === null || this._inspectionStarted) {
            return;
        }
        if (!this._stateMachine.transition(GameState.INSPECTING)) {
            return;
        }

        this._inspectionStarted = true;
        this.requireTimer().stopTimer();
        const snapshot = this._approach.calculate(level.durationSeconds, 0, level.targetFloor);
        this._gameView?.updateApproach(snapshot, 0);
        const steps: readonly InspectionStep[] = this._taskTracker.createResults().map((result) => ({
            passed: result.completed,
            message: result.completed ? result.task.successInspection : result.task.failureInspection,
        }));
        this._gameView?.playInspection(steps, () => this.finishInspection());
    }

    private finishInspection(): void {
        if (this._stateMachine.state !== GameState.INSPECTING || this._level === null) {
            return;
        }
        const success = this._taskTracker.allCompleted;
        const nextState = success ? GameState.SUCCESS : GameState.FAILURE;
        if (!this._stateMachine.transition(nextState)) {
            return;
        }
        const firstMissing = this._taskTracker.firstIncompleteTask();
        this._gameView?.showResult({
            success,
            completedCount: this._taskTracker.completedCount,
            totalCount: this._taskTracker.totalCount,
            remainingSeconds: this._resultRemainingSeconds,
            evaluation: success
                ? this._level.successEvaluation
                : firstMissing?.failureInspection ?? this._level.failureEvaluation,
        });
        this._audio?.play('result');
    }

    private handleRetry(): void {
        const state = this._stateMachine.state;
        const level = this._level;
        if (level === null || (state !== GameState.SUCCESS && state !== GameState.FAILURE)) {
            return;
        }
        this.requireTimer().stopTimer();
        if (!this._stateMachine.transition(GameState.READY)) {
            return;
        }
        this._audio?.play('button');
        this._taskTracker.reset();
        this._inspectionStarted = false;
        this._warningPlayed = false;
        this._resultRemainingSeconds = level.durationSeconds;
        this._gameView?.resetForRetry();
    }

    private requireTimer(): CountdownTimer {
        if (this._timer === null) {
            throw new Error('倒计时组件尚未初始化');
        }
        return this._timer;
    }

    private requireAudio(): AudioFeedback {
        if (this._audio === null) {
            throw new Error('音效接口尚未初始化');
        }
        return this._audio;
    }

    private showLoadFailure(message: string): void {
        const panel = createRoundedPanel(this.node, 'LoadFailure', 680, 420, Palette.panel, 28, Palette.warning, 4);
        createLabel(panel, 'LoadFailureTitle', '关卡加载失败', 580, 80, {
            fontSize: 42,
            color: Palette.warning,
            bold: true,
        }).node.setPosition(0, 105);
        createLabel(panel, 'LoadFailureMessage', message, 570, 190, {
            fontSize: 24,
            color: Palette.ink,
        }).node.setPosition(0, -35);
    }
}
