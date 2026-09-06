import {
    _decorator,
    Component,
    EventTouch,
    Node,
    Tween,
    tween,
    Vec2,
    Vec3,
} from 'cc';
import { AudioFeedback } from '../core/AudioFeedback';
import { WorkItemConfig } from '../data/LevelTypes';
import { requireTransform } from '../ui/UIFactory';
import { WorkItemVisual } from '../ui/WorkItemVisual';
import { DropZone } from './DropZone';

const { ccclass } = _decorator;

export type InteractionGuard = () => boolean;
export type WorkItemCompleted = (itemId: string) => void;
export type WorkItemMessage = (message: string, success: boolean) => void;

@ccclass('WorkItem')
export class WorkItem extends Component {
    private readonly _homePosition = new Vec3();
    private readonly _snapPosition = new Vec3();
    private readonly _normalScale = new Vec3(1, 1, 1);
    private readonly _selectedScale = new Vec3(1.06, 1.06, 1);
    private readonly _revealScale = new Vec3(0.82, 0.82, 1);
    private readonly _touchDelta = new Vec2();
    private readonly _shakeLeft = new Vec3();
    private readonly _shakeRight = new Vec3();
    private _config: WorkItemConfig | null = null;
    private _zones: readonly DropZone[] = [];
    private _canInteract: InteractionGuard | null = null;
    private _onCompleted: WorkItemCompleted | null = null;
    private _onMessage: WorkItemMessage | null = null;
    private _audio: AudioFeedback | null = null;
    private _visual: WorkItemVisual | null = null;
    private _highlightedZone: DropZone | null = null;
    private _formalVisuals = false;
    private _completed = false;
    private _pressed = false;
    private _clickProgress = 0;

    public get itemId(): string {
        return this._config?.id ?? '';
    }

    public configure(
        config: WorkItemConfig,
        zones: readonly DropZone[],
        canInteract: InteractionGuard,
        onCompleted: WorkItemCompleted,
        onMessage: WorkItemMessage,
        audio: AudioFeedback,
        formalVisuals = false,
    ): void {
        this._config = config;
        this._zones = zones;
        this._canInteract = canInteract;
        this._onCompleted = onCompleted;
        this._onMessage = onMessage;
        this._audio = audio;
        this._formalVisuals = formalVisuals;
        requireTransform(this.node).setContentSize(config.size.width, config.size.height);
        this.node.setPosition(config.initialPosition.x, config.initialPosition.y);
        this._homePosition.set(this.node.position);
        this._visual = this.node.addComponent(WorkItemVisual);
        this._visual.initialize(config, formalVisuals);
        this.resetItem();
    }

    public setAvailable(available: boolean): void {
        const shouldReveal = available && !this.node.active;
        this.node.active = available;
        if (available) {
            this.resetItem();
            if (shouldReveal) {
                this.node.setScale(this._revealScale);
                tween(this.node)
                    .to(0.22, { scale: this._normalScale }, { easing: 'backOut' })
                    .start();
            }
        }
    }

    public resetItem(): void {
        Tween.stopAllByTarget(this.node);
        this._completed = false;
        this._pressed = false;
        this._clickProgress = 0;
        this.clearTargetHighlight();
        this.node.setScale(this._normalScale);
        this.node.setPosition(this._homePosition);
        this._visual?.render(this._clickProgress, false, false);
    }

    public stopInteraction(): void {
        if (!this._pressed || this._completed) {
            return;
        }
        this._pressed = false;
        this.clearTargetHighlight();
        this.returnHome();
    }

    protected override onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    protected override onDisable(): void {
        this.removeListeners();
        Tween.stopAllByTarget(this.node);
        this._pressed = false;
        this.clearTargetHighlight();
        this.node.setScale(this._normalScale);
        this.node.setPosition(this._homePosition);
    }

    protected override onDestroy(): void {
        this.removeListeners();
        Tween.stopAllByTarget(this.node);
        this._canInteract = null;
        this._onCompleted = null;
        this._onMessage = null;
        this._audio = null;
        this._visual = null;
        this.clearTargetHighlight();
    }

    private onTouchStart(event: EventTouch): void {
        const config = this._config;
        if (config === null || config.interaction === 'static' || this._completed || !this._canInteract?.()) {
            return;
        }
        event.propagationStopped = true;
        this._pressed = true;
        this.node.setSiblingIndex(this.node.parent?.children.length ?? 0);
        Tween.stopAllByTarget(this.node);
        tween(this.node).to(0.07, { scale: this._selectedScale }).start();
        this._visual?.render(this._clickProgress, false, true);
        this._audio?.play('item-picked');
    }

    private onTouchMove(event: EventTouch): void {
        if (!this._pressed || this._config?.interaction !== 'drag' || !this._canInteract?.()) {
            return;
        }
        event.propagationStopped = true;
        event.getUIDelta(this._touchDelta);
        this.node.setPosition(
            this.node.position.x + this._touchDelta.x,
            this.node.position.y + this._touchDelta.y,
            this.node.position.z,
        );
        this.refreshTargetHighlight();
    }

    private onTouchEnd(event: EventTouch): void {
        const config = this._config;
        if (!this._pressed || config === null) {
            return;
        }
        event.propagationStopped = true;
        this._pressed = false;
        this.clearTargetHighlight();
        if (!this._canInteract?.()) {
            this.returnHome();
            return;
        }
        if (config.interaction === 'click') {
            this.advanceClickItem();
            return;
        }

        const zone = this.findCorrectZone();
        if (zone === null || this.node.parent === null) {
            this._audio?.play('item-wrong');
            this._onMessage?.(config.wrongDropFeedback ?? '位置不对，再试一次', false);
            this.returnHome();
            return;
        }

        this._completed = true;
        zone.copySnapPosition(this.node.parent, this._snapPosition);
        if (config.completeZoneOnDrop) {
            zone.markCompleted();
        }
        Tween.stopAllByTarget(this.node);
        this._visual?.render(this._clickProgress, true, false);
        tween(this.node)
            .to(0.16, { position: this._snapPosition, scale: this._normalScale }, { easing: 'quadOut' })
            .call(() => {
                if (!config.completeZoneOnDrop) {
                    this._visual?.hideCollectedVisual();
                }
            })
            .start();
        this.finishAction();
    }

    private onTouchCancel(): void {
        if (!this._pressed) {
            return;
        }
        this._pressed = false;
        this.clearTargetHighlight();
        this.returnHome();
    }

    private advanceClickItem(): void {
        const config = this._config;
        if (config === null) {
            return;
        }
        const requiredClicks = Math.max(1, config.clickStates.length - 1);
        this._clickProgress = Math.min(requiredClicks, this._clickProgress + 1);
        const completed = this._clickProgress >= requiredClicks;
        this._completed = completed;
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.1, { scale: this._normalScale })
            .call(() => this._visual?.render(this._clickProgress, completed, false))
            .start();
        if (completed) {
            this.finishAction();
            return;
        }
        const feedback = config.progressFeedbacks[this._clickProgress - 1] ?? '还需要继续操作';
        this._onMessage?.(feedback, false);
    }

    private finishAction(): void {
        const config = this._config;
        if (config?.actionId === undefined) {
            return;
        }
        this._audio?.play('item-correct');
        this._onMessage?.(config.completionFeedback ?? '任务完成', true);
        this._onCompleted?.(config.id);
    }

    private findCorrectZone(): DropZone | null {
        const targetZoneId = this._config?.targetZoneId;
        if (targetZoneId === undefined) {
            return null;
        }
        return this._zones.find((zone) => zone.zoneId === targetZoneId && zone.contains(this.node)) ?? null;
    }

    private returnHome(): void {
        Tween.stopAllByTarget(this.node);
        this._visual?.render(this._clickProgress, false, false);
        if (!this._formalVisuals) {
            tween(this.node)
                .to(0.2, { position: this._homePosition, scale: this._normalScale }, { easing: 'quadOut' })
                .start();
            return;
        }
        this._shakeLeft.set(this.node.position.x - 10, this.node.position.y, this.node.position.z);
        this._shakeRight.set(this.node.position.x + 10, this.node.position.y, this.node.position.z);
        tween(this.node)
            .to(0.045, { position: this._shakeRight })
            .to(0.06, { position: this._shakeLeft })
            .to(0.045, { position: this._shakeRight })
            .to(0.18, { position: this._homePosition, scale: this._normalScale }, { easing: 'quadOut' })
            .start();
    }

    private refreshTargetHighlight(): void {
        const targetZoneId = this._config?.targetZoneId;
        const highlighted = targetZoneId === undefined
            ? null
            : this._zones.find((zone) => zone.zoneId === targetZoneId && zone.isNear(this.node, 34)) ?? null;
        if (highlighted === this._highlightedZone) {
            return;
        }
        this.clearTargetHighlight();
        this._highlightedZone = highlighted;
        this._highlightedZone?.setHighlighted(true);
    }

    private clearTargetHighlight(): void {
        this._highlightedZone?.setHighlighted(false);
        this._highlightedZone = null;
    }

    private removeListeners(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }
}
