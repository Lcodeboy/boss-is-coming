import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

export type AudioCue = 'button' | 'item-picked' | 'item-correct' | 'item-wrong' | 'warning' | 'result';
export type AudioCuePlayer = (cue: AudioCue) => void;

/** 首版不携带虚假音频；正式音效接入时只需注入播放器。 */
@ccclass('AudioFeedback')
export class AudioFeedback extends Component {
    private _player: AudioCuePlayer | null = null;

    public setPlayer(player: AudioCuePlayer | null): void {
        this._player = player;
    }

    public play(cue: AudioCue): void {
        this._player?.(cue);
    }

    protected override onDestroy(): void {
        this._player = null;
    }
}
