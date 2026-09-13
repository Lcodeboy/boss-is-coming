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
    BOSS_MAGNIFIER_POP_OUT_SECONDS,
    BOSS_MAGNIFIER_PREPARE_SECONDS,
    BOSS_MAGNIFIER_RETURN_PREPARE_SECONDS,
    BOSS_MAGNIFIER_SETTLE_SECONDS,
    BOSS_POSE_SWAP_OPACITY,
    BOSS_POSE_SWAP_OUT_SECONDS,
    BOSS_POSE_TRANSITION_SECONDS,
    BodyReactionKeyframe,
    BossInspectionPose,
    BossPoseTransitionStyle,
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
export const BOSS_INSPECTION_POSE_RESOURCE_PATHS: Readonly<Record<BossInspectionPose, string>> = {
    neutral: 'characters/boss-inspector/spriteFrame',
    check: 'characters/boss-inspector-check/spriteFrame',
    magnifier: 'characters/boss-inspector-magnifier/spriteFrame',
    pass: 'characters/boss-inspector-pass/spriteFrame',
    fail: 'characters/boss-inspector-fail/spriteFrame',
};

const BOSS_INSPECTION_POSES: readonly BossInspectionPose[] = [
    'neutral',
    'check',
    'magnifier',
    'pass',
    'fail',
];
const SOURCE_HEIGHT = 1536;
const HEAD_NECK_ANCHOR_Y = (SOURCE_HEIGHT - BOSS_HEAD_NECK_PIVOT_SOURCE_Y) / SOURCE_HEIGHT;

type PoseLoadState = 'idle' | 'loading' | 'ready' | 'failed';
type PoseLoadListener = (available: boolean) => void;

interface PoseDisplay {
    readonly node: Node;
    readonly sprite: Sprite;
    readonly opacity: UIOpacity;
}

let sharedPoseLoadState: PoseLoadState = 'idle';
let sharedPoseFrames: Partial<Record<BossInspectionPose, SpriteFrame>> = {};
let sharedPoseFailureWarningShown = false;
const sharedPoseLoadListeners = new Set<PoseLoadListener>();

/** 五张正式状态图在同一 JS 会话中只加载一次；任一失败都会稳定回退到拆分中立层。 */
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
        let remaining = BOSS_INSPECTION_POSES.length;
        let failed = false;
        for (const pose of BOSS_INSPECTION_POSES) {
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
                        if (!sharedPoseFailureWarningShown) {
                            sharedPoseFailureWarningShown = true;
                            warn('Boss检查正式姿势资源加载失败，已回退到中立头身动画');
                        }
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

function getSharedPoseFrame(pose: BossInspectionPose): SpriteFrame | null {
    return sharedPoseLoadState === 'ready' ? sharedPoseFrames[pose] ?? null : null;
}

@ccclass('BossInspectionActor')
export class BossInspectionActor extends Component {
    private _neutralLayer: Node | null = null;
    private _poseLayer: Node | null = null;
    private _poseCurrent: PoseDisplay | null = null;
    private _poseNext: PoseDisplay | null = null;
    private _body: Node | null = null;
    private _head: Node | null = null;
    private _opacity: UIOpacity | null = null;
    private _neutralOpacity: UIOpacity | null = null;
    private _layout: InspectionAnimationLayout | null = null;
    private _loadedLayerCount = 0;
    private _headNeutralY = 0;
    private _activeRun = false;
    private _reducedMotion = false;
    private _paused = false;
    private _entranceStarted = false;
    private _reactionStarted = false;
    private _reactionComplete = false;
    private _pendingReaction: boolean | null = null;
    private _pendingFinalPose = false;
    private _lastOutcomePassed: boolean | null = null;
    private _currentPose: BossInspectionPose = 'neutral';
    private _requestedPose: BossInspectionPose = 'neutral';
    private _poseTransitionActive = false;
    private _poseAssetsAvailable = false;
    private _poseLoadPending = false;
    private _cancelPosePreload: (() => void) | null = null;
    private _poseLoadGeneration = 0;
    private _runGeneration = 0;
    private _transitionGeneration = 0;
    private _reactionGeneration = 0;
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
        this._poseCurrent = this.createPoseDisplay('PoseCurrent', layout);
        this._poseNext = this.createPoseDisplay('PoseNext', layout);
        this._neutralOpacity = this._neutralLayer.addComponent(UIOpacity);
        this._opacity = this.node.addComponent(UIOpacity);
        this._opacity.opacity = 0;
        this.setStablePose('neutral');
        this.requestPoseAssets();
    }

    public play(reducedMotion: boolean): number {
        this.cancelPoseRequest();
        this.stopAllTweens();
        this._runGeneration += 1;
        this._reactionGeneration += 1;
        this._activeRun = true;
        this._reducedMotion = reducedMotion;
        this._paused = false;
        this._entranceStarted = false;
        this._reactionStarted = false;
        this._reactionComplete = false;
        this._pendingReaction = null;
        this._pendingFinalPose = false;
        this._lastOutcomePassed = null;
        this._requestedPose = reducedMotion ? 'check' : 'neutral';
        this.restoreRoot(0);
        this.setStablePose('neutral');
        this.requestPoseAssets();

        if (reducedMotion) {
            this.restoreRoot(255);
            this.applyRequestedPose();
        } else if (this.layersReady) {
            this.startEntrance();
        }
        return this._runGeneration;
    }

    /** 先收缩当前姿势，再在同一回调内原子换图；任何时刻只有一套角色轮廓可见。 */
    public transitionPoseWithoutGhost(
        targetPose: BossInspectionPose,
        durationSeconds: number,
        transitionStyle: BossPoseTransitionStyle,
        generationToken: number = this._runGeneration,
    ): void {
        if (
            !this.canMutateRun(generationToken)
            || this._reducedMotion
            || durationSeconds < 0
        ) {
            return;
        }

        if (this._poseTransitionActive) {
            const interruptedTarget = this._requestedPose;
            this.setStablePose(interruptedTarget);
        }
        this._requestedPose = targetPose;
        if (targetPose !== 'neutral') {
            this._entranceStarted = true;
            this.stopLayerTweens();
            this.restoreLayers();
            if (!this._poseAssetsAvailable || getSharedPoseFrame(targetPose) === null) {
                this.setStablePose('neutral');
                return;
            }
        }
        if (targetPose === this._currentPose || durationSeconds === 0) {
            this.setStablePose(targetPose);
            this.finishPendingReactionAfterNeutral(targetPose);
            return;
        }

        const currentDisplay = this._poseCurrent;
        const nextDisplay = this._poseNext;
        const neutralLayer = this._neutralLayer;
        const neutralOpacity = this._neutralOpacity;
        if (currentDisplay === null || nextDisplay === null || neutralLayer === null || neutralOpacity === null) {
            return;
        }

        this.cancelPoseTransition();
        this._poseTransitionActive = true;
        const transitionToken = this._transitionGeneration;
        const swapOutSeconds = transitionStyle === 'checkToMagnifier'
            ? BOSS_MAGNIFIER_PREPARE_SECONDS
            : transitionStyle === 'magnifierToCheck'
                ? BOSS_MAGNIFIER_RETURN_PREPARE_SECONDS
                : Math.min(BOSS_POSE_SWAP_OUT_SECONDS, durationSeconds / 2);
        const contractedScale = transitionStyle === 'checkToMagnifier'
            || (targetPose === 'check' && this._currentPose === 'neutral')
            ? 0.97
            : 0.98;

        if (targetPose !== 'neutral') {
            const frame = getSharedPoseFrame(targetPose);
            if (frame === null) {
                this.setStablePose('neutral');
                this.finishPendingReactionAfterNeutral('neutral');
                return;
            }
            nextDisplay.sprite.spriteFrame = frame;
            nextDisplay.node.setScale(contractedScale, contractedScale, 1);
            nextDisplay.opacity.opacity = BOSS_POSE_SWAP_OPACITY;
            nextDisplay.node.active = false;
        }

        const outgoingNode = this._currentPose === 'neutral'
            ? neutralLayer
            : currentDisplay.node;
        const outgoingOpacity = this._currentPose === 'neutral'
            ? neutralOpacity
            : currentDisplay.opacity;
        tween(outgoingOpacity)
            .to(swapOutSeconds, { opacity: BOSS_POSE_SWAP_OPACITY }, { easing: 'quadInOut' })
            .start();
        tween(outgoingNode)
            .to(swapOutSeconds, {
                scale: new Vec3(contractedScale, contractedScale, 1),
            }, { easing: 'quadInOut' })
            .call(() => this.swapPoseInOneFrame(
                targetPose,
                durationSeconds,
                swapOutSeconds,
                contractedScale,
                transitionStyle,
                generationToken,
                transitionToken,
            ))
            .start();
    }

    public playResultReaction(
        passed: boolean,
        reducedMotion: boolean,
        generationToken: number = this._runGeneration,
    ): void {
        if (!this.canMutateRun(generationToken) || this._reactionStarted) {
            return;
        }
        this._lastOutcomePassed = passed;
        if (reducedMotion || this._reducedMotion) {
            this._reactionStarted = true;
            this._reactionComplete = true;
            this._pendingReaction = null;
            this.stopLayerTweens();
            this.restoreLayers();
            this._requestedPose = passed ? 'pass' : 'fail';
            this.applyRequestedPose();
            return;
        }
        this._requestedPose = 'neutral';
        if (this._poseTransitionActive) {
            this._pendingReaction = passed;
            return;
        }
        if (this._currentPose !== 'neutral') {
            this.setStablePose('neutral');
        }
        if (!this.layersReady) {
            this._pendingReaction = passed;
            return;
        }
        this.startOutcomeReaction(passed);
    }

    public showFinalPose(generationToken: number = this._runGeneration): void {
        if (
            !this.canMutateRun(generationToken)
            || this._reducedMotion
            || this._lastOutcomePassed === null
        ) {
            return;
        }
        if (!this._reactionStarted) {
            this._pendingReaction = null;
            this._reactionComplete = true;
        }
        if (!this._reactionComplete) {
            this._pendingFinalPose = true;
            return;
        }
        this.startFinalPoseTransition(generationToken);
    }

    public setPaused(paused: boolean): void {
        if (paused === this._paused) {
            return;
        }
        this._paused = paused;
        if (!paused) {
            if (!this._activeRun) {
                return;
            }
            this.restoreRoot(255);
            if (this._pendingFinalPose && this._lastOutcomePassed !== null) {
                this._pendingFinalPose = false;
                this._requestedPose = this._lastOutcomePassed ? 'pass' : 'fail';
            }
            this.applyRequestedPose();
            return;
        }

        if (this._activeRun) {
            this._entranceStarted = true;
        }
        this._pendingReaction = null;
        if (this._reactionStarted) {
            this._reactionComplete = true;
        }
        this.stopAllTweens();
        this.restoreRoot(this._activeRun ? 255 : 0);
        this.restoreLayers();
        this.setStablePose('neutral');
    }

    public reset(): void {
        this._runGeneration += 1;
        this._reactionGeneration += 1;
        this.cancelPoseRequest();
        this._activeRun = false;
        this._reducedMotion = false;
        this._paused = false;
        this._entranceStarted = false;
        this._reactionStarted = false;
        this._reactionComplete = false;
        this._pendingReaction = null;
        this._pendingFinalPose = false;
        this._lastOutcomePassed = null;
        this._requestedPose = 'neutral';
        this.stopAllTweens();
        this.restoreRoot(0);
        this.setStablePose('neutral');
    }

    protected override onDisable(): void {
        this.reset();
    }

    protected override onDestroy(): void {
        this._disposed = true;
        this.reset();
        this._neutralLayer = null;
        this._poseLayer = null;
        this._poseCurrent = null;
        this._poseNext = null;
        this._body = null;
        this._head = null;
        this._opacity = null;
        this._neutralOpacity = null;
        this._layout = null;
    }

    private get layersReady(): boolean {
        return this._loadedLayerCount === 2;
    }

    private createPoseDisplay(name: string, layout: InspectionAnimationLayout): PoseDisplay {
        if (this._poseLayer === null) {
            throw new Error('PoseLayer 尚未初始化');
        }
        const node = createUiNode(this._poseLayer, name, layout.actorWidth, layout.actorHeight);
        const sprite = node.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.active = false;
        return { node, sprite, opacity };
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
            if (this._activeRun && !this._paused && !this._poseTransitionActive) {
                this.applyRequestedPose();
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
            this.applyRequestedPose();
            return;
        }
        if (this._pendingReaction !== null && !this._poseTransitionActive) {
            const passed = this._pendingReaction;
            this._pendingReaction = null;
            this.restoreRoot(255);
            this.setStablePose('neutral');
            this.startOutcomeReaction(passed);
            return;
        }
        if (this._requestedPose !== 'neutral' || this._entranceStarted) {
            this.restoreRoot(255);
            this.applyRequestedPose();
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
        this.setStablePose('neutral');

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
        this._reactionComplete = false;
        this._pendingReaction = null;
        this._requestedPose = 'neutral';
        this.stopLayerTweens();
        this.setStablePose('neutral');
        const runGeneration = this._runGeneration;
        const reactionGeneration = ++this._reactionGeneration;

        let headTween = tween(head);
        for (const frame of passed ? SUCCESS_HEAD_REACTION : FAILURE_HEAD_REACTION) {
            headTween = this.appendHeadFrame(headTween, frame);
        }
        headTween
            .call(() => this.handleReactionComplete(runGeneration, reactionGeneration))
            .start();

        let bodyTween = tween(body);
        for (const frame of passed ? SUCCESS_BODY_REACTION : FAILURE_BODY_REACTION) {
            bodyTween = this.appendBodyFrame(bodyTween, frame);
        }
        bodyTween.start();
    }

    private handleReactionComplete(runGeneration: number, reactionGeneration: number): void {
        if (
            !this.canMutateRun(runGeneration)
            || reactionGeneration !== this._reactionGeneration
        ) {
            return;
        }
        this.restoreLayers();
        this._reactionComplete = true;
        if (this._pendingFinalPose) {
            this.startFinalPoseTransition(runGeneration);
        }
    }

    private startFinalPoseTransition(generationToken: number): void {
        if (this._lastOutcomePassed === null || !this.canMutateRun(generationToken)) {
            return;
        }
        this._pendingFinalPose = false;
        this.stopLayerTweens();
        this.restoreLayers();
        this.transitionPoseWithoutGhost(
            this._lastOutcomePassed ? 'pass' : 'fail',
            BOSS_POSE_TRANSITION_SECONDS,
            'singleSwap',
            generationToken,
        );
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

    private swapPoseInOneFrame(
        targetPose: BossInspectionPose,
        durationSeconds: number,
        swapOutSeconds: number,
        contractedScale: number,
        transitionStyle: BossPoseTransitionStyle,
        runGeneration: number,
        transitionGeneration: number,
    ): void {
        if (!this.canContinueTransition(runGeneration, transitionGeneration)) {
            return;
        }
        const currentDisplay = this._poseCurrent;
        const nextDisplay = this._poseNext;
        const neutralLayer = this._neutralLayer;
        const neutralOpacity = this._neutralOpacity;
        if (
            currentDisplay === null
            || nextDisplay === null
            || neutralOpacity === null
            || neutralLayer === null
        ) {
            return;
        }

        if (targetPose === 'neutral') {
            this.restoreLayers();
            neutralLayer.setScale(contractedScale, contractedScale, 1);
            neutralOpacity.opacity = BOSS_POSE_SWAP_OPACITY;

            // 同一逻辑帧内先关闭旧完整姿势，再启用已复位的NeutralLayer。
            currentDisplay.node.active = false;
            if (this._poseLayer !== null) {
                this._poseLayer.active = false;
            }
            neutralLayer.active = true;
        } else {
            const frame = getSharedPoseFrame(targetPose);
            if (frame === null) {
                this.setStablePose('neutral');
                this.finishPendingReactionAfterNeutral('neutral');
                return;
            }

            nextDisplay.sprite.spriteFrame = frame;
            nextDisplay.node.setScale(contractedScale, contractedScale, 1);
            nextDisplay.opacity.opacity = BOSS_POSE_SWAP_OPACITY;

            // 旧层与新层不会在任何渲染帧同时可见。
            if (this._currentPose === 'neutral') {
                neutralLayer.active = false;
            } else {
                currentDisplay.node.active = false;
            }
            if (this._poseLayer !== null) {
                this._poseLayer.active = true;
            }
            nextDisplay.node.active = true;
            this._poseCurrent = nextDisplay;
            this._poseNext = currentDisplay;
        }

        this._currentPose = targetPose;
        const incomingNode = targetPose === 'neutral'
            ? neutralLayer
            : this._poseCurrent?.node ?? null;
        const incomingOpacity = targetPose === 'neutral'
            ? neutralOpacity
            : this._poseCurrent?.opacity ?? null;
        if (incomingNode === null || incomingOpacity === null) {
            return;
        }

        const completeTransition = (): void => {
            this.finishPoseTransitionWithoutGhost(
                targetPose,
                runGeneration,
                transitionGeneration,
            );
        };
        if (transitionStyle === 'checkToMagnifier') {
            tween(incomingOpacity)
                .to(BOSS_MAGNIFIER_POP_OUT_SECONDS, { opacity: 255 }, { easing: 'quadOut' })
                .start();
            tween(incomingNode)
                .to(BOSS_MAGNIFIER_POP_OUT_SECONDS, {
                    scale: new Vec3(1.025, 1.025, 1),
                }, { easing: 'quadOut' })
                .to(BOSS_MAGNIFIER_SETTLE_SECONDS, { scale: Vec3.ONE }, { easing: 'quadOut' })
                .call(completeTransition)
                .start();
        } else {
            const recoverySeconds = Math.max(0.01, durationSeconds - swapOutSeconds);
            tween(incomingOpacity)
                .to(recoverySeconds, { opacity: 255 }, { easing: 'quadOut' })
                .start();
            tween(incomingNode)
                .to(recoverySeconds, { scale: Vec3.ONE }, { easing: 'quadOut' })
                .call(completeTransition)
                .start();
        }
    }

    private finishPoseTransitionWithoutGhost(
        targetPose: BossInspectionPose,
        runGeneration: number,
        transitionGeneration: number,
    ): void {
        if (!this.canContinueTransition(runGeneration, transitionGeneration)) {
            return;
        }
        const currentDisplay = this._poseCurrent;
        const nextDisplay = this._poseNext;
        const neutralLayer = this._neutralLayer;
        if (currentDisplay === null || nextDisplay === null || neutralLayer === null) {
            return;
        }

        if (targetPose === 'neutral') {
            neutralLayer.setScale(Vec3.ONE);
            if (this._neutralOpacity !== null) {
                this._neutralOpacity.opacity = 255;
            }
            this.hidePoseDisplay(currentDisplay);
            this.hidePoseDisplay(nextDisplay);
            if (this._poseLayer !== null) {
                this._poseLayer.active = false;
            }
        } else {
            currentDisplay.node.setScale(Vec3.ONE);
            currentDisplay.opacity.opacity = 255;
            currentDisplay.node.active = true;
            this.hidePoseDisplay(nextDisplay);
            neutralLayer.active = false;
        }
        this._poseTransitionActive = false;
        this.finishPendingReactionAfterNeutral(targetPose);
    }

    private finishPendingReactionAfterNeutral(pose: BossInspectionPose): void {
        if (pose !== 'neutral' || this._pendingReaction === null || !this.layersReady) {
            return;
        }
        const passed = this._pendingReaction;
        this._pendingReaction = null;
        this.startOutcomeReaction(passed);
    }

    private applyRequestedPose(): void {
        if (this._requestedPose !== 'neutral' && !this._poseAssetsAvailable) {
            this.setStablePose('neutral');
            return;
        }
        this.setStablePose(this._requestedPose);
    }

    private setStablePose(pose: BossInspectionPose): void {
        this.cancelPoseTransition();
        this.restoreLayers();
        const currentDisplay = this._poseCurrent;
        const nextDisplay = this._poseNext;
        const frame = pose === 'neutral' ? null : getSharedPoseFrame(pose);
        const stablePose = pose === 'neutral' || frame !== null ? pose : 'neutral';
        if (this._neutralLayer !== null) {
            this._neutralLayer.setScale(Vec3.ONE);
            this._neutralLayer.angle = 0;
            this._neutralLayer.active = stablePose === 'neutral';
        }
        if (this._neutralOpacity !== null) {
            this._neutralOpacity.opacity = 255;
        }
        if (currentDisplay !== null && stablePose !== 'neutral' && frame !== null) {
            currentDisplay.sprite.spriteFrame = frame;
            currentDisplay.node.setScale(Vec3.ONE);
            currentDisplay.opacity.opacity = 255;
            currentDisplay.node.active = true;
        } else if (currentDisplay !== null) {
            this.hidePoseDisplay(currentDisplay);
        }
        if (nextDisplay !== null) {
            this.hidePoseDisplay(nextDisplay);
        }
        if (this._poseLayer !== null) {
            this._poseLayer.active = stablePose !== 'neutral';
        }
        this._currentPose = stablePose;
    }

    private hidePoseDisplay(display: PoseDisplay): void {
        Tween.stopAllByTarget(display.node);
        Tween.stopAllByTarget(display.opacity);
        display.node.setScale(Vec3.ONE);
        display.opacity.opacity = 0;
        display.sprite.spriteFrame = null;
        display.node.active = false;
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

    private canMutateRun(generationToken: number): boolean {
        return this._activeRun
            && !this._paused
            && !this._disposed
            && generationToken === this._runGeneration
            && isValid(this.node, true);
    }

    private canContinueTransition(runGeneration: number, transitionGeneration: number): boolean {
        return this.canMutateRun(runGeneration)
            && transitionGeneration === this._transitionGeneration
            && this._poseTransitionActive;
    }

    private stopLayerTweens(): void {
        if (this._body !== null) {
            Tween.stopAllByTarget(this._body);
        }
        if (this._head !== null) {
            Tween.stopAllByTarget(this._head);
        }
    }

    private cancelPoseTransition(): void {
        this._transitionGeneration += 1;
        this._poseTransitionActive = false;
        if (this._neutralLayer !== null) {
            Tween.stopAllByTarget(this._neutralLayer);
        }
        if (this._neutralOpacity !== null) {
            Tween.stopAllByTarget(this._neutralOpacity);
        }
        for (const display of [this._poseCurrent, this._poseNext]) {
            if (display !== null) {
                Tween.stopAllByTarget(display.node);
                Tween.stopAllByTarget(display.opacity);
            }
        }
    }

    private stopAllTweens(): void {
        Tween.stopAllByTarget(this.node);
        this.stopLayerTweens();
        this.cancelPoseTransition();
        if (this._poseLayer !== null) {
            Tween.stopAllByTarget(this._poseLayer);
        }
        if (this._opacity !== null) {
            Tween.stopAllByTarget(this._opacity);
        }
    }
}
