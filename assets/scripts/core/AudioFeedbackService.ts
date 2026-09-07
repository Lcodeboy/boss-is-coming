import { AUDIO_CUES, AudioCue } from './AudioCue';

export interface AudioProvider {
    load(): void;
    unlock(): void;
    isReady(cue: AudioCue): boolean;
    play(cue: AudioCue, volume: number): void;
    stop(): void;
    readonly playing: boolean;
    dispose(): void;
}

/** 单通道、无补播队列。暂停/静音会立即停止，加载完成不会补播过期反馈。 */
export class AudioFeedbackService {
    private readonly _lastPlayed = new Map<AudioCue, number>();
    private _enabled = true;
    private _suspended = false;
    private _unlocked = false;
    private _loaded = false;
    private _disposed = false;
    private _priority = 0;
    private _current: AudioCue | null = null;
    private _volume = 0.65;

    public constructor(private readonly _provider: AudioProvider, private readonly _clock: () => number) {}
    public preload(): void {
        if (this._loaded || this._disposed) { return; }
        this._loaded = true;
        this._provider.load();
    }
    public unlock(): void {
        if (this._disposed) { return; }
        this.preload();
        if (!this._unlocked) { this._provider.unlock(); this._unlocked = true; }
    }
    public setEnabled(enabled: boolean): void { this._enabled = enabled; if (!enabled) { this.stop(); } }
    public setVolume(volume: number): void { this._volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.65; }
    public suspend(suspended: boolean): void { this._suspended = suspended; if (suspended) { this.stop(); } }

    public play(cue: AudioCue, strength = 1): boolean {
        if (this._disposed || !this._enabled || this._suspended || !this._unlocked || !this._provider.isReady(cue)) { return false; }
        const spec = AUDIO_CUES[cue];
        const now = this._clock();
        if (now - (this._lastPlayed.get(cue) ?? -Infinity) < spec.interval) { return false; }
        if (this._provider.playing && spec.priority < this._priority) { return false; }
        this._provider.stop();
        this._lastPlayed.set(cue, now);
        this._priority = spec.priority;
        this._current = cue;
        this._provider.play(cue, Math.max(0, Math.min(1, this._volume * strength)));
        return true;
    }

    public stop(cue?: AudioCue): void {
        if (cue !== undefined && cue !== this._current) { return; }
        this._provider.stop();
        this._current = null;
        this._priority = 0;
    }
    public reset(): void { this.stop(); this._lastPlayed.clear(); }
    public dispose(): void { this.reset(); this._disposed = true; this._provider.dispose(); }
}
