import { AudioClip, AudioSource, Game, game, Node, resources, sys, warn } from 'cc';
import { AUDIO_CUES, AudioCue } from '../core/AudioCue';
import { AudioProvider } from '../core/AudioFeedbackService';
import { LifecycleProvider } from '../core/GameLifecycleService';
import { HapticProvider } from '../core/HapticFeedbackService';

/** 单一 AudioSource 使用可停止的 play，静音时同时清除延迟播放操作。 */
export class CocosAudioProvider implements AudioProvider {
    private readonly _clips = new Map<AudioCue, AudioClip>();
    private _source: AudioSource | null = null;
    private _disposed = false;
    private _loaded = false;
    public constructor(private readonly _node: Node) {}
    public get playing(): boolean { return this._source?.playing ?? false; }
    public load(): void {
        if (this._loaded || this._disposed) { return; }
        this._loaded = true;
        for (const cue of Object.keys(AUDIO_CUES) as AudioCue[]) {
            resources.load(`audio/${cue}`, AudioClip, (loadError, clip) => {
                if (this._disposed) { return; }
                // 引擎完成回调的成功值可能为 undefined，不能仅与 null 比较。
                if (loadError) { warn(`音效不可用，已安全忽略：${cue}`); return; }
                clip.addRef();
                this._clips.set(cue, clip);
            });
        }
    }
    public unlock(): void {
        if (this._source !== null || this._disposed) { return; }
        this._source = this._node.addComponent(AudioSource);
        this._source.playOnAwake = false;
        this._source.loop = false;
    }
    public isReady(cue: AudioCue): boolean { return this._source !== null && this._clips.has(cue); }
    public play(cue: AudioCue, volume: number): void {
        const clip = this._clips.get(cue);
        if (clip === undefined || this._source === null || this._disposed) { return; }
        this._source.clip = clip;
        this._source.volume = volume;
        this._source.play();
    }
    public stop(): void {
        this._source?.stop();
        if (this._source !== null) { this._source.clip = null; }
    }
    public dispose(): void {
        this._disposed = true;
        this.stop();
        this._source?.destroy();
        this._source = null;
        this._clips.forEach((clip) => clip.decRef());
        this._clips.clear();
    }
}

/** 小游戏平台默认无操作，后续通过 HapticProvider 注入平台能力。 */
export class WebHapticProvider implements HapticProvider {
    public vibrate(pattern: readonly number[]): void {
        if (!sys.isBrowser || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') { return; }
        try { navigator.vibrate(Array.from(pattern)); }
        catch { /* 平台拒绝振动时按不支持处理。 */ }
    }
    public cancel(): void { this.vibrate([0]); }
}

/** Cocos 事件覆盖小游戏；Web 额外覆盖失焦和可见性，所有监听成对卸载。 */
export class CocosLifecycleProvider implements LifecycleProvider {
    public subscribe(listener: (hidden: boolean) => void): () => void {
        let engineHidden = false;
        let blurred = false;
        const browser = sys.isBrowser && typeof window !== 'undefined' && typeof document !== 'undefined';
        const emit = (): void => listener(engineHidden || (browser && (document.hidden || blurred)));
        const hide = (): void => { engineHidden = true; emit(); };
        const show = (): void => { engineHidden = false; emit(); };
        const blur = (): void => { blurred = true; emit(); };
        const focus = (): void => { blurred = false; emit(); };
        const visibility = (): void => {
            if (!document.hidden && document.hasFocus()) { blurred = false; }
            emit();
        };
        game.on(Game.EVENT_HIDE, hide);
        game.on(Game.EVENT_SHOW, show);
        if (browser) {
            window.addEventListener('blur', blur);
            window.addEventListener('focus', focus);
            document.addEventListener('visibilitychange', visibility);
            blurred = !document.hasFocus();
        }
        emit();
        return () => {
            game.off(Game.EVENT_HIDE, hide);
            game.off(Game.EVENT_SHOW, show);
            if (browser) {
                window.removeEventListener('blur', blur);
                window.removeEventListener('focus', focus);
                document.removeEventListener('visibilitychange', visibility);
            }
        };
    }
}

export function prefersReducedMotion(): boolean {
    return sys.isBrowser && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
