import {
    _decorator,
    Component,
    isValid,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    Tween,
    tween,
    UIOpacity,
    Vec3,
    warn,
} from 'cc';
import {
    BOSS_HEAD_NECK_PIVOT_SOURCE_Y,
    BOSS_MAGNIFIER_POP_SECONDS,
    BodyReactionKeyframe,
    BossInspectionPose,
    FAILURE_BODY_REACTION,
    FAILURE_HEAD_REACTION,
    HeadReactionKeyframe,
    InspectionAnimationLayout,
    SUCCESS_BODY_REACTION,
    SUCCESS_HEAD_REACTION,
} from '../core/InspectionAnimation';
import { createUiNode, requireTransform } from './UIFactory';

const { ccclass } = _decorator;

export const BOSS_INSPECTOR_HEAD_RESOURCE_PATH = 'characters/boss-inspector-head/spriteFrame';
export const BOSS_INSPECTOR_BODY_RESOURCE_PATH = 'characters/boss-inspector-body/spriteFrame';

type FullBossInspectionPose = Exclude<BossInspectionPose, 'neutral'>;

export const BOSS_INSPECTION_POSE_RESOURCE_PATHS: Readonly<Record<FullBossInspectionPose, string>> = {
    check: 'characters/boss-inspector-check/spriteFrame',
    magnifier: 'characters/boss-inspector-magnifier/spriteFrame',
    pass: 'characters/boss-inspector-pass/spriteFrame',
    fail: 'characters/boss-inspector-fail/spriteFrame',
};

const FULL_BOSS_INSPECTION_POSES: readonly FullBossInspectionPose[] = [
    'check',
    'magnifier',
    'pass',
    'fail',
];
const SOURCE_HEIGHT = 1536;
const HEAD_NECK_ANCHOR_Y = (SOURCE_HEIGHT - BOSS_HEAD_NECK_PIVOT_SOURCE_Y) / SOURCE_HEIGHT;

type PoseLoadState = 'idle' | 'loading' | 'ready' | 'failed';
type PoseLoadListener = (available: boolean) => void;

let sharedPoseLoadState: PoseLoadState = 'idle';
let sharedPoseFrames: Partial<Record<FullBossInspectionPose, SpriteFrame>> = {};
const sharedPoseLoadListeners = new Set<PoseLoadListener>();

/** 四张完整姿势在同一 JS 会话中只发起一次加载；失败同样会被记忆并稳定回退。 */
function requestSharedPoseFrames(listener: PoseLoadListener): () => void {
    if (sharedPoseLoadState === 'ready') {
        listener(true);
        return () => undefined;
    }
    if (sharedPoseLoadState === 'failed') {
        listener(false);
        return () => undefined;
    }

    sharedPoseLoadListeners.add(listener);
    if (sharedPoseLoadState === 'idle') {
        sharedPoseLoadState = 'loading';
        let remaining = FULL_BOSS_INSPECTION_POSES.length;
        let failed = false;
        for (const pose of FULL_BOSS_INSPECTION_POSES) {
            resources.load(
                BOSS_INSPECTION_POSE_RESOURCE_PATHS[pose],
                SpriteFrame,
                (error, frame) => {
                    if (sharedPoseLoadState !== 'loading') {
                        return;
                    }
                    if (error || frame === undefined || frame === null) {
                        failed = true;
                    } else {
                        sharedPoseFrames[pose] = frame;
                    }
                    remaining -= 1;
                    if (remaining > 0) {
                        return;
                    }

                    sharedPoseLoadState = failed ? 'failed' : 'ready';
                    if (failed) {
                        sharedPoseFrames = {};
                    }
                    const available = sharedPoseLoadState === 'ready';
                    for (const waitingListener of sharedPoseLoadListeners) {
                        waitingListener(available);
                    }
                    sharedPoseLoadListeners.clear();
                },
            );
        }
    }

    return () => {
        sharedPoseLoadListeners.delete(listener);
    };
}

function getSharedPoseFrame(pose: FullBossInspectionPose): SpriteFrame | null {
    return sharedPoseLoadState === 'ready' ? sharedPoseFrames[pose] ?? null : null;
}

@ccclass('BossInspectionActor')
export class BossInspectionActor extends Component {
    private _neutralLayer: Node | null = null;
    private _poseLayer: Node | null = null;
    private _poseSpriteNode: Node | null = null;
    private _poseSprite: Sprite | null = null;
    private _body: Node | null = null;
    private _head: Node | null = null;
    private _opacity: UIOpacity | null = null;
    private _neutralOpacity: UIOpacity | null = null;
    private _poseOpacity: UIOpacity | null = null;
    private _layout: InspectionAnimationLayout | null = null;
    private _loadedLayerCount = 0;
    private _headNeutralY = 0;
    private _activeRun = false;
    private _reducedMotion = false;
    private _paused = false;
    private _entranceStarted = false;
    private _reactionStarted = false;
    private _pendingReaction: boolean | null = null;
    private _lastOutcomePassed: boolean | null = null;
    private _requestedPose: BossInspectionPose = 'neutral';
    private _shownCheckCount = 0;
    private _poseAssetsAvailable = false;
    private _poseLoadPending = false;
    private _poseFailureWarned = false;
    private _cancelPosePreload: (() => void) | null = null;
    private _poseLoadGeneration = 0;
    private _runGeneration = 0;
    private _disposed = false;

    public initialize(layout: InspectionAnimationLayout): void {
        this._layout = layout;
        requireTransform(this.node).setContentSize(layout.actorWidth, layout.actorHeight);
        this.node.setPosition(layout.actorX, layout.actorY);
        if (this._neutralLayer !== null || this._poseLayer !== null) {
            return;
        }

        this._neutralLayer = createUiNode(
            this.node,
            'NeutralLayer',
            layout.actorWidth,
            layout.actorHeight,
        );
        this._body = createUiNode(
            this._neutralLayer,
            'Body',
            layout.actorWidth,
            layout.actorHeight,
        );
        this._head = createUiNode(
            this._neutralLayer,
            'Head',
            layout.actorWidth,
            layout.actorHeight,
        );
        requireTransform(this._head).setAnchorPoint(0.5, HEAD_NECK_ANCHOR_Y);
        this._headNeutralY = (HEAD_NECK_ANCHOR_Y - 0.5) * layout.actorHeight;
        this._head.setPosition(0, this._headNeutralY);
        this.attachLayer(this._body, BOSS_INSPECTOR_BODY_RESOURCE_PATH);
        this.attachLayer(this._head, BOSS_INSPECTOR_HEAD_RESOURCE_PATH);

        this._poseLayer = createUiNode(
            this.node,
            'PoseLayer',
            layout.actorWidth,
            layout.actorHeight,
        );
        this._poseSpriteNode = createUiNode(
            this._poseLayer,
            'PoseSprite',
            layout.actorWidth,
            layout.actorHeight,
        );
        this._poseSprite = this._poseSpriteNode.addComponent(Sprite);
        this._poseSprite.type = Sprite.Type.SIMPLE;
        this._poseSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._poseSprite.trim = false;

        this._neutralOpacity = this._neutralLayer.addComponent(UIOpacity);
        this._poseOpacity = this._poseLayer.addComponent(UIOpacity);
        this._opacity = this.node.addComponent(UIOpacity);
        this._opacity.opacity = 0;
        this.showNeutralLayer();
        this.requestPoseAssets();
    }

    public play(reducedMotion: boolean): void {
        this.cancelPoseRequest();
        this.stopAllTweens();
        this._runGeneration += 1;
        this._activeRun = true;
        this._reducedMotion = reducedMotion;
        this._paused = false;
        this._entranceStarted = false;
        this._reactionStarted = false;
        this._pendingReaction = null;
        this._lastOutcomePassed = null;
        this._requestedPose = reducedMotion ? 'check' : 'neutral';
        this._shownCheckCount = 0;
        this.restoreNeutral(0);
        this.requestPoseAssets();

        if (reducedMotion) {
            // 减少动态效果只做静态姿势切换，不创建 Root、Body、Head 或 Pose Tween。
            this.restoreRoot(255);
            this.applyRequestedPose(false);
        } else if (this.layersReady) {
            this.startEntrance();
        }
    }

    public showPose(pose: Extract<BossInspectionPose, 'neutral' | 'check' | 'magnifier'>): void {
        if (!this._activeRun || this._paused || this._reducedMotion) {
            return;
        }
        this._requestedPose = pose;
        if (pose !== 'neutral') {
            // 0.58 秒以后即使头身资源晚到，也不能补播已经错过的进场动画。
            this._entranceStarted = true;
            this.stopLayerTweens();
            this.restoreLayers();
        }
        const animate = pose === 'magnifier' || (pose === 'check' && this._shownCheckCount === 0);
        if (pose === 'check') {
            this._shownCheckCount += 1;
        }
        this.restoreRoot(255);
        this.applyRequestedPose(animate);
    }

    public playResultReaction(passed: boolean, reducedMotion: boolean): void {
        if (!this._activeRun || this._reactionStarted) {
            return;
        }
        this._lastOutcomePassed = passed;
        if (reducedMotion || this._reducedMotion || this._paused) {
            this._reactionStarted = true;
            this._pendingReaction = null;
            this.stopLayerTweens();
            this.restoreLayers();
            this._requestedPose = passed ? 'pass' : 'fail';
            this.applyRequestedPose(false);
            return;
        }
        this._requestedPose = 'neutral';
        this.applyRequestedPose(false);
        if (!this.layersReady) {
            this._pendingReaction = passed;
            return;
        }
        this.startOutcomeReaction(passed);
    }

    public showFinalPose(): void {
        if (!this._activeRun || this._paused || this._reducedMotion || this._lastOutcomePassed === null) {
            return;
        }
        this._pendingReaction = null;
        this.stopLayerTweens();
        this.restoreLayers();
        this._requestedPose = this._lastOutcomePassed ? 'pass' : 'fail';
        this.applyRequestedPose(false);
    }

    public setPaused(paused: boolean): void {
        if (paused === this._paused) {
            return;
        }
        this._paused = paused;
        if (!paused) {
            if (this._activeRun) {
                this.restoreRoot(255);
                this.applyRequestedPose(false);
            }
            return;
        }

        // 进入后台时主动停止而不是保留 Tween；恢复后只呈现当前阶段的稳定姿势。
        const visibleOpacity = this._activeRun ? 255 : 0;
        if (this._activeRun) {
            this._entranceStarted = true;
        }
        this._pendingReaction = null;
        this.stopAllTweens();
        this.restoreRoot(visibleOpacity);
        this.restoreLayers();
        this.showNeutralLayer();
    }

    public reset(): void {
        this._runGeneration += 1;
        this.cancelPoseRequest();
        this._activeRun = false;
        this._reducedMotion = false;
        this._paused = false;
        this._entranceStarted = false;
        this._reactionStarted = false;
        this._pendingReaction = null;
        this._lastOutcomePassed = null;
        this._requestedPose = 'neutral';
        this._shownCheckCount = 0;
        this.stopAllTweens();
        this.restoreNeutral(0);
        if (this._poseSprite !== null) {
            this._poseSprite.spriteFrame = null;
        }
    }

    protected override onDisable(): void {
        this.reset();
    }

    protected override onDestroy(): void {
        this._disposed = true;
        this.reset();
        this._neutralLayer = null;
        this._poseLayer = null;
        this._poseSpriteNode = null;
        this._poseSprite = null;
        this._body = null;
        this._head = null;
        this._opacity = null;
        this._neutralOpacity = null;
        this._poseOpacity = null;
        this._layout = null;
    }

    private get layersReady(): boolean {
        return this._loadedLayerCount === 2;
    }

    private attachLayer(node: Node, path: string): void {
        const sprite = node.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        resources.load(path, SpriteFrame, (error, frame) => {
            if (this._disposed || !isValid(this.node, true)) {
                return;
            }
            if (error || frame === undefined || frame === null) {
                warn(`Boss检查角色分层资源加载失败：${path}`);
                return;
            }
            sprite.spriteFrame = frame;
            this._loadedLayerCount += 1;
            if (this.layersReady) {
                this.handleLayersReady();
            }
        });
    }

    private requestPoseAssets(): void {
        if (this._disposed || this._poseAssetsAvailable || this._poseLoadPending) {
            return;
        }
        this._poseLoadPending = true;
        const loadGeneration = ++this._poseLoadGeneration;
        const runGeneration = this._runGeneration;
        const cancel = requestSharedPoseFrames((available) => {
            if (
                this._disposed
                || loadGeneration !== this._poseLoadGeneration
                || runGeneration !== this._runGeneration
                || !isValid(this.node, true)
            ) {
                return;
            }
            this._poseLoadPending = false;
            this._cancelPosePreload = null;
            this._poseAssetsAvailable = available;
            if (!available && !this._poseFailureWarned) {
                this._poseFailureWarned = true;
                warn('Boss检查完整姿势资源加载失败，已回退到中立头身动画');
            }
            if (this._activeRun && !this._paused) {
                this.applyRequestedPose(false);
            }
        });
        if (this._poseLoadPending) {
            this._cancelPosePreload = cancel;
        } else {
            cancel();
        }
    }

    private cancelPoseRequest(): void {
        this._poseLoadGeneration += 1;
        this._cancelPosePreload?.();
        this._cancelPosePreload = null;
        this._poseLoadPending = false;
    }

    private handleLayersReady(): void {
        if (!this._activeRun || this._paused) {
            return;
        }
        if (this._reducedMotion) {
            this.restoreRoot(255);
            this.applyRequestedPose(false);
            return;
        }
        if (this._pendingReaction !== null) {
            const passed = this._pendingReaction;
            this._pendingReaction = null;
            this.restoreRoot(255);
            this.showNeutralLayer();
            this.startOutcomeReaction(passed);
            return;
        }
        if (this._requestedPose !== 'neutral' || this._entranceStarted) {
            this.restoreRoot(255);
            this.applyRequestedPose(false);
            return;
        }
        this.startEntrance();
    }

    private startEntrance(): void {
        const layout = this._layout;
        const opacity = this._opacity;
        const head = this._head;
        const body = this._body;
        if (
            layout === null
            || opacity === null
            || head === null
            || body === null
            || this._entranceStarted
            || !this._activeRun
            || this._paused
        ) {
            return;
        }
        this._entranceStarted = true;
        this.stopAllTweens();
        this.showNeutralLayer();

        const neutralRootPosition = new Vec3(layout.actorX, layout.actorY);
        this.node.setPosition(layout.actorEntryX, layout.actorY);
        this.node.setScale(0.93, 0.93, 1);
        this.node.angle = -7;
        opacity.opacity = 0;

        tween(opacity).to(0.14, { opacity: 255 }).start();
        tween(this.node)
            .to(0.16, {
                position: new Vec3(layout.actorX + 150, layout.actorY + 18),
                scale: new Vec3(0.98, 0.98, 1),
                angle: 5,
            }, { easing: 'quadOut' })
            .to(0.14, {
                position: new Vec3(layout.actorX + 48, layout.actorY - 10),
                scale: new Vec3(1.03, 1.03, 1),
                angle: -3,
            }, { easing: 'quadOut' })
            .to(0.16, {
                position: neutralRootPosition,
                scale: new Vec3(1.015, 1.015, 1),
                angle: 1,
            }, { easing: 'backOut' })
            .to(0.12, { scale: Vec3.ONE, angle: 0 }, { easing: 'quadOut' })
            .start();

        tween(body)
            .delay(0.58)
            .to(0.16, { position: new Vec3(-8, -3), scale: new Vec3(1.012, 1.012, 1) })
            .to(0.07, { position: new Vec3(-6, 0) })
            .to(0.07, { position: new Vec3(-9, -4) })
            .to(0.07, { position: new Vec3(-6, 0) })
            .to(0.26, { position: Vec3.ZERO, scale: Vec3.ONE }, { easing: 'quadOut' })
            .start();

        tween(head)
            .delay(0.58)
            .to(0.16, {
                position: new Vec3(-10, this._headNeutralY - 5),
                scale: new Vec3(1.012, 1.012, 1),
            })
            .to(0.07, { angle: 2 })
            .to(0.07, { angle: -2 })
            .to(0.07, { angle: 2 })
            .to(0.26, {
                position: new Vec3(0, this._headNeutralY),
                scale: Vec3.ONE,
                angle: 0,
            }, { easing: 'quadOut' })
            .start();
    }

    private startOutcomeReaction(passed: boolean): void {
        const head = this._head;
        const body = this._body;
        if (head === null || body === null || this._paused || !this._activeRun) {
            return;
        }
        this._reactionStarted = true;
        this._pendingReaction = null;
        this._requestedPose = 'neutral';
        this.stopLayerTweens();
        this.showNeutralLayer();

        let headTween = tween(head);
        for (const frame of passed ? SUCCESS_HEAD_REACTION : FAILURE_HEAD_REACTION) {
            headTween = this.appendHeadFrame(headTween, frame);
        }
        headTween.start();

        let bodyTween = tween(body);
        for (const frame of passed ? SUCCESS_BODY_REACTION : FAILURE_BODY_REACTION) {
            bodyTween = this.appendBodyFrame(bodyTween, frame);
        }
        bodyTween.start();
    }

    private appendHeadFrame(sequence: Tween<Node>, frame: HeadReactionKeyframe): Tween<Node> {
        return sequence.to(frame.seconds, {
            position: new Vec3(frame.x, this._headNeutralY + frame.y),
            scale: new Vec3(1, frame.scaleY, 1),
            angle: frame.angle,
        }, { easing: frame.easing });
    }

    private appendBodyFrame(sequence: Tween<Node>, frame: BodyReactionKeyframe): Tween<Node> {
        return sequence.to(frame.seconds, {
            position: new Vec3(frame.x, frame.y),
            scale: Vec3.ONE,
            angle: 0,
        }, { easing: frame.easing });
    }

    private applyRequestedPose(animate: boolean): void {
        if (this._requestedPose === 'neutral' || !this._poseAssetsAvailable) {
            this.showNeutralLayer();
            return;
        }
        const frame = getSharedPoseFrame(this._requestedPose);
        if (frame === null || this._poseSprite === null || this._poseLayer === null) {
            this.showNeutralLayer();
            return;
        }

        this.stopPresentationTweens();
        this._poseSprite.spriteFrame = frame;
        if (this._neutralLayer !== null) {
            this._neutralLayer.active = false;
        }
        this._poseLayer.active = true;
        if (this._neutralOpacity !== null) {
            this._neutralOpacity.opacity = 0;
        }
        if (this._poseOpacity !== null) {
            this._poseOpacity.opacity = 255;
        }
        this._poseLayer.setScale(Vec3.ONE);

        if (!animate || this._reducedMotion) {
            return;
        }
        if (this._requestedPose === 'magnifier') {
            this._poseLayer.setScale(0.96, 0.96, 1);
            tween(this._poseLayer)
                .to(BOSS_MAGNIFIER_POP_SECONDS / 2, { scale: new Vec3(1.02, 1.02, 1) }, { easing: 'backOut' })
                .to(BOSS_MAGNIFIER_POP_SECONDS / 2, { scale: Vec3.ONE }, { easing: 'quadOut' })
                .start();
        } else if (this._requestedPose === 'check') {
            this._poseLayer.setScale(0.985, 0.985, 1);
            tween(this._poseLayer)
                .to(0.08, { scale: Vec3.ONE }, { easing: 'backOut' })
                .start();
        }
    }

    private showNeutralLayer(): void {
        this.stopPresentationTweens();
        this.restoreLayers();
        if (this._poseLayer !== null) {
            this._poseLayer.setScale(Vec3.ONE);
            this._poseLayer.active = false;
        }
        if (this._poseOpacity !== null) {
            this._poseOpacity.opacity = 0;
        }
        if (this._neutralLayer !== null) {
            this._neutralLayer.setScale(Vec3.ONE);
            this._neutralLayer.angle = 0;
            this._neutralLayer.active = true;
        }
        if (this._neutralOpacity !== null) {
            this._neutralOpacity.opacity = 255;
        }
    }

    private restoreLayers(): void {
        if (this._body !== null) {
            this._body.setPosition(Vec3.ZERO);
            this._body.setScale(Vec3.ONE);
            this._body.angle = 0;
        }
        if (this._head !== null) {
            this._head.setPosition(0, this._headNeutralY);
            this._head.setScale(Vec3.ONE);
            this._head.angle = 0;
        }
    }

    private restoreRoot(opacity: number): void {
        if (this._layout !== null) {
            this.node.setPosition(this._layout.actorX, this._layout.actorY);
        }
        this.node.setScale(Vec3.ONE);
        this.node.angle = 0;
        if (this._opacity !== null) {
            this._opacity.opacity = opacity;
        }
    }

    private restoreNeutral(opacity: number): void {
        this.restoreRoot(opacity);
        this.showNeutralLayer();
    }

    private stopLayerTweens(): void {
        if (this._body !== null) {
            Tween.stopAllByTarget(this._body);
        }
        if (this._head !== null) {
            Tween.stopAllByTarget(this._head);
        }
    }

    private stopPresentationTweens(): void {
        for (const target of [
            this._neutralLayer,
            this._poseLayer,
            this._poseSpriteNode,
            this._neutralOpacity,
            this._poseOpacity,
        ]) {
            if (target !== null) {
                Tween.stopAllByTarget(target);
            }
        }
    }

    private stopAllTweens(): void {
        Tween.stopAllByTarget(this.node);
        this.stopLayerTweens();
        this.stopPresentationTweens();
        if (this._opacity !== null) {
            Tween.stopAllByTarget(this._opacity);
        }
    }
}
