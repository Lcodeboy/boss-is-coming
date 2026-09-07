import { _decorator, Component } from 'cc';
import { CountdownClock, CountdownElapsed, CountdownUpdate } from './CountdownClock';
export type { CountdownElapsed, CountdownUpdate } from './CountdownClock';

const { ccclass } = _decorator;

/** Cocos 生命周期适配层；只保留一个 update 驱动的倒计时。 */
@ccclass('CountdownTimer')
export class CountdownTimer extends Component {
    private readonly _clock = new CountdownClock();
    public get remainingSeconds(): number { return this._clock.remainingSeconds; }
    public startTimer(duration: number, update: CountdownUpdate, elapsed: CountdownElapsed): void {
        this._clock.startTimer(duration, update, elapsed);
    }
    public finishQuickly(seconds: number): void { this._clock.finishQuickly(seconds); }
    public setPaused(paused: boolean): void { this._clock.setPaused(paused); }
    public stopTimer(): void { this._clock.stopTimer(); }
    protected override update(deltaTime: number): void { this._clock.update(deltaTime); }
    protected override onDestroy(): void { this.stopTimer(); }
}
