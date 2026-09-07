import { GameState } from './GameStateMachine';

export interface LifecycleProvider {
    subscribe(listener: (hidden: boolean) => void): () => void;
}
export interface LifecycleSnapshot {
    readonly hidden: boolean;
    readonly paused: boolean;
    readonly needsContinue: boolean;
}

/** 暂停是正交状态，不新增业务状态或触发任务/结算转换。 */
export class GameLifecycleService {
    private _hidden = false;
    private _needsContinue = false;
    private _unsubscribe: (() => void) | null = null;
    public constructor(
        private readonly _provider: LifecycleProvider,
        private readonly _state: () => GameState,
        private readonly _onChange: (snapshot: LifecycleSnapshot) => void,
    ) {}
    public get snapshot(): LifecycleSnapshot {
        return { hidden: this._hidden, paused: this._hidden || this._needsContinue, needsContinue: this._needsContinue };
    }
    public start(): void {
        if (this._unsubscribe !== null) { return; }
        this._unsubscribe = this._provider.subscribe((hidden) => this.setHidden(hidden));
    }
    public continuePlaying(): boolean {
        if (this._hidden || !this._needsContinue) { return false; }
        this._needsContinue = false;
        this._onChange(this.snapshot);
        return true;
    }
    public reset(): void { this._needsContinue = false; this._onChange(this.snapshot); }
    public dispose(): void { this._unsubscribe?.(); this._unsubscribe = null; this._needsContinue = false; }
    private setHidden(hidden: boolean): void {
        if (hidden === this._hidden) { return; }
        this._hidden = hidden;
        const state = this._state();
        if (hidden && (state === GameState.PLAYING || state === GameState.PREPARED)) { this._needsContinue = true; }
        this._onChange(this.snapshot);
    }
}
