import { _decorator, Component, Node, UITransform, Vec2, Vec3 } from 'cc';
import { DropZoneConfig } from '../data/LevelTypes';
import { DropZoneVisual } from '../ui/DropZoneVisual';
import { requireTransform } from '../ui/UIFactory';

const { ccclass } = _decorator;

@ccclass('DropZone')
export class DropZone extends Component {
    private readonly _worldCenter = new Vec2();
    private readonly _worldPosition = new Vec3();
    private _config: DropZoneConfig | null = null;
    private _visual: DropZoneVisual | null = null;

    public get zoneId(): string {
        return this._config?.id ?? '';
    }

    public configure(config: DropZoneConfig, formalVisuals = false): void {
        this._config = config;
        this.node.setPosition(config.position.x, config.position.y);
        requireTransform(this.node).setContentSize(config.size.width, config.size.height);
        this._visual = this.node.addComponent(DropZoneVisual);
        this._visual.initialize(config, formalVisuals);
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

    /** 仅用于拖拽靠近时的视觉高亮，不改变 contains 的正式投放判定。 */
    public isNear(itemNode: Node, margin: number): boolean {
        const transform = this.node.getComponent(UITransform);
        if (transform === null) {
            return false;
        }
        const bounds = transform.getBoundingBoxToWorld();
        const position = itemNode.worldPosition;
        return position.x >= bounds.xMin - margin
            && position.x <= bounds.xMax + margin
            && position.y >= bounds.yMin - margin
            && position.y <= bounds.yMax + margin;
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
        this._visual?.setCompleted(true);
    }

    public setProgress(completed: number, total: number): void {
        const config = this._config;
        if (config === null || total <= 0) {
            return;
        }
        const safeCompleted = Math.max(0, Math.min(total, completed));
        this._visual?.setProgress(safeCompleted, total);
    }

    public resetVisual(): void {
        this._visual?.reset();
    }

    public setHighlighted(highlighted: boolean): void {
        this._visual?.setHighlighted(highlighted);
    }
}
