import { _decorator, Component, sys } from 'cc';
import { CocosAudioProvider, prefersReducedMotion, WebHapticProvider } from '../game/CocosFeedbackProviders';
import { AudioCue } from './AudioCue';
import { AudioFeedbackService } from './AudioFeedbackService';
import { BossStage } from './BossApproachModel';
import { FeedbackDirector } from './FeedbackDirector';
import { HapticFeedbackService, HapticProvider } from './HapticFeedbackService';
import { SettingsService } from './SettingsService';

const { ccclass } = _decorator;

export type { AudioCue } from './AudioCue';

/** 场景内唯一反馈入口，视图只报告语义事件，不持有播放器或平台 API。 */
@ccclass('AudioFeedback')
export class AudioFeedback extends Component {
    private _audio: AudioFeedbackService | null = null;
    private _haptics: HapticFeedbackService | null = null;
    private _director: FeedbackDirector | null = null;
    private _unsubscribe: (() => void) | null = null;
    private _settings: SettingsService | null = null;
    private _suspended = false;
    private _disposed = false;
    private _lastKnockTime = -Infinity;
    public onBeat: ((seconds: number) => void) | null = null;
    public get reducedMotion(): boolean { return prefersReducedMotion(); }
    public get inputBlocked(): boolean { return this._suspended; }
    public get settings(): SettingsService {
        if (this._settings === null) { throw new Error('设置服务尚未初始化'); }
        return this._settings;
    }
    protected override onLoad(): void {
        this._settings = new SettingsService(sys.localStorage);
        this._audio = new AudioFeedbackService(new CocosAudioProvider(this.node), () => Date.now() / 1000);
        this._haptics = new HapticFeedbackService(new WebHapticProvider());
        this._director = new FeedbackDirector({
            play: (cue, strength) => this.play(cue, strength),
            stopWarning: () => { this._audio?.stop('warning'); this._haptics?.stop('warning'); },
            beat: (seconds) => {
                if (seconds <= 3) { this._haptics?.play('warning'); }
                this.onBeat?.(seconds);
            },
        });
        this._unsubscribe = this.settings.subscribe((settings) => {
            this._audio?.setEnabled(settings.soundEnabled);
            this._haptics?.setEnabled(settings.vibrationEnabled);
        });
        // 只预载资源；AudioSource 与首次播放均由“开始挑战”用户手势触发。
        this._audio.preload();
    }
    public unlock(): void { this._audio?.unlock(); }
    public play(cue: AudioCue, strength = 1): void {
        if (this._suspended || this._disposed) { return; }
        if (cue === 'knock') { this._lastKnockTime = Date.now() / 1000; }
        if (cue === 'door') {
            const gap = Date.now() / 1000 - this._lastKnockTime;
            if (gap < 0.23) {
                this.unschedule(this.playDoor);
                this.scheduleOnce(this.playDoor, 0.23 - gap);
                return;
            }
        }
        this._audio?.play(cue, strength);
        if (cue !== 'warning') { this._haptics?.play(cue); }
    }
    public setHapticProvider(provider: HapticProvider): void {
        this._haptics?.stop();
        this._haptics = new HapticFeedbackService(provider);
        this._haptics.setEnabled(this.settings.snapshot.vibrationEnabled);
        this._haptics.suspend(this._suspended);
    }
    public approach(stage: BossStage, remaining: number): void { if (!this._suspended) { this._director?.approach(stage, remaining); } }
    public message(id: string): void { this._director?.message(id); }
    public prepared(): void { this._director?.prepared(); }
    public inspection(): void { this._director?.inspection(); }
    public result(success: boolean): void { this._director?.result(success); }
    public suspend(suspended: boolean): void {
        if (suspended) { this.unschedule(this.playDoor); }
        this._suspended = suspended;
        this._audio?.suspend(suspended);
        this._haptics?.suspend(suspended);
    }
    public resetRound(): void {
        this.unschedule(this.playDoor);
        this._lastKnockTime = -Infinity;
        this._audio?.reset();
        this._haptics?.stop();
        this._director?.reset();
    }
    protected override onDestroy(): void {
        this.unscheduleAllCallbacks();
        this._disposed = true;
        this._unsubscribe?.();
        this._unsubscribe = null;
        this.onBeat = null;
        this._audio?.dispose();
        this._haptics?.stop();
    }
    private readonly playDoor = (): void => {
        if (this._suspended || this._disposed) { return; }
        this._audio?.play('door');
        this._haptics?.play('door');
    };
}
