// 在可控 Cocos 调度器替身中运行实际 InspectionView，验证两种展示分支和暂停恢复。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const inspectionAnimation = require('../temp/core-regressions/assets/scripts/core/InspectionAnimation.js');

const callbacks = [];
const pausedTargets = new Set();
let reducedMotion = false;
let nextId = 0;
class Component {
    uuid = `test-${++nextId}`;
    node = new Node();
    scheduleOnce(callback, delay) { callbacks.push({ target: this.uuid, callback, remaining: delay }); }
    unscheduleAllCallbacks() {
        for (let index = callbacks.length - 1; index >= 0; index--) if (callbacks[index].target === this.uuid) callbacks.splice(index, 1);
    }
}
class Node {
    active = true;
    scale = null;
    setPosition() {}
    setScale(...value) { this.scale = value; }
    addComponent(Type) { return new Type(); }
}
class UIOpacity { opacity = 255; }
class Label { node = new Node(); string = ''; color = null; }
class BossInspectionActor {
    initialize(layout) { this.layout = layout; }
    play(passed, reduced, timeline) { this.request = { passed, reduced, timeline }; }
    playResultReaction(passed, reduced) { this.resultRequest = { passed, reduced }; }
    reset() { this.resets = (this.resets ?? 0) + 1; }
    setPaused(paused) { this.paused = paused; }
}
const scheduler = {
    pauseTarget(target) { pausedTargets.add(target.uuid); },
    resumeTarget(target) { pausedTargets.delete(target.uuid); },
    tick(seconds) {
        const due = [];
        for (const entry of callbacks) {
            if (!pausedTargets.has(entry.target)) entry.remaining -= seconds;
            if (entry.remaining <= 1e-8) due.push(entry);
        }
        for (const entry of due) { const index = callbacks.indexOf(entry); if (index >= 0) callbacks.splice(index, 1); entry.callback(); }
    },
};
const palette = { transparent:'transparent', overlay:'overlay', hudPanel:'hud', hudStroke:'stroke', blue:'blue', white:'white', mutedLight:'muted', success:'green', warning:'red', successPale:'lightgreen', warningPale:'lightred' };
const mocks = {
    cc: { _decorator: { ccclass: () => Type => Type }, Component, Node, UIOpacity, Label,
        Vec3: class Vec3 { static ONE = new this(1,1,1); constructor(x,y,z){this.x=x;this.y=y;this.z=z;} },
        director: { getScheduler: () => scheduler }, Tween: { stopAllByTarget() {}, pauseAllByTarget() {}, resumeAllByTarget() {} },
        tween: () => ({ to() { return this; }, delay() { return this; }, start() { return this; } }) },
    '../core/InspectionAnimation': inspectionAnimation,
    '../core/ViewportLayout': {},
    '../game/CocosFeedbackProviders': { prefersReducedMotion: () => reducedMotion },
    './BossInspectionActor': { BossInspectionActor },
    './UIFactory': {
        Palette: palette,
        createLabel: () => new Label(),
        createRoundedPanel: () => new Node(),
        createUiNode: () => new Node(),
        drawRoundedPanel() {},
    },
};
const source = readFileSync(new URL('../assets/scripts/ui/InspectionView.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
const context = { exports: {}, require: name => { assert(name in mocks, `未声明的组件依赖 ${name}`); return mocks[name]; } };
vm.runInNewContext(compiled, context);
const { InspectionView } = context.exports;
const viewport = { width:750, height:1666, safeTop:800, safeBottom:-800, safeHeight:1600 };
const view = new InspectionView(); view.initialize(viewport);
let rounds = 0;
for (const flags of [[true,false,false,false], [false,true,true,true], [true,true,true,false], [true,true,true,true], [true,false,true,true], [true,true,true,true]]) {
    let finished = 0;
    view.play(flags.map((passed, i) => ({ passed, message: `${i}:${passed}` })), () => { finished++; });
    assert.equal(view._progressLabel.string, '检查 0/4');
    scheduler.tick(.75);
    assert.match(view._progressLabel.string, /^检查 [1-4]\/4$/);
    view.setPaused(true); view.setPaused(true); const frozen = view._progressLabel.string; scheduler.tick(90);
    assert.equal(finished, 0, '后台不能结束检查'); assert.equal(view._progressLabel.string, frozen);
    view.setPaused(false); view.setPaused(false); scheduler.tick(3);
    assert.equal(finished, 1); scheduler.tick(50); assert.equal(finished, 1); assert.equal(callbacks.length, 0); rounds++;
}
let canceledFinished = 0;
view.play([{passed:false,message:'取消测试'}], () => canceledFinished++);
view.setPaused(true); view.cancel(); view.setPaused(false); scheduler.tick(100);
assert.equal(canceledFinished, 0); assert.equal(callbacks.length, 0);
view.play([{passed:true,message:'销毁测试'}], () => canceledFinished++); view.onDestroy(); scheduler.tick(100);
assert.equal(callbacks.length, 0); assert.equal(canceledFinished, 0);
reducedMotion = true; const reduced = new InspectionView(); reduced.initialize(viewport); let reducedFinished = 0;
reduced.play(Array.from({length:40}, (_,i) => ({passed:true,message:String(i)})), () => reducedFinished++);
assert.equal(reduced._bossActor.request.reduced, true); assert(callbacks.length <= 14, '大量项目不得创建无限回调');
scheduler.tick(2.55); assert.equal(reducedFinished, 1); assert.equal(callbacks.length, 0);
console.log(`PASS: actual InspectionView ${rounds} mixed rounds, fixed duration, pause, one exit, reduced motion and cleanup`);

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

const gameViewSource = readFileSync(new URL('../assets/scripts/ui/GameView.ts', import.meta.url), 'utf8');
assert.match(gameViewSource, /'GameBackButton'/, '游戏进行页必须使用紧凑返回箭头按钮');
assert.doesNotMatch(gameViewSource, /'AbortButton'/, '游戏进行页不得保留大型退出文字按钮');
assert.match(
    gameViewSource,
    /createUiNode\(\s*this\._gameLayer,\s*'Workspace'/s,
    'Workspace 外层必须是透明定位节点，不得恢复成巨大圆角卡片',
);
assert.match(
    gameViewSource,
    /'WorkspaceContent'[\s\S]*WORKSPACE_BASE_CONTENT_HEIGHT[\s\S]*'WorkspaceBottomContent'[\s\S]*WORKSPACE_BASE_CONTENT_HEIGHT/,
    '工位顶部和底部交互内容必须继续使用原基准局部坐标容器',
);
console.log('PASS: game top navigation and borderless workspace source regressions');

const bossActorSource = readFileSync(new URL('../assets/scripts/ui/BossInspectionActor.ts', import.meta.url), 'utf8');
assert.match(
    bossActorSource,
    /boss-inspector-head\/spriteFrame[\s\S]*boss-inspector-body\/spriteFrame/,
    '检查动画必须加载从正式Boss确定性拆出的头身资源',
);
assert.match(bossActorSource, /\.trim\s*=\s*false/, 'Boss Sprite 必须按原始画布比例显示，不使用裁边拉伸');
assert.doesNotMatch(
    bossActorSource,
    /TOUCH_START|TOUCH_END|TOUCH_MOVE|BlockInputEvents/,
    'Boss 装饰节点不得注册或阻挡触摸',
);
assert.match(bossActorSource, /request\.reducedMotion/, 'Boss 动画必须支持减少动态效果');
assert.match(bossActorSource, /createUiNode\(this\.node,'Body'/, 'BossRoot必须包含Body节点');
assert.match(bossActorSource, /createUiNode\(this\.node,'Head'/, 'BossRoot必须包含Head节点');
assert.match(bossActorSource, /setAnchorPoint\(\.5,HEAD_NECK_ANCHOR_Y\)/, '头部旋转中心必须位于颈部');
assert.match(bossActorSource, /if\(request\.reducedMotion\).*return;/s, '减少动态效果不得创建头部反应Tween');
assert.match(source, /prefersReducedMotion\(\)/, '检查视图必须读取系统减少动态效果偏好');
assert.doesNotMatch(source, /step\.message/, '检查阶段不得逐项长时间展示文字');
execFileSync(process.execPath, [new URL('../tools/split-boss-inspector.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' });
console.log('PASS: boss inspection actor asset, motion and non-interactive source regressions');
