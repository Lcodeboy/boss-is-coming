export type CountdownUpdate = (remainingSeconds: number) => void;
export type CountdownElapsed = () => void;

/** 基于 deltaTime 的单实例倒计时；快速收尾与自然结束共用同一个到达出口。 */
export class CountdownClock {
    private _paused = false;
    private _skipFrame = false;
    private _remainingSeconds = 0;
    private _speed = 1;
    private _running = false;
    private _notificationAccumulator = 0;
    private _onUpdate: CountdownUpdate | null = null;
    private _onElapsed: CountdownElapsed | null = null;

    public get remainingSeconds(): number {
        return this._remainingSeconds;
    }

    public startTimer(durationSeconds: number, onUpdate: CountdownUpdate, onElapsed: CountdownElapsed): void {
        this.stopTimer();
        this._remainingSeconds = durationSeconds;
        this._speed = 1;
        this._running = true;
        this._onUpdate = onUpdate;
        this._onElapsed = onElapsed;
        this._notificationAccumulator = 0;
        this._onUpdate(this._remainingSeconds);
    }

    public finishQuickly(realSeconds: number): void {
        if (!this._running || this._remainingSeconds <= 0) {
            return;
        }
        this._speed = Math.max(1, this._remainingSeconds / Math.max(0.1, realSeconds));
    }

    public stopTimer(): void {
        this._paused = false;
        this._skipFrame = false;
        this._running = false;
        this._speed = 1;
        this._notificationAccumulator = 0;
        this._onUpdate = null;
        this._onElapsed = null;
    }

    /** 恢复首帧舍弃可能包含后台时长的 delta，不改变正常前台速度。 */
    public setPaused(paused: boolean): void {
        if (this._paused && !paused) { this._skipFrame = true; }
        this._paused = paused;
    }

    public update(deltaTime: number): void {
        if (!this._running || this._paused) {
            return;
        }
        if (this._skipFrame) { this._skipFrame = false; return; }
        if (!Number.isFinite(deltaTime) || deltaTime <= 0) { return; }

        this._remainingSeconds = Math.max(0, this._remainingSeconds - deltaTime * this._speed);
        this._notificationAccumulator += deltaTime;
        if (this._notificationAccumulator >= 0.1 || this._remainingSeconds === 0) {
            this._notificationAccumulator = 0;
            this._onUpdate?.(this._remainingSeconds);
        }

        if (this._remainingSeconds > 0 || this._paused || !this._running) {
            return;
        }

        const elapsed = this._onElapsed;
        this._running = false;
        this._onUpdate = null;
        this._onElapsed = null;
        elapsed?.();
    }

}
