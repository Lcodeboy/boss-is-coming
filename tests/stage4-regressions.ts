import { AudioCue, AUDIO_CUES } from '../assets/scripts/core/AudioCue';
import { AudioFeedbackService, AudioProvider } from '../assets/scripts/core/AudioFeedbackService';
import { BossApproachModel, BossStage } from '../assets/scripts/core/BossApproachModel';
import { CountdownClock } from '../assets/scripts/core/CountdownClock';
import { FeedbackDirector } from '../assets/scripts/core/FeedbackDirector';
import { GameLifecycleService, LifecycleProvider, LifecycleSnapshot } from '../assets/scripts/core/GameLifecycleService';
import { GameState, GameStateMachine } from '../assets/scripts/core/GameStateMachine';
import { HapticFeedbackService, HapticProvider } from '../assets/scripts/core/HapticFeedbackService';
import { InspectionSequence } from '../assets/scripts/core/InspectionSequence';
import { ProgressService, ProgressStorage } from '../assets/scripts/core/ProgressService';
import { SETTINGS_STORAGE_KEY, SettingsService } from '../assets/scripts/core/SettingsService';

function assert(condition: boolean, message: string): void { if (!condition) { throw new Error(message); } }
class MemoryStorage implements ProgressStorage {
    public readonly values = new Map<string, string>();
    public getItem(key: string): string | null { return this.values.get(key) ?? null; }
    public setItem(key: string, value: string): void { this.values.set(key, value); }
}
class FakeAudio implements AudioProvider {
    public readonly cues: AudioCue[] = [];
    public readonly volumes: number[] = [];
    public loaded = 0;
    public unlocked = 0;
    public disposed = false;
    public ready = true;
    public playing = false;
    public load(): void { this.loaded++; }
    public unlock(): void { this.unlocked++; }
    public isReady(): boolean { return this.ready; }
    public play(cue: AudioCue, volume: number): void { this.cues.push(cue); this.volumes.push(volume); this.playing = true; }
    public stop(): void { this.playing = false; }
    public dispose(): void { this.disposed = true; }
}
class FakeHaptic implements HapticProvider {
    public readonly patterns: string[] = [];
    public active = false;
    public vibrate(pattern: readonly number[]): void { this.patterns.push(pattern.join(',')); this.active = true; }
    public cancel(): void { this.active = false; }
}
class FakeLifecycle implements LifecycleProvider {
    public readonly listeners = new Set<(hidden: boolean) => void>();
    public subscribe(listener: (hidden: boolean) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    public emit(hidden: boolean): void { this.listeners.forEach((listener) => listener(hidden)); }
}

function audioRegression(): void {
    let time = 0;
    const provider = new FakeAudio();
    const service = new AudioFeedbackService(provider, () => time);
    assert(!service.play('button'), '用户手势前不能播放');
    service.preload(); service.preload(); service.unlock(); service.unlock();
    assert(provider.loaded === 1 && provider.unlocked === 1, '资源和音频源仅初始化一次');
    provider.ready = false;
    assert(!service.play('message'), '未加载音效安全忽略');
    provider.ready = true;
    assert(provider.cues.length === 0, '加载后不补播');
    assert(service.play('target-near'), '首次提示播放');
    assert(!service.play('target-near'), '同一时刻不得重复播放');
    time += .1;
    assert(!service.play('target-near'), '最短间隔内不得播放');
    time += .1;
    assert(service.play('target-near'), '超过间隔可再次提示');
    service.setEnabled(false);
    assert(!provider.playing && !service.play('warning') && !service.play('success'), '关闭音效立即停止警示和结算');
    service.setEnabled(true); service.reset();
    assert(service.play('warning'), '开启后可播放');
    assert(!service.play('button'), '低优先级不打断警示');
    service.suspend(true);
    assert(!provider.playing && !service.play('door'), '后台停止音频并禁止新播放');
    service.suspend(false); service.reset(); service.setVolume(.2);
    service.play('button', 1.1);
    assert(Math.abs(provider.volumes[provider.volumes.length - 1] - .22) < .001, '统一音量缩放');
    service.dispose();
    assert(provider.disposed && !provider.playing && !service.play('button'), '销毁后无残留音频');
}

function settingsRegression(): void {
    const storage = new MemoryStorage();
    const progress = new ProgressService(storage, 5);
    progress.recordResult(1, true);
    for (const invalid of ['{bad', '{}', '[]', 'null', '{"version":2,"soundEnabled":false,"vibrationEnabled":true}', '{"version":1,"soundEnabled":1,"vibrationEnabled":true}']) {
        storage.setItem(SETTINGS_STORAGE_KEY, invalid);
        const settings = new SettingsService(storage);
        assert(settings.snapshot.soundEnabled && settings.snapshot.vibrationEnabled, '损坏设置恢复默认');
        assert(new ProgressService(storage, 5).snapshot.highestUnlockedLevel === 2, '设置恢复不能修改关卡进度');
    }
    const settings = new SettingsService(storage);
    const provider = new FakeAudio();
    const audio = new AudioFeedbackService(provider, () => 0);
    const motor = new FakeHaptic();
    const haptics = new HapticFeedbackService(motor);
    const unsubscribe = settings.subscribe((value) => {
        audio.setEnabled(value.soundEnabled); haptics.setEnabled(value.vibrationEnabled);
    });
    audio.unlock(); audio.play('success'); haptics.play('success');
    settings.setSoundEnabled(false); settings.setVibrationEnabled(false);
    assert(!provider.playing && !motor.active, '开关应同步终止当前反馈');
    haptics.play('item-wrong');
    assert(motor.patterns.length === 1, '关闭后不振动');
    const reloaded = new SettingsService(storage);
    assert(!reloaded.snapshot.soundEnabled && !reloaded.snapshot.vibrationEnabled, '重进设置保留');
    unsubscribe(); audio.dispose();
    const denied = new SettingsService({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    denied.setSoundEnabled(false);
    assert(!denied.snapshot.soundEnabled, '存储不可用时内存设置仍正常');
}

function directorRegression(): void {
    const cues: AudioCue[] = [];
    const beats: number[] = [];
    let stops = 0;
    const director = new FeedbackDirector({ play: (cue) => cues.push(cue), stopWarning: () => { stops++; }, beat: (value) => beats.push(value) });
    const model = new BossApproachModel();
    for (let tick = 300; tick >= 0; tick--) {
        const remaining = tick / 10;
        director.approach(model.calculate(30, remaining, 18).stage, remaining);
    }
    director.message('coffee'); director.message('coffee');
    director.inspection(); director.inspection(); director.result(false); director.result(false); director.result(true);
    const count = (cue: AudioCue): number => cues.filter((entry) => entry === cue).length;
    assert(beats.join(',') === '5,4,3,2,1' && count('warning') === 5, '最后5秒恰好5个节拍');
    assert(count('elevator') === 3, '阶段提示不随楼层/秒重复');
    assert(count('knock') === 1 && count('door') === 1, '敲门开门只一次');
    assert(cues.indexOf('knock') < cues.indexOf('door'), '先敲门再开门');
    assert(count('message') === 1 && count('failure') === 1 && count('success') === 0, '消息和结算去重');
    director.reset(); cues.length = 0; beats.length = 0;
    director.approach(BossStage.CORRIDOR, 5); director.prepared();
    for (let remaining = 4; remaining >= 0; remaining--) { director.approach(BossStage.DOOR, remaining); }
    assert(count('warning') === 1 && stops > 0, '提前完成立即停警示且不再产生节拍');
    director.inspection(); director.result(true); director.result(true);
    assert(count('success') === 1 && count('door') === 1, '快速检查单次开门和成功');
    director.reset(); cues.length = 0; director.inspection();
    assert(cues.join(',') === 'knock,door', '极端丢帧仍有敲门和开门顺序');
    assert(Object.keys(AUDIO_CUES).length === 12, '恰好12种音效');
}

function lifecycleRegression(): void {
    let state = GameState.PLAYING;
    let elapsed = 0;
    const timer = new CountdownClock();
    const provider = new FakeLifecycle();
    let last: LifecycleSnapshot = { hidden: false, paused: false, needsContinue: false };
    let changes = 0;
    const service = new GameLifecycleService(provider, () => state, (snapshot) => {
        last = snapshot; changes++; timer.setPaused(snapshot.paused);
    });
    service.start(); service.start(); service.start();
    assert(provider.listeners.size === 1, '只绑定一个平台监听订阅');
    timer.startTimer(30, () => {}, () => { elapsed++; });
    timer.update(2); provider.emit(true); provider.emit(true); timer.update(90);
    assert(timer.remainingSeconds === 28 && elapsed === 0 && changes === 1, '后台不扣时间、不触发检查、重复hide幂等');
    assert(!service.continuePlaying(), '后台不能点击恢复');
    provider.emit(false); timer.update(60);
    assert(last.needsContinue && timer.remainingSeconds === 28, '返回前台仍暂停直到点击');
    assert(service.continuePlaying() && !service.continuePlaying(), '继续按钮只生效一次');
    timer.update(60); timer.update(1);
    assert(timer.remainingSeconds === 27, '恢复首帧不计入后台delta');
    for (let n = 0; n < 4; n++) { provider.emit(true); provider.emit(false); }
    assert(provider.listeners.size === 1 && service.snapshot.needsContinue, '多次前后台不增监听');
    timer.stopTimer(); state = GameState.READY; service.reset();
    provider.emit(true); provider.emit(false);
    assert(!service.snapshot.needsContinue && !service.snapshot.paused, '教学保留READY，不显示整理遮罩、不启动计时');
    timer.update(100);
    assert(elapsed === 0, '教学时间不启动倒计时');
    for (const nonPlaying of [GameState.HOME, GameState.LEVEL_SELECT, GameState.SUCCESS, GameState.FAILURE, GameState.INSPECTING]) {
        state = nonPlaying; provider.emit(true);
        assert(service.snapshot.paused, `${state}后台暂停展示`);
        provider.emit(false);
        assert(!service.snapshot.paused && !service.snapshot.needsContinue, `${state}前台保持原页面，不出现继续遮罩`);
    }
    state = GameState.PREPARED; timer.startTimer(24, () => {}, () => { elapsed++; }); timer.finishQuickly(1.35);
    provider.emit(true); timer.update(20); provider.emit(false); timer.update(20);
    assert(timer.remainingSeconds === 24, '快速收尾期间暂停保持剩余时间');
    service.continuePlaying(); timer.update(20); timer.update(1.36); timer.update(1);
    assert(elapsed === 1, '恢复快速收尾仅触发一次检查');
    service.dispose(); assert(provider.listeners.size === 0, '销毁卸载全部订阅');
}

function threeRounds(): void {
    const machine = new GameStateMachine();
    const platform = new FakeLifecycle();
    const audioProvider = new FakeAudio();
    const motor = new FakeHaptic();
    const audio = new AudioFeedbackService(audioProvider, () => Date.now() / 1000);
    const haptics = new HapticFeedbackService(motor);
    const clock = new CountdownClock();
    const inspection = new InspectionSequence();
    const approach = new BossApproachModel();
    const director = new FeedbackDirector({ play: (cue) => { audio.play(cue); haptics.play(cue); }, stopWarning: () => audio.stop('warning'), beat: () => {} });
    const lifecycle = new GameLifecycleService(platform, () => machine.state, (snapshot) => {
        audio.suspend(snapshot.paused); haptics.suspend(snapshot.paused); clock.setPaused(snapshot.paused);
    });
    lifecycle.start(); audio.unlock();
    machine.transition(GameState.LEVEL_SELECT); machine.transition(GameState.READY);
    let settlements = 0;
    for (const success of [true, false, true]) {
        director.reset(); audio.reset(); haptics.stop(); lifecycle.reset();
        machine.transition(GameState.PLAYING);
        let inspected = 0;
        clock.startTimer(30, (remaining) => director.approach(approach.calculate(30, remaining, 18).stage, remaining), () => {
            machine.transition(GameState.INSPECTING); director.inspection(); inspection.start(4);
        });
        platform.emit(true); clock.update(80); platform.emit(false); clock.update(40); lifecycle.continuePlaying(); clock.update(40);
        if (success) { machine.transition(GameState.PREPARED); director.prepared(); clock.finishQuickly(1.35); }
        for (let step = 0; step < 320; step++) { audioProvider.playing = false; clock.update(.1); }
        assert(machine.state === GameState.INSPECTING, '每轮进入检查');
        platform.emit(true);
        assert(lifecycle.snapshot.paused && !audioProvider.playing && !motor.active, '检查后台时无音效振动');
        // 检查视图仅在非paused时推进，顺序模型继续复用既有单出口。
        if (!lifecycle.snapshot.paused) { inspection.advance(); inspected++; }
        assert(inspected === 0, '后台不推进检查项');
        platform.emit(false);
        for (let index = 0; index < 4; index++) { inspection.advance(); inspected++; }
        machine.transition(success ? GameState.SUCCESS : GameState.FAILURE);
        director.result(success); director.result(success); settlements++;
        assert(inspected === 4, '每轮完整检查4项');
        machine.transition(GameState.READY);
        audio.reset(); haptics.stop(); clock.stopTimer(); director.reset(); lifecycle.reset();
        assert(!audioProvider.playing && !motor.active && !lifecycle.snapshot.paused, '重试无音频/暂停残留');
    }
    assert(settlements === 3 && platform.listeners.size === 1, '成功失败成功三轮仅各结算一次且监听未增加');
    assert(audioProvider.cues.filter((cue) => cue === 'success').length === 2 && audioProvider.cues.filter((cue) => cue === 'failure').length === 1, '结果音各轮单次');
    lifecycle.dispose(); audio.dispose(); haptics.stop();
}

audioRegression(); settingsRegression(); directorRegression(); lifecycleRegression(); threeRounds();
console.log('PASS: 12 cues, throttling/mute, deterministic beats, settings recovery, background/continue, teaching/inspection/results, three retries');
