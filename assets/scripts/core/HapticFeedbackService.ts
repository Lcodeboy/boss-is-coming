import { AudioCue } from './AudioCue';

export interface HapticProvider { vibrate(pattern: readonly number[]): void; cancel(): void; }
const PATTERNS: Partial<Record<AudioCue, readonly number[]>> = {
    'item-correct': [14], 'item-wrong': [32], warning: [10], door: [40],
    success: [15, 45, 15], failure: [38, 35, 22],
};

export class HapticFeedbackService {
    private _enabled = true;
    private _suspended = false;
    private _current: AudioCue | null = null;
    public constructor(private readonly _provider: HapticProvider) {}
    public setEnabled(enabled: boolean): void { this._enabled = enabled; if (!enabled) { this.stop(); } }
    public suspend(suspended: boolean): void { this._suspended = suspended; if (suspended) { this.stop(); } }
    public play(cue: AudioCue): void {
        const pattern = PATTERNS[cue];
        if (this._enabled && !this._suspended && pattern !== undefined) {
            this._current = cue;
            this._provider.vibrate(pattern);
        }
    }
    public stop(cue?: AudioCue): void {
        if (cue !== undefined && cue !== this._current) { return; }
        this._current = null;
        this._provider.cancel();
    }
}
