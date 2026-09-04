export enum GameState {
    READY = 'READY',
    PLAYING = 'PLAYING',
    PREPARED = 'PREPARED',
    INSPECTING = 'INSPECTING',
    SUCCESS = 'SUCCESS',
    FAILURE = 'FAILURE',
}

export type StateChangeListener = (next: GameState, previous: GameState) => void;

const ALLOWED_TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
    [GameState.READY]: [GameState.PLAYING],
    [GameState.PLAYING]: [GameState.PREPARED, GameState.INSPECTING],
    [GameState.PREPARED]: [GameState.INSPECTING],
    [GameState.INSPECTING]: [GameState.SUCCESS, GameState.FAILURE],
    [GameState.SUCCESS]: [GameState.READY],
    [GameState.FAILURE]: [GameState.READY],
};

/** 唯一的流程状态入口；非法或重复转换会被拒绝。 */
export class GameStateMachine {
    private _state = GameState.READY;
    private _listener: StateChangeListener | null = null;

    public get state(): GameState {
        return this._state;
    }

    public setListener(listener: StateChangeListener | null): void {
        this._listener = listener;
    }

    public transition(next: GameState): boolean {
        if (next === this._state || ALLOWED_TRANSITIONS[this._state].indexOf(next) < 0) {
            return false;
        }

        const previous = this._state;
        this._state = next;
        this._listener?.(next, previous);
        return true;
    }
}
