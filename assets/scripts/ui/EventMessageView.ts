import { _decorator, Component, Label, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { EventMessageStyle } from '../data/LevelTypes';
import { createLabel, Palette } from './UIFactory';
import { paintEventMessageBubble } from './VisualFactory';

const { ccclass } = _decorator;

/** 定时事件的纯视觉消息气泡；销毁或切关时会停止全部动画。 */
@ccclass('EventMessageView')
export class EventMessageView extends Component {
    private readonly _hiddenScale = new Vec3(0.9, 0.9, 1);
    private readonly _visibleScale = new Vec3(1, 1, 1);
    private _label: Label | null = null;
    private _opacity: UIOpacity | null = null;

    public initialize(): void {
        this._label = createLabel(this.node, 'Message', '', 385, 66, {
            fontSize: 21,
            color: Palette.ink,
            bold: true,
        });
        this._label.node.setPosition(38, 0);
        this._opacity = this.node.addComponent(UIOpacity);
        this.node.active = false;
    }

    public show(message: string, style: EventMessageStyle): void {
        if (this._label === null || this._opacity === null) {
            return;
        }
        this.stopTweens();
        paintEventMessageBubble(this.node, style);
        this._label.string = message;
        this._opacity.opacity = 0;
        this.node.setScale(this._hiddenScale);
        this.node.active = true;
        tween(this.node)
            .to(0.18, { scale: this._visibleScale }, { easing: 'backOut' })
            .start();
        tween(this._opacity)
            .to(0.12, { opacity: 255 })
            .delay(1.65)
            .to(0.22, { opacity: 0 })
            .call(() => {
                this.node.active = false;
            })
            .start();
    }

    public cancel(): void {
        this.stopTweens();
        this.node.active = false;
    }

    protected override onDisable(): void {
        this.stopTweens();
    }

    protected override onDestroy(): void {
        this.stopTweens();
        this._label = null;
        this._opacity = null;
    }

    private stopTweens(): void {
        Tween.stopAllByTarget(this.node);
        if (this._opacity !== null) {
            Tween.stopAllByTarget(this._opacity);
        }
    }
}
