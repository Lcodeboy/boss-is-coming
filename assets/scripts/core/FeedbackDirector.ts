import { AudioCue } from './AudioCue';
import { BossStage } from './BossApproachModel';

export interface FeedbackSink {
    play(cue: AudioCue, strength?: number): void;
    stopWarning(): void;
    beat(remaining: number): void;
}

/** 消息、阶段、节拍、结算的幂等边界与业务判定分离。 */
export class FeedbackDirector {
    private readonly _seen = new Set<string>();
    private _prepared = false;
    private _settled = false;
    private _inspecting = false;
    public constructor(private readonly _sink: FeedbackSink) {}
    public reset(): void { this._seen.clear(); this._prepared = false; this._settled = false; this._inspecting = false; this._sink.stopWarning(); }
    public message(id: string): void { this.once(`message:${id}`, 'message'); }
    public prepared(): void { this._prepared = true; this._sink.stopWarning(); }
    public approach(stage: BossStage, remaining: number): void {
        if (this._settled || this._inspecting) { return; }
        // 最后一次敲门与开门分开；快速收尾仍经过同一固定阶段。
        if (stage === BossStage.DOOR && (remaining <= 0.6 || this._prepared)) { this.once('knock', 'knock'); }
        else if (stage !== BossStage.GARAGE && stage !== BossStage.INSPECTION && stage !== BossStage.DOOR) { this.once(`stage:${stage}`, 'elevator'); }
        if (this._prepared || remaining <= 0 || remaining > 5) { return; }
        const beat = Math.ceil(remaining);
        const key = `beat:${beat}`;
        if (this._seen.has(key)) { return; }
        this._seen.add(key);
        // 不追补丢帧期间的节拍，避免恢复后集中叠音。
        this._sink.play('warning', beat <= 3 ? 1.12 : 1);
        this._sink.beat(beat);
    }
    public inspection(): void {
        if (this._inspecting) { return; }
        this._inspecting = true;
        this._sink.stopWarning();
        // 极端丢帧跳过门口时仍先敲门；适配层只延迟声音，不改变检查时序。
        this.once('knock', 'knock');
        this.once('door', 'door');
    }
    public result(success: boolean): void {
        if (this._settled) { return; }
        this._settled = true;
        this._sink.stopWarning();
        this._sink.play(success ? 'success' : 'failure');
    }
    private once(key: string, cue: AudioCue): void {
        if (this._seen.has(key)) { return; }
        this._seen.add(key);
        this._sink.play(cue);
    }
}
