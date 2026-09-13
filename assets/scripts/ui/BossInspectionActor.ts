import {
    _decorator,
    Component,
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
    BodyReactionKeyframe,
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

const SOURCE_HEIGHT = 1536;
const HEAD_NECK_ANCHOR_Y = (SOURCE_HEIGHT - BOSS_HEAD_NECK_PIVOT_SOURCE_Y) / SOURCE_HEIGHT;

@ccclass('BossInspectionActor')
export class BossInspectionActor extends Component {
    private _body: Node | null = null;
    private _head: Node | null = null;
    private _opacity: UIOpacity | null = null;
    private _layout: InspectionAnimationLayout | null = null;
    private _loadedLayerCount = 0;
    private _headNeutralY = 0;
    private _activeRun = false;
    private _reducedMotion = false;
    private _paused = false;
    private _entranceStarted = false;
    private _reactionStarted = false;
    private _pendingReaction: boolean | null = null;
    private _disposed = false;

    public initialize(layout: InspectionAnimationLayout): void {
        this._layout = layout;
        requireTransform(this.node).setContentSize(layout.actorWidth, layout.actorHeight);
        this.node.setPosition(layout.actorX, layout.actorY);
        if (this._body !== null || this._head !== null) {
            return;
        }

        this._body = createUiNode(this.node, 'Body', layout.actorWidth, layout.actorHeight);
        this._head = createUiNode(this.node, 'Head', layout.actorWidth, layout.actorHeight);
        requireTransform(this._head).setAnchorPoint(0.5, HEAD_NECK_ANCHOR_Y);
        this._headNeutralY = (HEAD_NECK_ANCHOR_Y - 0.5) * layout.actorHeight;
        this._head.setPosition(0, this._headNeutralY);
        this.attachLayer(this._body, BOSS_INSPECTOR_BODY_RESOURCE_PATH);
        this.attachLayer(this._head, BOSS_INSPECTOR_HEAD_RESOURCE_PATH);

        this._opacity = this.node.addComponent(UIOpacity);
        this._opacity.opacity = 0;
    }

    public play(reducedMotion: boolean): void {
        this.stopAllTweens();
        this._activeRun = true;
        this._reducedMotion = reducedMotion;
        this._paused = false;
        this._entranceStarted = false;
        this._reactionStarted = false;
        this._pendingReaction = null;
        this.restoreNeutral(0);

        if (reducedMotion) {
            // 减少动态效果下角色直接出现在中立姿态，不创建 Root、Body 或 Head Tween。
            this.restoreNeutral(255);
        } else if (this.layersReady) {
            this.startEntrance();
        }
    }

    public playResultReaction(passed: boolean, reducedMotion: boolean): void {
        if (!this._activeRun || this._reactionStarted) {
            return;
        }
        if (reducedMotion || this._reducedMotion || this._paused) {
            this._reactionStarted = true;
            this._pendingReaction = null;
            this.stopLayerTweens();
            this.restoreLayers();
            return;
        }
        if (!this.layersReady) {
            this._pendingReaction = passed;
            return;
        }
        this.startOutcomeReaction(passed);
    }

    public setPaused(paused: boolean): void {
        if (paused === this._paused) {
            return;
        }
        this._paused = paused;
        if (!paused) {
            return;
        }

        // 进入后台时主动停止而不是保留 Tween，恢复后只保留无残留的中立姿态。
        const visibleOpacity = this._activeRun ? 255 : 0;
        if (this._activeRun) {
            this._entranceStarted = true;
        }
        this._pendingReaction = null;
        this.stopAllTweens();
        this.restoreNeutral(visibleOpacity);
    }

    public reset(): void {
        this._activeRun = false;
        this._reducedMotion = false;
        this._paused = false;
        this._entranceStarted = false;
        this._reactionStarted = false;
        this._pendingReaction = null;
        this.stopAllTweens();
        this.restoreNeutral(0);
    }

    protected override onDisable(): void {
        this.reset();
    }

    protected override onDestroy(): void {
        this._disposed = true;
        this.reset();
        this._body = null;
        this._head = null;
        this._opacity = null;
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
            if (this._disposed) {
                return;
            }
            if (error) {
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

    private handleLayersReady(): void {
        if (!this._activeRun || this._paused) {
            return;
        }
        if (this._reducedMotion) {
            this.restoreNeutral(255);
            return;
        }
        if (this._pendingReaction !== null) {
            const passed = this._pendingReaction;
            this._pendingReaction = null;
            this.restoreNeutral(255);
            this.startOutcomeReaction(passed);
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
        this.restoreLayers();

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
        this.stopLayerTweens();
        this.restoreLayers();

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

    private restoreNeutral(opacity: number): void {
        if (this._layout !== null) {
            this.node.setPosition(this._layout.actorX, this._layout.actorY);
        }
        this.node.setScale(Vec3.ONE);
        this.node.angle = 0;
        this.restoreLayers();
        if (this._opacity !== null) {
            this._opacity.opacity = opacity;
        }
    }

    private stopLayerTweens(): void {
        if (this._body !== null) {
            Tween.stopAllByTarget(this._body);
        }
        if (this._head !== null) {
            Tween.stopAllByTarget(this._head);
        }
    }

    private stopAllTweens(): void {
        Tween.stopAllByTarget(this.node);
        this.stopLayerTweens();
        if (this._opacity !== null) {
            Tween.stopAllByTarget(this._opacity);
        }
    }
}
