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
    play(reduced) { this.request = { reduced }; this.poseRequests = []; this.finalPoseCalls = 0; }
    showPose(pose) { this.poseRequests.push(pose); }
    playResultReaction(passed, reduced) {
        this.resultRequest = { passed, reduced };
        this.resultCalls = (this.resultCalls ?? 0) + 1;
    }
    showFinalPose() { this.finalPoseCalls++; }
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
    assert.deepEqual(view._bossActor.poseRequests, ['check'], '0.58秒必须切换到普通检查姿势');
    view.setPaused(true); view.setPaused(true); const frozen = view._progressLabel.string; scheduler.tick(90);
    assert.equal(finished, 0, '后台不能结束检查'); assert.equal(view._progressLabel.string, frozen);
    view.setPaused(false); view.setPaused(false); scheduler.tick(1.18);
    const passed = flags.every(Boolean);
    assert.equal(view._bossActor.resultRequest.passed, passed, '头部反应必须匹配汇总结果');
    assert.equal(view._bossActor.resultRequest.reduced, false);
    assert.equal(view._bossActor.resultCalls, rounds + 1, '每轮结果反应只能触发一次');
    assert.deepEqual(
        view._bossActor.poseRequests,
        ['check', 'magnifier', 'check', 'neutral'],
        '正常检查必须严格按check→magnifier→check→neutral切换',
    );
    assert.match(view._feedbackLabel.string, passed ? /✓\s+全部合格/ : /^×\s+\d:false$/, '结果反馈必须同步显示勾或现有问题提示');
    scheduler.tick(1);
    assert.equal(view._bossActor.finalPoseCalls, 1, '2.52秒最终pass/fail姿势只允许切换一次');
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
assert.match(bossActorSource, /createUiNode\(\s*this\._poseLayer,\s*'PoseSprite'/, 'PoseLayer必须只复用PoseSprite');
assert.match(bossActorSource, /setAnchorPoint\(0\.5, HEAD_NECK_ANCHOR_Y\)/, '头部旋转中心必须位于颈部');
assert.match(source, /'BossRoot'/, 'InspectionView必须明确创建BossRoot节点');
assert.match(source, /prefersReducedMotion\(\)/, '检查视图必须读取系统减少动态效果偏好');
assert.match(source, /find\(\(step\) => !step\.passed\)\?\.message/, '失败结果必须显示现有问题提示');

const actorResourceLoads = [];
const actorResourceLoadHistory = [];
const actorTweenRecords = [];
const activeActorTweens = new Set();
const actorWarnings = [];

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
    start() {
        actorTweenRecords.push(this);
        activeActorTweens.add(this);
        for (const step of this.steps) if (step.kind === 'to') Object.assign(this.target, step.properties);
        return this;
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
assert.deepEqual(actor._poseLayer.children.map(child => child.name), ['PoseSprite'], 'PoseLayer必须只创建并复用一个PoseSprite');
assert.equal(actorResourceLoads.length, 6, '初始化必须一次预载Head、Body和四张完整姿势');
actor.play(false);
assert.equal(actorTweenRecords.length, 0, '资源未就绪前不得播放不可见进场Tween');
finishPendingLayerLoads();
assert.equal(actorTweenRecords.length, 4, '资源就绪后应播放既有Root、透明度、Body、Head进场动作');
assertNeutral(actor, '进场完成');

actor.showPose('check');
assert.equal(actor._neutralLayer.active, false, 'check显示时NeutralLayer必须隐藏');
assert.equal(actor._poseLayer.active, true, 'check显示时PoseLayer必须独占显示');
assert.match(actor._poseSprite.spriteFrame.path, /boss-inspector-check/, 'check姿势映射必须正确');
actor.showPose('magnifier');
assert.match(actor._poseSprite.spriteFrame.path, /boss-inspector-magnifier/, 'magnifier姿势映射必须正确');
assert.equal(lastTweenFor(actor._poseLayer).steps.reduce((sum, step) => sum + step.seconds, 0), .16, 'magnifier弹出必须恰好0.16秒');
actor.showPose('check');
actor.showPose('neutral');
assert.equal(actor._neutralLayer.active, true, 'neutral reaction前必须恢复NeutralLayer');
assert.equal(actor._poseLayer.active, false, 'neutral reaction前必须隐藏PoseLayer');

actor.playResultReaction(true, false);
const successHeadProperties = tweenProperties(lastTweenFor(actor._head));
assert.equal(successHeadProperties[0].position.y, actor._headNeutralY - 20, '成功反应首次必须由Head下沉20设计像素');
assert.equal(successHeadProperties[0].scale.y, .94, '成功反应首次必须把Head纵向压缩到0.94');
assert.equal(successHeadProperties[1].position.y, actor._headNeutralY + 4, '成功反应首次回弹必须超过中立位置4设计像素');
assert.equal(successHeadProperties[2].position.y, actor._headNeutralY - 11, '成功反应必须包含第二次11设计像素点头');
assert.equal(successHeadProperties[2].scale.y, .96, '成功反应第二次必须把Head纵向压缩到0.96');
assert.equal(successHeadProperties[3].position.y, actor._headNeutralY, '成功反应第二次必须回弹到中立位置');
assert(successHeadProperties.every(value => value.position.x === 0 && value.angle === 0), '成功反应不得左右摇头');
assertNeutral(actor, '成功点头完成');
actor.showFinalPose();
assert.match(actor._poseSprite.spriteFrame.path, /boss-inspector-pass/, '成功最终必须显示pass姿势');
assert.equal(actor._neutralLayer.active, false, 'pass姿势不得与neutral重叠');
actor.reset();
assert.equal(activeActorTweens.size, 0, '退出检查必须清理全部Boss Tween');
assert.equal(actor._opacity.opacity, 0, '退出检查必须隐藏并归中BossRoot');
assert.equal(actor._poseSprite.spriteFrame, null, '退出检查必须清除旧Pose SpriteFrame');
assert.equal(actor._poseLayer.active, false, '退出检查不得残留PoseLayer');

actor.play(false);
actor.playResultReaction(false, false);
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
actor.showFinalPose();
assert.match(actor._poseSprite.spriteFrame.path, /boss-inspector-fail/, '失败最终必须显示fail姿势');

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

const poseLoadCountBeforeRetries = actorResourceLoadHistory.filter(path => /boss-inspector-(check|magnifier|pass|fail)/.test(path)).length;
for (let retry = 0; retry < 3; retry++) {
    actor.play(false);
    actor.reset();
}
assert.equal(
    actorResourceLoadHistory.filter(path => /boss-inspector-(check|magnifier|pass|fail)/.test(path)).length,
    poseLoadCountBeforeRetries,
    '连续三轮重试不得重复加载四张完整姿势',
);

const tweenCountBeforeReducedMotion = actorTweenRecords.length;
actor.play(true);
actor.playResultReaction(true, true);
assert.equal(actorTweenRecords.length, tweenCountBeforeReducedMotion, '减少动态效果不得创建Root、Body或Head Tween');
assertNeutral(actor, '减少动态效果');
assert.equal(actor._opacity.opacity, 255, '减少动态效果应直接显示中立Boss');
assert.match(actor._poseSprite.spriteFrame.path, /boss-inspector-pass/, '减少动态成功必须直接显示pass并跳过点头');
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
failedPoseActor.play(false);
assert.equal(failedPoseLoads.length, 6, '失败回退场景也必须先一次性请求全部资源');
for (const { path, done } of failedPoseLoads.splice(0)) {
    if (path.includes('boss-inspector-magnifier')) {
        done(undefined, undefined);
    } else {
        const frame = new ActorSpriteFrame(); frame.path = path; done(undefined, frame);
    }
}
assert.equal(failedPoseActor._poseAssetsAvailable, false, '成功回调返回undefined时必须视为姿势资源不可用');
failedPoseActor.showPose('check');
assert.equal(failedPoseActor._neutralLayer.active, true, '任一姿势加载失败必须回退neutral');
assert.equal(failedPoseActor._poseLayer.active, false, '加载失败时不得显示不完整PoseLayer');
failedPoseActor.playResultReaction(false, false);
assert.equal(failedPoseActor._reactionStarted, true, '姿势加载失败仍必须正常执行结果反应');
failedPoseActor.showFinalPose();
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
    failedPoseLoadHistory.filter(path => /boss-inspector-(check|magnifier|pass|fail)/.test(path)).length,
    4,
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
assert.match(source, /onDisable[\s\S]*?clearPlayback\(\)/, 'InspectionView禁用必须取消调度和Boss动画');
execFileSync(process.execPath, [new URL('../tools/split-boss-inspector.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' });
console.log('PASS: actual BossInspectionActor nod/shake, reduced motion, late load and lifecycle cleanup regressions');
