// 在可控 Cocos 调度器替身中运行实际 InspectionView，验证两种展示分支和暂停恢复。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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
    play(reduced) {
        this.generation = (this.generation ?? 0) + 1;
        this.request = { reduced };
        this.poseRequests = [];
        this.finalPoseCalls = 0;
        return this.generation;
    }
    transitionPoseWithoutGhost(pose, durationSeconds, transitionStyle, generation) {
        this.poseRequests.push({ pose, durationSeconds, transitionStyle, generation });
    }
    playResultReaction(passed, reduced, generation) {
        this.resultRequest = { passed, reduced, generation };
        this.resultCalls = (this.resultCalls ?? 0) + 1;
    }
    showFinalPose(generation) { this.finalPoseGeneration = generation; this.finalPoseCalls++; }
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
    assert.deepEqual(
        view._bossActor.poseRequests.map(request => request.pose),
        ['check'],
        '0.58秒必须开始切换到普通检查姿势',
    );
    view.setPaused(true); view.setPaused(true); const frozen = view._progressLabel.string; scheduler.tick(90);
    assert.equal(finished, 0, '后台不能结束检查'); assert.equal(view._progressLabel.string, frozen);
    view.setPaused(false); view.setPaused(false); scheduler.tick(1.18);
    const passed = flags.every(Boolean);
    assert.equal(view._bossActor.resultRequest.passed, passed, '头部反应必须匹配汇总结果');
    assert.equal(view._bossActor.resultRequest.reduced, false);
    assert.equal(view._bossActor.resultRequest.generation, view._bossActor.generation, '结果回调必须校验本轮generation token');
    assert.equal(view._bossActor.resultCalls, rounds + 1, '每轮结果反应只能触发一次');
    assert.deepEqual(
        view._bossActor.poseRequests.map(({ pose, durationSeconds, transitionStyle }) => ({ pose, durationSeconds, transitionStyle })),
        inspectionAnimation.INSPECTION_NORMAL_POSE_UPDATES.map(({ pose, durationSeconds, transitionStyle }) => ({ pose, durationSeconds, transitionStyle })),
        '正常检查必须严格按check→magnifier→check→neutral切换',
    );
    assert.match(view._feedbackLabel.string, passed ? /✓\s+全部合格/ : /^×\s+\d:false$/, '结果反馈必须同步显示勾或现有问题提示');
    scheduler.tick(1);
    assert.equal(view._bossActor.finalPoseCalls, 1, '2.52秒最终pass/fail姿势只允许切换一次');
    assert.equal(view._bossActor.finalPoseGeneration, view._bossActor.generation, '最终姿势必须使用本轮generation token');
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
scheduler.tick(1.68);
assert.deepEqual(reduced._bossActor.poseRequests, [], '减少动态效果必须跳过magnifier等快速姿势调度');
assert.equal(reduced._feedbackOpacity.opacity, 255, '减少动态效果必须直接显示结果反馈');
assert.match(reduced._feedbackLabel.string, /✓\s+全部合格/);
scheduler.tick(.87); assert.equal(reducedFinished, 1); assert.equal(callbacks.length, 0);
console.log(`PASS: actual InspectionView ${rounds} mixed rounds, fixed duration, pause, one exit, reduced motion and cleanup`);

// 运行实际 ResultView，验证遮罩保持不动、卡片平滑入场以及减少动态分支。
let resultReducedMotion = false;
const resultTweenRecords = [];
const activeResultTweens = new Set();
class ResultVec3 {
    static ONE = new ResultVec3(1, 1, 1);
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
}
class ResultNode {
    constructor(name = '') { this.name = name; }
    active = true;
    position = new ResultVec3();
    scale = ResultVec3.ONE;
    setPosition(x, y = 0, z = 0) { this.position = typeof x === 'object' ? x : new ResultVec3(x, y, z); }
    setScale(x, y = x, z = 1) { this.scale = typeof x === 'object' ? x : new ResultVec3(x, y, z); }
    addComponent(Type) { const value = new Type(); value.node = this; return value; }
}
class ResultComponent { node = new ResultNode('ResultOverlay'); }
class ResultLabel { node = new ResultNode(); string = ''; color = null; }
class ResultOpacity { opacity = 255; }
class ResultTween {
    static stopAllByTarget(target) {
        for (const running of [...activeResultTweens]) {
            if (running.target === target) activeResultTweens.delete(running);
        }
    }
    constructor(target) { this.target = target; this.steps = []; }
    to(seconds, properties, options = {}) { this.steps.push({ seconds, properties, options }); return this; }
    start() {
        resultTweenRecords.push(this);
        activeResultTweens.add(this);
        for (const step of this.steps) Object.assign(this.target, step.properties);
        return this;
    }
}
class ResultActionButton {
    configure(action) { this.action = action; }
    setInteractable(enabled) { this.enabled = enabled; }
}
const resultPalette = {
    blue: 'blue', blueGray: 'blueGray', blueGrayDark: 'blueGrayDark', ink: 'ink', paleBlue: 'paleBlue',
    success: 'green', warning: 'red', white: 'white',
};
const resultVisualMetrics = require('../temp/core-regressions/assets/scripts/ui/VisualMetrics.js').RESULT_VISUAL_METRICS;
const resultMocks = {
    cc: {
        _decorator: { ccclass: () => Type => Type },
        Component: ResultComponent,
        Label: ResultLabel,
        Node: ResultNode,
        Tween: ResultTween,
        tween: target => new ResultTween(target),
        UIOpacity: ResultOpacity,
        Vec3: ResultVec3,
    },
    '../core/InspectionAnimation': inspectionAnimation,
    '../core/ViewportLayout': { calculateSafeModalLayout: () => ({ centerY: 0 }) },
    '../game/CocosFeedbackProviders': { prefersReducedMotion: () => resultReducedMotion },
    './ActionButton': { ActionButton: ResultActionButton },
    './UIFactory': {
        Palette: resultPalette,
        createLabel: () => new ResultLabel(),
        createRoundedPanel: (_parent, name) => new ResultNode(name),
        drawRoundedPanel() {},
    },
    './VisualFactory': {
        createModalCard: (_parent, name) => new ResultNode(name),
        createThemedButton: (_parent, name, text) => ({
            node: new ResultNode(name),
            label: Object.assign(new ResultLabel(), { string: text }),
            button: new ResultActionButton(),
        }),
        paintButton() {},
        paintModalCard() {},
    },
    './VisualMetrics': { RESULT_VISUAL_METRICS: resultVisualMetrics },
};
const resultSource = readFileSync(new URL('../assets/scripts/ui/ResultView.ts', import.meta.url), 'utf8');
const resultCompiled = ts.transpileModule(resultSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
}).outputText;
const resultContext = { exports: {}, require: name => { assert(name in resultMocks, `未声明的ResultView依赖 ${name}`); return resultMocks[name]; } };
vm.runInNewContext(resultCompiled, resultContext);
const { ResultView } = resultContext.exports;
const resultView = new ResultView();
resultView.initialize(viewport, { onRetry() {}, onNextLevel() {}, onReturnToLevels() {} });
const resultPresentation = {
    success: true, completedCount: 4, totalCount: 4, remainingSeconds: 5, evaluation: '全部合格', hasNextLevel: true,
};
resultView.show(resultPresentation);
const normalResultTweens = resultTweenRecords.splice(0);
assert.equal(normalResultTweens.length, 2, '正常模式结算只允许卡片透明度和缩放两个Tween');
assert(normalResultTweens.every(record => record.target !== resultView.node), '结算遮罩不得参与入场Tween，避免亮度闪烁');
assert.equal(normalResultTweens.find(record => record.target === resultView._cardOpacity).steps[0].seconds, .18, '结算卡片必须淡入180ms');
assert.equal(normalResultTweens.find(record => record.target === resultView._card).steps[0].properties.scale.x, 1, '结算卡片必须从0.96平滑恢复到1');
resultView.setPaused(true);
assert.equal(activeResultTweens.size, 0, '进入后台必须停止结算入场Tween');
assert.equal(resultView._cardOpacity.opacity, 255, '停止结算Tween后必须恢复完全不透明');
assert.equal(resultView._card.scale.x, 1, '停止结算Tween后必须恢复中立缩放');
resultView.hide();
assert.equal(resultView.node.active, false, '退出或重试必须隐藏结算视图');

resultReducedMotion = true;
resultView.show({ ...resultPresentation, success: false });
const reducedResultTweens = resultTweenRecords.splice(0);
assert.equal(reducedResultTweens.length, 1, '减少动态结算只允许透明度Tween');
assert.equal(reducedResultTweens[0].target, resultView._cardOpacity, '减少动态不得缩放结算卡片');
assert.equal(reducedResultTweens[0].steps[0].seconds, .08, '减少动态结算淡入不得超过80ms');
resultView.onDestroy();
assert.equal(activeResultTweens.size, 0, 'ResultView销毁后不得残留Tween');
console.log('PASS: actual ResultView 180ms card entrance, continuous shade, reduced motion and lifecycle cleanup');

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
    /boss-inspector-head\/spriteFrame[\s\S]*boss-inspector-body\/spriteFrame[\s\S]*boss-inspector-check\/spriteFrame[\s\S]*boss-inspector-magnifier\/spriteFrame[\s\S]*boss-inspector-pass\/spriteFrame[\s\S]*boss-inspector-fail\/spriteFrame/,
    '检查动画必须加载从正式Boss确定性拆出的头身资源',
);
assert.match(bossActorSource, /\.trim\s*=\s*false/, 'Boss Sprite 必须按原始画布比例显示，不使用裁边拉伸');
assert.doesNotMatch(
    bossActorSource,
    /TOUCH_START|TOUCH_END|TOUCH_MOVE|BlockInputEvents/,
    'Boss 装饰节点不得注册或阻挡触摸',
);
assert.match(bossActorSource, /createUiNode\(\s*this\.node,\s*'NeutralLayer'/, 'BossRoot必须包含NeutralLayer');
assert.match(bossActorSource, /createUiNode\(\s*this\._neutralLayer,\s*'Body'/, 'NeutralLayer必须包含Body节点');
assert.match(bossActorSource, /createUiNode\(\s*this\._neutralLayer,\s*'Head'/, 'NeutralLayer必须包含Head节点');
assert.match(bossActorSource, /createUiNode\(\s*this\.node,\s*'PoseLayer'/, 'BossRoot必须包含PoseLayer');
assert.match(bossActorSource, /createPoseDisplay\('PoseCurrent'/, 'PoseLayer必须创建并复用PoseCurrent');
assert.match(bossActorSource, /createPoseDisplay\('PoseNext'/, 'PoseLayer必须创建并复用PoseNext');
assert.match(bossActorSource, /transitionPoseWithoutGhost\([\s\S]*generationToken/, '无叠影姿势切换必须统一封装并校验generation token');
assert.doesNotMatch(bossActorSource, /beginPoseCrossFade|finishPoseTransition\(/, '不得残留双角色交叉淡变实现');
assert.match(
    bossActorSource,
    /currentDisplay\.node\.active\s*=\s*false;[\s\S]*?nextDisplay\.node\.active\s*=\s*true;/,
    '完整姿势换图必须在同一回调中先关闭旧节点再启用新节点',
);
assert.match(bossActorSource, /setAnchorPoint\(0\.5, HEAD_NECK_ANCHOR_Y\)/, '头部旋转中心必须位于颈部');
assert.match(source, /'BossRoot'/, 'InspectionView必须明确创建BossRoot节点');
assert.match(source, /prefersReducedMotion\(\)/, '检查视图必须读取系统减少动态效果偏好');
assert.match(source, /find\(\(step\) => !step\.passed\)\?\.message/, '失败结果必须显示现有问题提示');

const actorResourceLoads = [];
const actorResourceLoadHistory = [];
const actorTweenRecords = [];
const activeActorTweens = new Set();
const actorWarnings = [];
const actorFrameRecords = [];
const deferredActorTweens = [];
let observedActor = null;
let actorTweenCallbackDepth = 0;

class ActorVec3 {
    static ZERO = new ActorVec3(0, 0, 0);
    static ONE = new ActorVec3(1, 1, 1);
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
}
class ActorUITransform {
    contentSize = { width: 0, height: 0 };
    anchorPoint = { x: .5, y: .5 };
    setContentSize(width, height) { this.contentSize = { width, height }; }
    setAnchorPoint(x, y) { this.anchorPoint = { x, y }; }
}
class ActorNode {
    constructor(name = '') { this.name = name; }
    active = true;
    children = [];
    parent = null;
    position = new ActorVec3();
    scale = new ActorVec3(1, 1, 1);
    angle = 0;
    transform = new ActorUITransform();
    addChild(child) { child.parent = this; this.children.push(child); }
    addComponent(Type) { const value = new Type(); if ('node' in value) value.node = this; return value; }
    setPosition(x, y = 0, z = 0) { this.position = typeof x === 'object' ? x : new ActorVec3(x, y, z); }
    setScale(x, y = x, z = 1) { this.scale = typeof x === 'object' ? x : new ActorVec3(x, y, z); }
}
class ActorComponent { node = new ActorNode(); }
class ActorUIOpacity { opacity = 255; }
class ActorSpriteFrame {}
class ActorSprite {
    static Type = { SIMPLE: 'simple' };
    static SizeMode = { CUSTOM: 'custom' };
    type = null;
    sizeMode = null;
    trim = true;
    spriteFrame = null;
}
class ActorTween {
    static stopAllByTarget(target) {
        for (const running of [...activeActorTweens]) {
            if (running.target === target) { running.stopped = true; activeActorTweens.delete(running); }
        }
    }
    constructor(target) { this.target = target; this.steps = []; this.stopped = false; }
    delay(seconds) { this.steps.push({ kind: 'delay', seconds }); return this; }
    to(seconds, properties, options = {}) { this.steps.push({ kind: 'to', seconds, properties, options }); return this; }
    call(callback) { this.steps.push({ kind: 'call', callback }); return this; }
    start() {
        actorTweenRecords.push(this);
        activeActorTweens.add(this);
        if (actorTweenCallbackDepth > 0) {
            deferredActorTweens.push(this);
            return this;
        }
        this.execute();
        return this;
    }
    execute() {
        for (const step of this.steps) {
            if (step.kind === 'to') Object.assign(this.target, step.properties);
            if (step.kind === 'call' && !this.stopped) {
                actorFrameRecords.push({ phase: 'before-callback', ...captureActorFrame(observedActor) });
                actorTweenCallbackDepth += 1;
                step.callback();
                actorTweenCallbackDepth -= 1;
                actorFrameRecords.push({ phase: 'after-callback', ...captureActorFrame(observedActor) });
                if (actorTweenCallbackDepth === 0) {
                    while (deferredActorTweens.length > 0) {
                        const deferred = deferredActorTweens.shift();
                        if (!deferred.stopped) deferred.execute();
                    }
                }
            }
        }
    }
}
const actorMocks = {
    cc: {
        _decorator: { ccclass: () => Type => Type },
        Component: ActorComponent,
        isValid: () => true,
        Node: ActorNode,
        resources: { load(path, Type, done) {
            assert.equal(Type, ActorSpriteFrame);
            actorResourceLoadHistory.push(path);
            actorResourceLoads.push({ path, done });
        } },
        Sprite: ActorSprite,
        SpriteFrame: ActorSpriteFrame,
        Tween: ActorTween,
        tween: target => new ActorTween(target),
        UIOpacity: ActorUIOpacity,
        Vec3: ActorVec3,
        warn: message => actorWarnings.push(message),
    },
    '../core/InspectionAnimation': inspectionAnimation,
    './UIFactory': {
        createUiNode(parent, name, width, height) {
            const node = new ActorNode(name); node.transform.setContentSize(width, height); parent.addChild(node); return node;
        },
        requireTransform: node => node.transform,
    },
};
const actorCompiled = ts.transpileModule(bossActorSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
}).outputText;
const actorContext = { exports: {}, require: name => { assert(name in actorMocks, `未声明的Boss依赖 ${name}`); return actorMocks[name]; } };
vm.runInNewContext(actorCompiled, actorContext);
const { BossInspectionActor: ActualBossInspectionActor } = actorContext.exports;
const actorLayout = inspectionAnimation.calculateInspectionAnimationLayout(viewport);

function createActualBoss() {
    const actor = new ActualBossInspectionActor();
    actor.node = new ActorNode('BossRoot');
    actor.initialize(actorLayout);
    return actor;
}
function finishPendingLayerLoads() {
    const loads = actorResourceLoads.splice(0);
    for (const { path, done } of loads) { const frame = new ActorSpriteFrame(); frame.path = path; done(null, frame); }
}
function lastTweenFor(target) {
    return actorTweenRecords.filter(record => record.target === target).at(-1);
}
function tweenProperties(record) {
    return record.steps.filter(step => step.kind === 'to').map(step => step.properties);
}
function visibleCharacterLayerCount(actor) {
    return Number(actor._neutralLayer.active)
        + Number(actor._poseCurrent.node.active)
        + Number(actor._poseNext.node.active);
}
function captureActorFrame(actor) {
    if (actor === null || actor._neutralLayer === null) return { visible: [] };
    const visible = [];
    if (actor._neutralLayer.active && actor._neutralOpacity.opacity > 0) {
        visible.push({
            pose: 'neutral',
            opacity: actor._neutralOpacity.opacity,
            scale: [actor._neutralLayer.scale.x, actor._neutralLayer.scale.y],
            position: [actor._neutralLayer.position.x, actor._neutralLayer.position.y],
            anchor: [actor._neutralLayer.transform.anchorPoint.x, actor._neutralLayer.transform.anchorPoint.y],
            contentSize: [actor._neutralLayer.transform.contentSize.width, actor._neutralLayer.transform.contentSize.height],
        });
    }
    if (actor._poseLayer.active) {
        for (const display of [actor._poseCurrent, actor._poseNext]) {
            if (!display.node.active || display.opacity.opacity <= 0) continue;
            const path = display.sprite.spriteFrame?.path ?? '';
            const pose = /boss-inspector-(check|magnifier|pass|fail)/.exec(path)?.[1] ?? 'unknown';
            visible.push({
                pose,
                opacity: display.opacity.opacity,
                scale: [display.node.scale.x, display.node.scale.y],
                position: [display.node.position.x, display.node.position.y],
                anchor: [display.node.transform.anchorPoint.x, display.node.transform.anchorPoint.y],
                contentSize: [display.node.transform.contentSize.width, display.node.transform.contentSize.height],
            });
        }
    }
    return { visible };
}
const frameAcceptanceRecords = {};
function validateGhostFreeTransition(actor, label, targetPose, frameStart, nodeCount) {
    const frames = actorFrameRecords.slice(frameStart);
    assert(frames.length >= 4, `${label}: 必须记录换图前、原子换图后及恢复完成帧`);
    for (const frame of frames) {
        assert.equal(frame.visible.length, 1, `${label}: 每个可渲染边界必须恰好有一个角色状态可见`);
        const visible = frame.visible[0];
        assert(visible.opacity > 0, `${label}: 不得出现人物完全消失帧`);
        assert.deepEqual(visible.position, [0, 0], `${label}: 换图不得改变角色节点position`);
        assert.deepEqual(visible.anchor, [.5, .5], `${label}: 换图不得改变角色锚点`);
        assert.deepEqual(
            visible.contentSize,
            [actorLayout.actorWidth, actorLayout.actorHeight],
            `${label}: 换图不得改变画布尺寸和脚底基线`,
        );
    }
    const swapFrame = frames.find(frame => frame.phase === 'after-callback'
        && frame.visible[0]?.pose === targetPose
        && frame.visible[0]?.opacity === inspectionAnimation.BOSS_POSE_SWAP_OPACITY);
    assert(swapFrame, `${label}: 同一Tween回调内必须原子切换到Alpha 210的新姿势`);
    assert.equal(actor._poseLayer.children.length, nodeCount, `${label}: 切换不得创建或销毁姿势节点`);
    assert.equal(visibleCharacterLayerCount(actor), 1, `${label}: 动画完成后只能保留一个角色状态`);
    frameAcceptanceRecords[label] = frames;
    return frames;
}
function runGhostFreeTransition(actor, label, targetPose, durationSeconds, transitionStyle, generation) {
    const frameStart = actorFrameRecords.length;
    const nodeCount = actor._poseLayer.children.length;
    actor.transitionPoseWithoutGhost(targetPose, durationSeconds, transitionStyle, generation);
    return validateGhostFreeTransition(actor, label, targetPose, frameStart, nodeCount);
}
function formalPoseLoadCount(paths) {
    return paths.filter(path => path === 'characters/boss-inspector/spriteFrame'
        || /boss-inspector-(check|magnifier|pass|fail)\/spriteFrame/.test(path)).length;
}
function assertNeutral(actor, message) {
    assert.equal(actor.node.position.x, actorLayout.actorX, `${message}: Root x`);
    assert.equal(actor.node.position.y, actorLayout.actorY, `${message}: Root y`);
    assert.deepEqual([actor.node.scale.x, actor.node.scale.y], [1, 1], `${message}: Root scale`);
    assert.equal(actor.node.angle, 0, `${message}: Root angle`);
    assert.deepEqual([actor._body.position.x, actor._body.position.y], [0, 0], `${message}: Body position`);
    assert.deepEqual([actor._body.scale.x, actor._body.scale.y], [1, 1], `${message}: Body scale`);
    assert.equal(actor._body.angle, 0, `${message}: Body angle`);
    assert.deepEqual([actor._head.position.x, actor._head.position.y], [0, actor._headNeutralY], `${message}: Head position`);
    assert.deepEqual([actor._head.scale.x, actor._head.scale.y], [1, 1], `${message}: Head scale`);
    assert.equal(actor._head.angle, 0, `${message}: Head angle`);
}

const actor = createActualBoss();
actor.initialize(actorLayout);
assert.deepEqual(actor.node.children.map(child => child.name), ['NeutralLayer', 'PoseLayer'], 'BossRoot只创建NeutralLayer和PoseLayer');
assert.deepEqual(actor._neutralLayer.children.map(child => child.name), ['Body', 'Head'], 'NeutralLayer中Head必须位于Body上层');
assert.deepEqual(actor._poseLayer.children.map(child => child.name), ['PoseCurrent', 'PoseNext'], 'PoseLayer必须只创建并复用两个姿势节点');
const poseNodeCount = actor._poseLayer.children.length;
assert.equal(actorResourceLoads.length, 7, '初始化必须一次预载Head、Body和五张正式状态图');
const actorGeneration = actor.play(false);
assert.equal(actorTweenRecords.length, 0, '资源未就绪前不得播放不可见进场Tween');
finishPendingLayerLoads();
assert.equal(actorTweenRecords.length, 4, '资源就绪后应播放既有Root、透明度、Body、Head进场动作');
assertNeutral(actor, '进场完成');

observedActor = actor;
const neutralToCheckFrames = runGhostFreeTransition(
    actor,
    'neutral-to-check',
    'check',
    inspectionAnimation.BOSS_POSE_TRANSITION_SECONDS,
    'singleSwap',
    actorGeneration,
);
assert.equal(actor._neutralLayer.active, false, 'check显示时NeutralLayer必须隐藏');
assert.equal(actor._poseLayer.active, true, 'check显示时PoseLayer必须独占显示');
assert.match(actor._poseCurrent.sprite.spriteFrame.path, /boss-inspector-check/, 'check姿势映射必须正确');
assert(neutralToCheckFrames.every(frame => frame.visible.length === 1), 'neutral与check不得同时可见');

const checkToMagnifierFrames = runGhostFreeTransition(
    actor,
    'check-to-magnifier',
    'magnifier',
    inspectionAnimation.BOSS_MAGNIFIER_TRANSITION_SECONDS,
    'checkToMagnifier',
    actorGeneration,
);
assert.match(actor._poseCurrent.sprite.spriteFrame.path, /boss-inspector-magnifier/, 'magnifier姿势映射必须正确');
const magnifierPop = actorTweenRecords.findLast(record =>
    record.target === actor._poseCurrent.node
    && record.steps.filter(step => step.kind === 'to').length === 2
);
assert(
    Math.abs(magnifierPop.steps.filter(step => step.kind === 'to').reduce((sum, step) => sum + step.seconds, 0) - .115) < 1e-9,
    'magnifier换图后必须用60ms弹出并用55ms恢复',
);
assert(checkToMagnifierFrames.every(frame => frame.visible.length === 1), 'check与magnifier不得同时以非零Alpha显示');
runGhostFreeTransition(actor, 'magnifier-to-check', 'check', .1, 'magnifierToCheck', actorGeneration);
assert.match(actor._poseCurrent.sprite.spriteFrame.path, /boss-inspector-check/, 'magnifier返回后必须恢复check');
runGhostFreeTransition(actor, 'check-to-neutral', 'neutral', .1, 'singleSwap', actorGeneration);
assert.equal(actor._neutralLayer.active, true, 'neutral reaction前必须恢复NeutralLayer');
assert.equal(actor._poseLayer.active, false, 'neutral reaction前必须隐藏PoseLayer');
assert.equal(visibleCharacterLayerCount(actor), 1, 'neutral恢复后不得残留完整姿势层');
assert.equal(actor._poseLayer.children.length, poseNodeCount, '多次姿势切换不得创建新节点');

actor.playResultReaction(true, false, actorGeneration);
const successHeadProperties = tweenProperties(lastTweenFor(actor._head));
assert.equal(successHeadProperties[0].position.y, actor._headNeutralY - 20, '成功反应首次必须由Head下沉20设计像素');
assert.equal(successHeadProperties[0].scale.y, .94, '成功反应首次必须把Head纵向压缩到0.94');
assert.equal(successHeadProperties[1].position.y, actor._headNeutralY + 4, '成功反应首次回弹必须超过中立位置4设计像素');
assert.equal(successHeadProperties[2].position.y, actor._headNeutralY - 11, '成功反应必须包含第二次11设计像素点头');
assert.equal(successHeadProperties[2].scale.y, .96, '成功反应第二次必须把Head纵向压缩到0.96');
assert.equal(successHeadProperties[3].position.y, actor._headNeutralY, '成功反应第二次必须回弹到中立位置');
assert(successHeadProperties.every(value => value.position.x === 0 && value.angle === 0), '成功反应不得左右摇头');
assertNeutral(actor, '成功点头完成');
assert.equal(actor._reactionComplete, true, 'Head恢复中立后才能切换最终姿势');
const passFrameStart = actorFrameRecords.length;
actor.showFinalPose(actorGeneration);
validateGhostFreeTransition(actor, 'neutral-to-pass', 'pass', passFrameStart, poseNodeCount);
assert.match(actor._poseCurrent.sprite.spriteFrame.path, /boss-inspector-pass/, '成功最终必须显示pass姿势');
assert.equal(actor._neutralLayer.active, false, 'pass姿势不得与neutral重叠');
assert.equal(visibleCharacterLayerCount(actor), 1, 'pass淡变完成后只能显示一个角色');
actor.reset();
assert.equal(activeActorTweens.size, 0, '退出检查必须清理全部Boss Tween');
assert.equal(actor._opacity.opacity, 0, '退出检查必须隐藏并归中BossRoot');
assert.equal(actor._poseCurrent.sprite.spriteFrame, null, '退出检查必须清除PoseCurrent旧SpriteFrame');
assert.equal(actor._poseNext.sprite.spriteFrame, null, '退出检查必须清除PoseNext旧SpriteFrame');
assert.equal(actor._poseLayer.active, false, '退出检查不得残留PoseLayer');

const failureGeneration = actor.play(false);
actor.playResultReaction(false, false, failureGeneration);
const failureHeadTween = lastTweenFor(actor._head);
const failureHeadProperties = tweenProperties(failureHeadTween);
assert.deepEqual(failureHeadProperties.slice(0, 5).map(value => value.angle), [-7, 7, -5, 5, 0], '失败反应必须按指定角度摇头');
assert(failureHeadProperties.every(value => value.position.y === actor._headNeutralY && value.scale.y === 1), '失败反应不得上下点动或纵向压缩');
assert.deepEqual(
    failureHeadTween.steps.filter(step => step.kind === 'to').map(step => [step.seconds, step.properties.position.x, step.properties.angle, step.options.easing]),
    [
        [.09, -2, -7, 'quadInOut'],
        [.1, 2, 7, 'quadInOut'],
        [.09, -1.5, -5, 'quadInOut'],
        [.1, 1.5, 5, 'quadInOut'],
        [.14, 0, 0, 'quadOut'],
        [.06, 0, 0, 'quadOut'],
    ],
    '失败摇头原有角度、水平位移、时长和缓动必须保持不变',
);
assertNeutral(actor, '失败摇头完成');
const failFrameStart = actorFrameRecords.length;
actor.showFinalPose(failureGeneration);
validateGhostFreeTransition(actor, 'neutral-to-fail', 'fail', failFrameStart, poseNodeCount);
assert.match(actor._poseCurrent.sprite.spriteFrame.path, /boss-inspector-fail/, '失败最终必须显示fail姿势');
assert.equal(visibleCharacterLayerCount(actor), 1, 'fail淡变完成后只能显示一个角色');

for (const cleanup of [
    () => actor.reset(),
    () => actor.onDisable(),
    () => actor.setPaused(true),
]) {
    actor.play(false);
    actor.playResultReaction(false, false);
    assert(activeActorTweens.size > 0, '清理场景前应存在运行中的Tween');
    cleanup();
    assert.equal(activeActorTweens.size, 0, '退出、重试、切关、禁用或后台必须清理全部Tween');
    assertNeutral(actor, '生命周期清理');
}
actor.setPaused(false);

const poseLoadCountBeforeRetries = formalPoseLoadCount(actorResourceLoadHistory);
for (let retry = 0; retry < 3; retry++) {
    actor.play(false);
    actor.reset();
}
assert.equal(
    formalPoseLoadCount(actorResourceLoadHistory),
    poseLoadCountBeforeRetries,
    '连续三轮重试不得重复加载五张正式状态图',
);

const tweenCountBeforeReducedMotion = actorTweenRecords.length;
actor.play(true);
actor.playResultReaction(true, true);
assert.equal(actorTweenRecords.length, tweenCountBeforeReducedMotion, '减少动态效果不得创建Root、Body或Head Tween');
assertNeutral(actor, '减少动态效果');
assert.equal(actor._opacity.opacity, 255, '减少动态效果应直接显示中立Boss');
assert.match(actor._poseCurrent.sprite.spriteFrame.path, /boss-inspector-pass/, '减少动态成功必须直接显示pass并跳过点头');
assert.equal(actor._poseLayer.active, true, '减少动态结果必须静态显示完整姿势');
actor.reset();

const lateActor = createActualBoss();
lateActor.play(false);
lateActor.playResultReaction(false, false);
const lateTweenStart = actorTweenRecords.length;
finishPendingLayerLoads();
const lateTweens = actorTweenRecords.slice(lateTweenStart);
assert(lateTweens.some(record => record.target === lateActor._head), '结果出现后资源才就绪时仍应播放对应头部反应');
assert(lateTweens.every(record => record.target !== lateActor.node), '迟到资源不得重播BossRoot进场');
lateActor.reset();
assert.equal(activeActorTweens.size, 0, '迟到资源分支重置后不得残留Tween');

const destroyedActor = createActualBoss();
destroyedActor.play(false);
destroyedActor.onDestroy();
const tweenCountBeforeDestroyedLoads = actorTweenRecords.length;
finishPendingLayerLoads();
assert.equal(actorTweenRecords.length, tweenCountBeforeDestroyedLoads, '组件销毁后的资源回调不得创建Tween或节点残留');
assert.equal(activeActorTweens.size, 0, '组件销毁必须清理全部Tween');
assert.equal(actorWarnings.length, 0, '正式分层资源加载不应警告');

const failedPoseLoads = [];
const failedPoseLoadHistory = [];
const failedPoseWarnings = [];
const failedActorMocks = {
    ...actorMocks,
    cc: {
        ...actorMocks.cc,
        warn: message => failedPoseWarnings.push(message),
        resources: { load(path, Type, done) {
            assert.equal(Type, ActorSpriteFrame);
            failedPoseLoadHistory.push(path);
            failedPoseLoads.push({ path, done });
        } },
    },
};
const failedActorContext = {
    exports: {},
    require: name => { assert(name in failedActorMocks, `未声明的失败回退Boss依赖 ${name}`); return failedActorMocks[name]; },
};
vm.runInNewContext(actorCompiled, failedActorContext);
const { BossInspectionActor: FailedPoseBossInspectionActor } = failedActorContext.exports;
const failedPoseActor = new FailedPoseBossInspectionActor();
failedPoseActor.node = new ActorNode('BossRoot');
failedPoseActor.initialize(actorLayout);
const failedPoseGeneration = failedPoseActor.play(false);
assert.equal(failedPoseLoads.length, 7, '失败回退场景也必须先一次性请求全部资源');
for (const { path, done } of failedPoseLoads.splice(0)) {
    if (path.includes('boss-inspector-magnifier')) {
        done(undefined, undefined);
    } else {
        const frame = new ActorSpriteFrame(); frame.path = path; done(undefined, frame);
    }
}
assert.equal(failedPoseActor._poseAssetsAvailable, false, '成功回调返回undefined时必须视为姿势资源不可用');
failedPoseActor.transitionPoseWithoutGhost('check', .1, 'singleSwap', failedPoseGeneration);
assert.equal(failedPoseActor._neutralLayer.active, true, '任一姿势加载失败必须回退neutral');
assert.equal(failedPoseActor._poseLayer.active, false, '加载失败时不得显示不完整PoseLayer');
failedPoseActor.playResultReaction(false, false, failedPoseGeneration);
assert.equal(failedPoseActor._reactionStarted, true, '姿势加载失败仍必须正常执行结果反应');
failedPoseActor.showFinalPose(failedPoseGeneration);
assert.equal(failedPoseActor._neutralLayer.active, true, '最终姿势不可用时也必须稳定回退neutral');
failedPoseActor.reset();
assert.equal(activeActorTweens.size, 0, '加载失败流程结束后不得残留Tween');
assert.equal(failedPoseWarnings.length, 1, '同一Actor姿势失败只警告一次');

const failedRetryActor = new FailedPoseBossInspectionActor();
failedRetryActor.node = new ActorNode('BossRoot');
failedRetryActor.initialize(actorLayout);
for (let retry = 0; retry < 3; retry++) {
    failedRetryActor.play(false);
    failedRetryActor.reset();
}
assert.equal(
    formalPoseLoadCount(failedPoseLoadHistory),
    5,
    '失败状态也必须被会话缓存，三轮重试不得重复解码姿势纹理',
);
failedRetryActor.onDestroy();
for (const { done } of failedPoseLoads.splice(0)) {
    done(undefined, new ActorSpriteFrame());
}
assert.equal(activeActorTweens.size, 0, '销毁后的迟到头身回调不得恢复节点或Tween');

assert.match(gameViewSource, /configureLevel[\s\S]*?cancelTransientViews\(\)[\s\S]*?teardownLevel\(\)/, '重试和切关必须先取消检查再重建关卡');
assert.match(gameViewSource, /cancelGameplay[\s\S]*?cancelTransientViews\(\)/, '退出关卡必须取消检查动画');
assert.match(gameViewSource, /cancelTransientViews[\s\S]*?_inspectionView\?\.cancel\(\)/, '所有瞬态视图清理必须覆盖检查动画');
assert.match(gameViewSource, /onDestroy[\s\S]*?_inspectionView\?\.cancel\(\)/, 'GameView销毁必须显式取消检查动画');
assert.match(gameViewSource, /setLifecyclePaused[\s\S]*?_resultView\?\.setPaused\(paused\)/, '进入后台必须停止结算弹窗Tween');
assert.match(source, /onDisable[\s\S]*?clearPlayback\(\)/, 'InspectionView禁用必须取消调度和Boss动画');
execFileSync(process.execPath, [new URL('../tools/split-boss-inspector.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' });
assert.deepEqual(
    Object.keys(frameAcceptanceRecords).sort(),
    [
        'check-to-magnifier',
        'check-to-neutral',
        'magnifier-to-check',
        'neutral-to-check',
        'neutral-to-fail',
        'neutral-to-pass',
    ],
    '逐帧验收必须覆盖六种正式姿势切换',
);
const frameRecordPath = '/private/tmp/boss-inspection-no-ghost-frame-records.json';
writeFileSync(frameRecordPath, `${JSON.stringify(frameAcceptanceRecords, null, 2)}\n`);
console.log(`PASS: actual BossInspectionActor no-ghost swaps, nod/shake, reduced motion, late load and lifecycle cleanup; frames: ${frameRecordPath}`);
