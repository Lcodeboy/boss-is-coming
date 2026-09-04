import { _decorator, Color, Component, Label, Node, UITransform, Vec2, Vec3 } from 'cc';
import { DropZoneConfig } from '../data/LevelTypes';
import { createLabel, drawRoundedPanel, Palette, requireTransform } from '../ui/UIFactory';

const { ccclass } = _decorator;

@ccclass('DropZone')
export class DropZone extends Component {
    private readonly _worldCenter = new Vec2();
    private readonly _worldPosition = new Vec3();
    private _config: DropZoneConfig | null = null;
    private _label: Label | null = null;

    public get zoneId(): string {
        return this._config?.id ?? '';
    }

    public configure(config: DropZoneConfig): void {
        this._config = config;
        this.node.setPosition(config.position.x, config.position.y);
        requireTransform(this.node).setContentSize(config.size.width, config.size.height);
        if (this._label === null) {
            this._label = createLabel(this.node, 'ZoneLabel', config.label, config.size.width - 16, config.size.height - 12, {
                fontSize: 22,
                color: Palette.blueGrayDark,
                bold: true,
            });
        } else {
            this._label.string = config.label;
        }
        this.resetVisual();
    }

    public contains(itemNode: Node): boolean {
        const transform = this.node.getComponent(UITransform);
        if (transform === null) {
            return false;
        }
        this._worldCenter.set(itemNode.worldPosition.x, itemNode.worldPosition.y);
        return transform.getBoundingBoxToWorld().contains(this._worldCenter);
    }

    public copySnapPosition(targetParent: Node, output: Vec3): void {
        this._worldPosition.set(this.node.worldPosition);
        const parentTransform = targetParent.getComponent(UITransform);
        if (parentTransform === null) {
            output.set(this.node.position);
            return;
        }
        parentTransform.convertToNodeSpaceAR(this._worldPosition, output);
    }

    public markCompleted(): void {
        drawRoundedPanel(this.node, Palette.successPale, 16, Palette.success, 4);
        if (this._label !== null) {
            this._label.color = Palette.success;
        }
    }

    public resetVisual(): void {
        drawRoundedPanel(this.node, new Color(226, 234, 238, 220), 16, Palette.blueGray, 3);
        if (this._label !== null) {
            this._label.color = Palette.blueGrayDark;
        }
    }
}
