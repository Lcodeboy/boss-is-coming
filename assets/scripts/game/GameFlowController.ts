import { _decorator, Component, error, ResolutionPolicy, sys, view } from 'cc';
import { AudioFeedback } from '../core/AudioFeedback';
import { BossApproachModel } from '../core/BossApproachModel';
import { CountdownTimer } from '../core/CountdownTimer';
import { GameState, GameStateMachine } from '../core/GameStateMachine';
import { LevelSession, LevelSessionUpdate } from '../core/LevelSession';
import { ProgressService } from '../core/ProgressService';
import { GameLifecycleService, LifecycleSnapshot } from '../core/GameLifecycleService';
import { CocosLifecycleProvider } from './CocosFeedbackProviders';
import { LEVEL_IDS, LevelRepository } from '../data/LevelRepository';
import { LevelConfig } from '../data/LevelTypes';
import { GameView, GameViewActions } from '../ui/GameView';
import { InspectionStep } from '../ui/InspectionView';
import { createLabel, createRoundedPanel, DESIGN_HEIGHT, DESIGN_WIDTH, Palette } from '../ui/UIFactory';

const { ccclass } = _decorator;

@ccclass('GameFlowController')
export class GameFlowController extends Component {
    private readonly _stateMachine = new GameStateMachine();
    private readonly _session = new LevelSession();
    private readonly _approach = new BossApproachModel();
    private _timer: CountdownTimer | null = null;
    private _audio: AudioFeedback | null = null;
    private _progress: ProgressService | null = null;
    private _gameView: GameView | null = null;
    private _levels: readonly LevelConfig[] = [];
    private _level: LevelConfig | null = null;
    private _resultRemainingSeconds = 0;
    private _inspectionStarted = false;
    private _lifecycle: GameLifecycleService | null = null;
    private _disposed = false;

    protected override onLoad(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        this._timer = this.node.addComponent(CountdownTimer);
        this._audio = this.node.addComponent(AudioFeedback);
        this._progress = new ProgressService(sys.localStorage, LEVEL_IDS.length);
        this._lifecycle = new GameLifecycleService(new CocosLifecycleProvider(), () => this._stateMachine.state,
            (snapshot) => this.applyLifecycle(snapshot));
        this._lifecycle.start();
        this._stateMachine.setListener((state) => this._gameView?.onStateChanged(state));
        void this.loadApplication();
    }

    protected override onDestroy(): void {
        this._disposed = true;
        this._lifecycle?.dispose();
        this._audio?.resetRound();
        this._timer?.stopTimer();
        this._stateMachine.setListener(null);
        this._gameView = null;
        this._level = null;
        this._levels = [];
    }

    private async loadApplication(): Promise<void> {
        try {
            const levels = await LevelRepository.loadAll();
            if (this._disposed) {
                return;
            }
            this._levels = levels;
            this._gameView = this.node.addComponent(GameView);
            this._gameView.initialize(levels, this.requireProgress().snapshot, this.createActions(), this.requireAudio());
            if (this._lifecycle !== null) { this.applyLifecycle(this._lifecycle.snapshot); }
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
            onReturnHome: () => this.handleReturnHome(),
            onSelectLevel: (levelId) => this.handleSelectLevel(levelId),
            onBeginLevel: () => this.handleBeginLevel(),
            onTutorialAcknowledged: () => this.handleTutorialAcknowledged(),
            onItemAction: (itemId) => this.handleItemAction(itemId),
            onAbortLevel: () => this.handleReturnToLevels(),
            onRetry: () => this.handleRetry(),
            onNextLevel: () => this.handleNextLevel(),
            onReturnToLevels: () => this.handleReturnToLevels(),
            onContinue: () => { this._lifecycle?.continuePlaying(); },
            canInteract: () => this._stateMachine.state === GameState.PLAYING && !this._lifecycle?.snapshot.paused,
        };
    }

    private handleStartChallenge(): void {
        this._audio?.unlock();
        if (!this._stateMachine.transition(GameState.LEVEL_SELECT)) {
            return;
        }
        this._gameView?.showLevelSelect(this.requireProgress().snapshot.highestUnlockedLevel);
    }

    private handleReturnHome(): void {
        if (!this._stateMachine.transition(GameState.HOME)) {
            return;
        }
        this.resetFeedback();
        this._gameView?.showStartPage();
    }

    private handleSelectLevel(levelId: string): void {
        if (this._stateMachine.state !== GameState.LEVEL_SELECT) {
            return;
        }
        const level = this._levels.find((entry) => entry.id === levelId);
        if (level === undefined || !this.requireProgress().isUnlocked(level.order)) {
            return;
        }
        if (!this._stateMachine.transition(GameState.READY)) {
            return;
        }
        this.prepareLevel(level);
    }

    private handleBeginLevel(): void {
        const level = this._level;
        if (level === null || this._stateMachine.state !== GameState.READY) {
            return;
        }
        if (level.tutorial.length > 0 && !this.requireProgress().snapshot.tutorialSeen) {
            this._gameView?.showTutorial(level.tutorial);
            return;
        }
        this.startRound();
    }

    private handleTutorialAcknowledged(): void {
        const level = this._level;
        if (level === null || this._stateMachine.state !== GameState.READY || level.tutorial.length === 0) {
            return;
        }
        this.requireProgress().markTutorialSeen();
        this.startRound();
    }

    private startRound(): void {
        const level = this._level;
        if (level === null || !this._stateMachine.transition(GameState.PLAYING)) {
            return;
        }
        this._inspectionStarted = false;
        this._resultRemainingSeconds = level.durationSeconds;
        this._gameView?.beginPlaying();
        this.requireTimer().startTimer(
            level.durationSeconds,
            (remainingSeconds) => this.handleTimerUpdate(remainingSeconds),
            () => this.handleTimerElapsed(),
        );
    }

    private prepareLevel(level: LevelConfig): void {
        this.requireTimer().stopTimer();
        this.resetFeedback();
        this._level = level;
        this._session.configure(level);
        this._inspectionStarted = false;
        this._resultRemainingSeconds = level.durationSeconds;
        this._gameView?.configureLevel(level, this._session.snapshot);
    }

    private handleItemAction(itemId: string): void {
        if (this._stateMachine.state !== GameState.PLAYING || this._lifecycle?.snapshot.paused) {
            return;
        }
        const update = this._session.performItemAction(itemId);
        this.applySessionUpdate(update);
        this.tryEnterPreparedState();
    }

    private applySessionUpdate(update: LevelSessionUpdate): void {
        if (update.accepted) {
            this._gameView?.applySessionUpdate(update);
        }
    }

    private tryEnterPreparedState(): void {
        if (this._stateMachine.state !== GameState.PLAYING || !this._session.allCompleted) {
            return;
        }
        const timer = this.requireTimer();
        this._resultRemainingSeconds = Math.max(0, timer.remainingSeconds);
        if (this._stateMachine.transition(GameState.PREPARED)) {
            this._audio?.prepared();
            timer.finishQuickly(1.35);
        }
    }

    private handleTimerUpdate(remainingSeconds: number): void {
        const level = this._level;
        const state = this._stateMachine.state;
        if (level === null || (state !== GameState.PLAYING && state !== GameState.PREPARED)) {
            return;
        }
        if (state === GameState.PLAYING) {
            this.applySessionUpdate(this._session.advanceTime(remainingSeconds));
            this.tryEnterPreparedState();
        }
        const snapshot = this._approach.calculate(level.durationSeconds, remainingSeconds, level.targetFloor);
        this._gameView?.updateApproach(snapshot, remainingSeconds);
        this._audio?.approach(snapshot.stage, remainingSeconds);
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
        const steps: readonly InspectionStep[] = this._session.createResults().map((result) => ({
            passed: result.completed,
            message: result.completed ? result.task.successInspection : result.task.failureInspection,
        }));
        this._gameView?.playInspection(steps, () => this.finishInspection());
    }

    private finishInspection(): void {
        const level = this._level;
        if (level === null || this._stateMachine.state !== GameState.INSPECTING) {
            return;
        }
        const success = this._session.allCompleted;
        if (!this._stateMachine.transition(success ? GameState.SUCCESS : GameState.FAILURE)) {
            return;
        }
        this.requireProgress().recordResult(level.order, success);
        const firstMissing = this._session.firstIncompleteTask();
        this._gameView?.showResult({
            success,
            completedCount: this._session.completedCount,
            totalCount: this._session.totalCount,
            remainingSeconds: this._resultRemainingSeconds,
            evaluation: success
                ? level.successEvaluation
                : firstMissing?.failureInspection ?? level.failureEvaluation,
            hasNextLevel: success && level.order < this._levels.length,
        });
        this._audio?.result(success);
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
        this.prepareLevel(level);
    }

    private handleNextLevel(): void {
        const level = this._level;
        if (level === null || this._stateMachine.state !== GameState.SUCCESS) {
            return;
        }
        const nextLevel = this._levels.find((entry) => entry.order === level.order + 1);
        if (nextLevel === undefined || !this.requireProgress().isUnlocked(nextLevel.order)) {
            return;
        }
        if (!this._stateMachine.transition(GameState.READY)) {
            return;
        }
        this.prepareLevel(nextLevel);
    }

    private handleReturnToLevels(): void {
        const state = this._stateMachine.state;
        if (
            state !== GameState.READY
            && state !== GameState.PLAYING
            && state !== GameState.PREPARED
            && state !== GameState.SUCCESS
            && state !== GameState.FAILURE
        ) {
            return;
        }
        this.requireTimer().stopTimer();
        if (!this._stateMachine.transition(GameState.LEVEL_SELECT)) {
            return;
        }
        this.resetFeedback();
        this._inspectionStarted = false;
        this._gameView?.cancelGameplay();
        this._gameView?.showLevelSelect(this.requireProgress().snapshot.highestUnlockedLevel);
    }

    private requireTimer(): CountdownTimer {
        if (this._timer === null) {
            throw new Error('倒计时组件尚未初始化');
        }
        return this._timer;
    }

    private resetFeedback(): void {
        this._audio?.resetRound();
        this._lifecycle?.reset();
    }

    private applyLifecycle(snapshot: LifecycleSnapshot): void {
        this._timer?.setPaused(snapshot.paused);
        this._audio?.suspend(snapshot.paused);
        this._gameView?.setLifecyclePaused(snapshot.paused, !snapshot.hidden && snapshot.needsContinue);
    }

    private requireAudio(): AudioFeedback {
        if (this._audio === null) {
            throw new Error('音效接口尚未初始化');
        }
        return this._audio;
    }

    private requireProgress(): ProgressService {
        if (this._progress === null) {
            throw new Error('进度服务尚未初始化');
        }
        return this._progress;
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
