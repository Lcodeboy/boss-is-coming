// 在可控 Cocos 调度器替身中运行实际 InspectionView，验证两种展示分支和暂停恢复。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const { InspectionSequence } = require('../temp/core-regressions/assets/scripts/core/InspectionSequence.js');

const callbacks = new Map();
let nextId = 0;
class Component {
    uuid = `test-${++nextId}`;
    node = new Node();
    schedule(callback, interval) { callbacks.set(this.uuid, { callback, interval, elapsed: 0, paused: false }); }
    unschedule() { callbacks.delete(this.uuid); }
    unscheduleAllCallbacks() { callbacks.delete(this.uuid); }
}
class Node {
    active = true;
    setPosition() {}
    addComponent(Type) { return new Type(); }
}
class UIOpacity { opacity = 255; }
class Label { node = new Node(); string = ''; color = null; }
const scheduler = {
    pauseTarget(target) { const entry = callbacks.get(target.uuid); if (entry) entry.paused = true; },
    resumeTarget(target) { const entry = callbacks.get(target.uuid); if (entry) entry.paused = false; },
    tick(seconds) {
        for (const entry of Array.from(callbacks.values())) {
            if (entry.paused) continue;
            entry.elapsed += seconds;
            if (entry.elapsed + 1e-8 >= entry.interval) { entry.elapsed -= entry.interval; entry.callback(); }
        }
    },
};
const palette = { success: 'green', warning: 'orange', successPale: 'lightgreen', warningPale: 'lightorange' };
const mocks = {
    cc: { _decorator: { ccclass: () => Type => Type }, Component, Node, UIOpacity, Label,
        director: { getScheduler: () => scheduler }, Tween: { stopAllByTarget() {} },
        tween: () => ({ to() { return this; }, start() { return this; } }) },
    '../core/InspectionSequence': { InspectionSequence },
    './UIFactory': { Palette: palette, createLabel: () => new Label(), createRoundedPanel: () => new Node(), drawRoundedPanel() {} },
};
const source = readFileSync(new URL('../assets/scripts/ui/InspectionView.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
const context = { exports: {}, require: name => { assert(name in mocks, `未声明的组件依赖 ${name}`); return mocks[name]; } };
vm.runInNewContext(compiled, context);
const { InspectionView, INSPECTION_STEP_DURATION_SECONDS: interval } = context.exports;
const view = new InspectionView(); view.initialize();
let rounds = 0;
for (const flags of [[true,false,false,false], [false,true,true,true], [true,true,true,false], [true,true,true,true], [true,false,true,true], [true,true,true,true]]) {
    const seen = [];
    let finished = 0;
    view.play(flags.map((passed, i) => ({ passed, message: `${i}:${passed}` })), () => { finished++; });
    for (let index = 0; index < 4; index++) {
        seen.push(view._progressLabel.string);
        assert.equal(view._messageLabel.string, `${index}:${flags[index]}`);
        assert.equal(view._messageLabel.color, flags[index] ? palette.success : palette.warning);
        scheduler.tick(interval / 2);
        view.setPaused(true); view.setPaused(true); scheduler.tick(90);
        assert.equal(finished, 0, '后台不能结束检查');
        assert.equal(view._progressLabel.string, `检查 ${index + 1}/4`);
        view.setPaused(false); view.setPaused(false);
        scheduler.tick(interval / 2 - .01);
        assert.equal(view._progressLabel.string, `检查 ${index + 1}/4`, '恢复需保留剩余展示时间');
        scheduler.tick(.01);
    }
    assert.deepEqual(seen, ['检查 1/4','检查 2/4','检查 3/4','检查 4/4']);
    scheduler.tick(50); assert.equal(finished, 1); assert.equal(callbacks.size, 0); rounds++;
}
let canceledFinished = 0;
view.play([{passed:false,message:'取消测试'}], () => canceledFinished++);
view.setPaused(true); view.cancel(); view.setPaused(false); scheduler.tick(100);
assert.equal(canceledFinished, 0); assert.equal(callbacks.size, 0);
view.play([{passed:true,message:'销毁测试'}], () => canceledFinished++); view.onDestroy(); scheduler.tick(100);
assert.equal(callbacks.size, 0); assert.equal(canceledFinished, 0);
console.log(`PASS: actual InspectionView ${rounds} mixed rounds, exact pause duration, one exit, cancel/destroy cleanup`);

const { AUDIO_CUES } = require('../temp/core-regressions/assets/scripts/core/AudioCue.js');
const pending = new Map();
const warnings = [];
class AudioSource {
    clip = null;
    playing = false;
    play() { this.playing = true; }
    stop() { this.playing = false; }
    destroy() { this.stop(); }
}
class AudioClip {
    references = 0;
    addRef() { this.references++; }
    decRef() { this.references--; }
}
const providerMocks = {
    cc: { AudioSource, AudioClip, sys: { isBrowser: false }, warn: message => warnings.push(message),
        resources: { load(path, Type, done) { assert.equal(Type, AudioClip); pending.set(path, done); } } },
    '../core/AudioCue': { AUDIO_CUES },
};
const providerSource = readFileSync(new URL('../assets/scripts/game/CocosFeedbackProviders.ts', import.meta.url), 'utf8');
const providerCompiled = ts.transpileModule(providerSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const providerContext = { exports: {}, require: name => { assert(name in providerMocks, `未声明的Provider依赖 ${name}`); return providerMocks[name]; } };
vm.runInNewContext(providerCompiled, providerContext);
const { CocosAudioProvider } = providerContext.exports;
for (const noError of [null, undefined]) {
    pending.clear();
    let audioSources = 0;
    const source = new AudioSource();
    const provider = new CocosAudioProvider({ addComponent(Type) { assert.equal(Type, AudioSource); audioSources++; return source; } });
    provider.load(); provider.load();
    assert.equal(pending.size, 12, '每个资源仅预载一次');
    const clips = [];
    for (const done of pending.values()) { const clip = new AudioClip(); clips.push(clip); done(noError, clip); }
    assert.equal(provider.isReady('button'), false, '手势前不创建音频源');
    provider.unlock(); provider.unlock(); assert.equal(audioSources, 1);
    for (const cue of Object.keys(AUDIO_CUES)) {
        assert.equal(provider.isReady(cue), true, `成功回调 ${String(noError)} 必须接受音效 ${cue}`);
        provider.play(cue, .4); assert.equal(source.playing, true); assert.equal(source.volume, .4);
        provider.stop(); assert.equal(source.playing, false); assert.equal(source.clip, null);
    }
    provider.dispose(); assert(clips.every(clip => clip.references === 0));
}
assert.equal(warnings.length, 0, 'null和undefined成功回调都不能误报音频不可用');
pending.clear();
const lateProvider = new CocosAudioProvider({ addComponent: () => new AudioSource() });
lateProvider.load();
pending.get('audio/button')(new Error('network unavailable'), undefined);
assert.equal(warnings.length, 1, '真实资源错误安全忽略');
lateProvider.dispose(); const lateClip = new AudioClip(); pending.get('audio/success')(undefined, lateClip);
assert.equal(lateClip.references, 0, '销毁后的异步回调不持有资源');
console.log('PASS: actual CocosAudioProvider null/undefined success callbacks, single source, stop/dispose, late-load cleanup');
