import {
    _decorator,
    Color,
    Component,
    EventTouch,
    Graphics,
    Label,
    Node,
    Tween,
    tween,
    Vec2,
    Vec3,
} from 'cc';
import { AudioFeedback } from '../core/AudioFeedback';
import { WorkItemConfig } from '../data/LevelTypes';
import { createLabel, drawRoundedPanel, Palette, requireTransform } from '../ui/UIFactory';
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
    private readonly _touchDelta = new Vec2();
    private _config: WorkItemConfig | null = null;
    private _zones: readonly DropZone[] = [];
    private _canInteract: InteractionGuard | null = null;
    private _onCompleted: WorkItemCompleted | null = null;
    private _onMessage: WorkItemMessage | null = null;
    private _audio: AudioFeedback | null = null;
    private _mainLabel: Label | null = null;
    private _pageLabel: Label | null = null;
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
    ): void {
        this._config = config;
        this._zones = zones;
        this._canInteract = canInteract;
        this._onCompleted = onCompleted;
        this._onMessage = onMessage;
        this._audio = audio;
        requireTransform(this.node).setContentSize(config.size.width, config.size.height);
        this.node.setPosition(config.initialPosition.x, config.initialPosition.y);
        this._homePosition.set(this.node.position);
        this.buildVisuals();
        this.resetItem();
    }

    public setAvailable(available: boolean): void {
        this.node.active = available;
        if (available) {
            this.resetItem();
        }
    }

    public resetItem(): void {
        Tween.stopAllByTarget(this.node);
        this._completed = false;
        this._pressed = false;
        this._clickProgress = 0;
        this.node.setScale(this._normalScale);
        this.node.setPosition(this._homePosition);
        this.drawItem(false, false);
    }

    public stopInteraction(): void {
        if (!this._pressed || this._completed) {
            return;
        }
        this._pressed = false;
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
        this.cancelInteraction();
    }

    protected override onDestroy(): void {
        this.removeListeners();
        Tween.stopAllByTarget(this.node);
        this._canInteract = null;
        this._onCompleted = null;
        this._onMessage = null;
        this._audio = null;
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
        this.drawItem(false, true);
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
    }

    private onTouchEnd(event: EventTouch): void {
        const config = this._config;
        if (!this._pressed || config === null) {
            return;
        }
        event.propagationStopped = true;
        this._pressed = false;
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
        tween(this.node)
            .to(0.16, { position: this._snapPosition, scale: this._normalScale }, { easing: 'quadOut' })
            .call(() => this.drawItem(true, false))
            .start();
        this.finishAction();
    }

    private onTouchCancel(): void {
        if (!this._pressed) {
            return;
        }
        this._pressed = false;
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
            .call(() => this.drawItem(completed, false))
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
        tween(this.node)
            .to(0.2, { position: this._homePosition, scale: this._normalScale }, { easing: 'quadOut' })
            .call(() => this.drawItem(false, false))
            .start();
    }

    private cancelInteraction(): void {
        this.stopInteraction();
    }

    private buildVisuals(): void {
        if (this._mainLabel !== null || this._config === null) {
            return;
        }
        const config = this._config;
        this.node.addComponent(Graphics);
        if (config.visual === 'monitor') {
            this._pageLabel = createLabel(this.node, 'MonitorPage', '', config.size.width - 34, config.size.height - 46, {
                fontSize: 24,
                color: Palette.white,
                bold: true,
                wrap: false,
            });
            this._pageLabel.node.setPosition(0, 8);
            const clicks = Math.max(1, config.clickStates.length - 1);
            this._mainLabel = createLabel(
                this.node,
                'MonitorHint',
                clicks > 1 ? `点击 ${clicks} 次切换` : '点击切换页面',
                config.size.width,
                30,
                { fontSize: 18, color: Palette.muted, wrap: false },
            );
            this._mainLabel.node.setPosition(0, -96);
            return;
        }
        this._mainLabel = createLabel(this.node, 'ItemLabel', config.label, config.size.width - 10, config.size.height - 8, {
            fontSize: config.visual === 'plant' ? 20 : 22,
            color: config.visual === 'report-page' ? Palette.ink : Palette.white,
            bold: true,
            wrap: false,
        });
    }

    private drawItem(completed: boolean, selected: boolean): void {
        const config = this._config;
        if (config === null) {
            return;
        }
        const fill = this.itemFill(config.visual, completed);
        const stroke = completed ? Palette.success : selected ? Palette.warning : Palette.blueGrayDark;
        const lineWidth = selected ? 6 : completed ? 5 : 3;
        drawRoundedPanel(this.node, fill, this.isDocument(config.visual) ? 8 : 16, stroke, lineWidth);
        if (this._pageLabel !== null) {
            const stateIndex = Math.min(this._clickProgress, config.clickStates.length - 1);
            this._pageLabel.string = config.clickStates[stateIndex] ?? config.label;
        }
        if (this._mainLabel !== null && config.visual !== 'monitor') {
            this._mainLabel.string = completed ? `✓ ${config.label}` : config.label;
            this._mainLabel.color = completed || config.visual !== 'report-page' ? Palette.white : Palette.ink;
        }
    }

    private isDocument(visual: WorkItemConfig['visual']): boolean {
        return visual === 'contract'
            || visual === 'contract-red'
            || visual === 'contract-yellow'
            || visual === 'report-page'
            || visual === 'bound-report'
            || visual === 'visitor-badge';
    }

    private itemFill(visual: WorkItemConfig['visual'], completed: boolean): Color {
        if (completed) {
            return Palette.success;
        }
        switch (visual) {
            case 'monitor':
                return new Color(49, 65, 78, 255);
            case 'console':
                return new Color(94, 88, 132, 255);
            case 'snack':
                return new Color(214, 119, 48, 255);
            case 'contract':
                return Palette.contractBlue;
            case 'contract-red':
                return new Color(190, 83, 76, 255);
            case 'contract-yellow':
                return new Color(205, 161, 55, 255);
            case 'plant':
                return new Color(72, 145, 103, 255);
            case 'report-page':
                return new Color(235, 235, 226, 255);
            case 'bound-report':
                return new Color(70, 111, 151, 255);
            case 'coffee':
                return new Color(151, 95, 57, 255);
            case 'visitor-badge':
                return new Color(52, 150, 157, 255);
        }
    }

    private removeListeners(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }
}
