export type InspectionSequenceEvent =
    | { readonly kind: 'step'; readonly index: number }
    | { readonly kind: 'completed' }
    | { readonly kind: 'idle' };

/**
 * 逐项检查的纯状态序列。完成事件只产生一次，UI 调度和结算逻辑不互相依赖。
 */
export class InspectionSequence {
    private _stepCount = 0;
    private _currentIndex = -1;
    private _active = false;

    public start(stepCount: number): InspectionSequenceEvent {
        if (!Number.isInteger(stepCount) || stepCount < 0) {
            throw new Error('检查项数量必须是非负整数');
        }

        this._stepCount = stepCount;
        this._currentIndex = stepCount > 0 ? 0 : -1;
        this._active = stepCount > 0;
        return this._active ? { kind: 'step', index: 0 } : { kind: 'completed' };
    }

    public advance(): InspectionSequenceEvent {
        if (!this._active) {
            return { kind: 'idle' };
        }

        const nextIndex = this._currentIndex + 1;
        if (nextIndex >= this._stepCount) {
            this._active = false;
            return { kind: 'completed' };
        }

        this._currentIndex = nextIndex;
        return { kind: 'step', index: nextIndex };
    }

    public cancel(): void {
        this._stepCount = 0;
        this._currentIndex = -1;
        this._active = false;
    }
}
