import { _decorator, Component, EventTouch, Node, Tween, tween, Vec3 } from 'cc';
import { VisualTheme } from './VisualTheme';

const { ccclass } = _decorator;

export type ButtonAction = () => void;

@ccclass('ActionButton')
export class ActionButton extends Component {
    private readonly _normalScale = new Vec3(1, 1, 1);
    private readonly _pressedScale = new Vec3(0.955, 0.955, 1);
    private _action: ButtonAction | null = null;
    private _interactable = true;

    public configure(action: ButtonAction): void {
        this._action = action;
    }

    public setInteractable(interactable: boolean): void {
        this._interactable = interactable;
        if (!interactable) {
            this.restoreScale();
        }
    }

    protected override onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    protected override onDisable(): void {
        this.removeListeners();
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this._normalScale);
    }

    protected override onDestroy(): void {
        this.removeListeners();
        this._action = null;
        Tween.stopAllByTarget(this.node);
    }

    private onTouchStart(event: EventTouch): void {
        if (!this._interactable) {
            return;
        }
        event.propagationStopped = true;
        Tween.stopAllByTarget(this.node);
        tween(this.node).to(VisualTheme.motion.pressSeconds, { scale: this._pressedScale }).start();
    }

    private onTouchEnd(event: EventTouch): void {
        if (!this._interactable) {
            return;
        }
        event.propagationStopped = true;
        this.restoreScale();
        this._action?.();
    }

    private onTouchCancel(): void {
        this.restoreScale();
    }

    private restoreScale(): void {
        Tween.stopAllByTarget(this.node);
        tween(this.node).to(VisualTheme.motion.releaseSeconds, { scale: this._normalScale }).start();
    }

    private removeListeners(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }
}
