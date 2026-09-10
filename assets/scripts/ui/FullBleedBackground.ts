import { _decorator, Color, Component, Graphics, Node, Sprite, SpriteFrame } from 'cc';
import {
    calculateCoverLayout,
    calculateFullBleedBackgroundLayout,
    FixedWidthViewport,
} from '../core/ViewportLayout';
import { createUiNode, requireTransform } from './UIFactory';
import { Palette } from './VisualTheme';

const { ccclass, property } = _decorator;

export type FullBleedBackgroundKind = 'game' | 'home' | 'level-select';

/**
 * 页面最底层的全屏背景。矢量占位与正式 SpriteFrame 共用同一套尺寸和 cover 逻辑，
 * 节点本身不注册输入事件，也不添加 BlockInputEvents。
 */
@ccclass('FullBleedBackground')
export class FullBleedBackground extends Component {
    @property(SpriteFrame)
    public replacementSpriteFrame: SpriteFrame | null = null;

    private _viewport: FixedWidthViewport | null = null;
    private _kind: FullBleedBackgroundKind = 'game';
    private _artworkNode: Node | null = null;
    private _artworkSprite: Sprite | null = null;

    public initialize(viewport: FixedWidthViewport, kind: FullBleedBackgroundKind): void {
        this._viewport = viewport;
        this._kind = kind;
        const layout = calculateFullBleedBackgroundLayout(viewport);
        requireTransform(this.node).setContentSize(layout.width, layout.height);
        this.node.setPosition(layout.x, layout.y);
        this.render();
    }

    /** 后续正式美术只需注入 SpriteFrame，无需改变页面布局或适配代码。 */
    public setSpriteFrame(spriteFrame: SpriteFrame | null): void {
        this.replacementSpriteFrame = spriteFrame;
        this.render();
    }

    private render(): void {
        if (this._viewport === null) {
            return;
        }
        if (this.replacementSpriteFrame !== null) {
            this.renderSprite(this.replacementSpriteFrame);
            return;
        }
        this.hideSprite();
        this.paintVectorFallback(this._viewport, this._kind);
    }

    private renderSprite(spriteFrame: SpriteFrame): void {
        const viewport = this._viewport;
        if (viewport === null) {
            return;
        }
        const graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        graphics.clear();
        if (this._artworkNode === null || this._artworkSprite === null) {
            this._artworkNode = createUiNode(this.node, 'FullBleedArtwork', 1, 1);
            this._artworkSprite = this._artworkNode.addComponent(Sprite);
            this._artworkSprite.type = Sprite.Type.SIMPLE;
            this._artworkSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        const originalSize = spriteFrame.originalSize;
        const sourceWidth = Math.max(1, originalSize.width);
        const sourceHeight = Math.max(1, originalSize.height);
        const cover = calculateCoverLayout(viewport.width, viewport.height, sourceWidth, sourceHeight);
        requireTransform(this._artworkNode).setContentSize(sourceWidth, sourceHeight);
        this._artworkNode.setScale(cover.scale, cover.scale, 1);
        this._artworkSprite.spriteFrame = spriteFrame;
        this._artworkNode.active = true;
    }

    private hideSprite(): void {
        if (this._artworkNode !== null) {
            this._artworkNode.active = false;
        }
    }

    private paintVectorFallback(viewport: FixedWidthViewport, kind: FullBleedBackgroundKind): void {
        const graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        const halfWidth = viewport.width / 2;
        const halfHeight = viewport.height / 2;
        graphics.clear();
        if (kind === 'home') {
            this.paintHomeFallback(graphics, viewport, halfWidth, halfHeight);
        } else if (kind === 'level-select') {
            this.paintLevelSelectFallback(graphics, viewport, halfWidth, halfHeight);
        } else {
            graphics.fillColor = Palette.background;
            graphics.rect(-halfWidth, -halfHeight, viewport.width, viewport.height);
            graphics.fill();
        }
    }

    private paintHomeFallback(
        graphics: Graphics,
        viewport: FixedWidthViewport,
        halfWidth: number,
        halfHeight: number,
    ): void {
        graphics.fillColor = Palette.backgroundDeep;
        graphics.rect(-halfWidth, -halfHeight, viewport.width, viewport.height);
        graphics.fill();

        const floorTop = viewport.safeBottom + Math.max(220, viewport.safeHeight * 0.22);
        graphics.fillColor = Palette.backgroundSoft;
        graphics.rect(-halfWidth, floorTop, viewport.width, halfHeight - floorTop);
        graphics.fill();
        graphics.fillColor = new Color(35, 51, 61, 255);
        graphics.rect(-halfWidth, -halfHeight, viewport.width, floorTop + halfHeight);
        graphics.fill();

        graphics.fillColor = new Color(255, 255, 255, 11);
        for (let column = -3; column <= 3; column += 1) {
            graphics.rect(column * 122 - 3, floorTop, 6, halfHeight - floorTop);
        }
        graphics.fill();
        this.paintPerspectiveFloor(graphics, viewport, floorTop, new Color(77, 96, 106, 150));
    }

    private paintLevelSelectFallback(
        graphics: Graphics,
        viewport: FixedWidthViewport,
        halfWidth: number,
        halfHeight: number,
    ): void {
        graphics.fillColor = new Color(24, 39, 49, 255);
        graphics.rect(-halfWidth, -halfHeight, viewport.width, viewport.height);
        graphics.fill();

        const horizon = viewport.safeBottom + Math.max(190, viewport.safeHeight * 0.2);
        graphics.fillColor = new Color(43, 62, 72, 255);
        graphics.rect(-halfWidth, horizon, viewport.width, halfHeight - horizon);
        graphics.fill();
        graphics.fillColor = new Color(31, 47, 57, 255);
        graphics.rect(-halfWidth, -halfHeight, viewport.width, horizon + halfHeight);
        graphics.fill();

        graphics.fillColor = new Color(255, 255, 255, 13);
        graphics.circle(-286, viewport.safeTop - 104, 118);
        graphics.circle(310, viewport.safeBottom + 210, 150);
        graphics.fill();
        this.paintPerspectiveFloor(graphics, viewport, horizon, new Color(86, 112, 123, 105));
    }

    private paintPerspectiveFloor(
        graphics: Graphics,
        viewport: FixedWidthViewport,
        horizon: number,
        stroke: Color,
    ): void {
        const halfWidth = viewport.width / 2;
        const halfHeight = viewport.height / 2;
        graphics.lineWidth = 3;
        graphics.strokeColor = stroke;
        for (let index = -3; index <= 3; index += 1) {
            graphics.moveTo(0, horizon);
            graphics.lineTo(index * 125, -halfHeight);
        }
        for (let row = 1; row <= 4; row += 1) {
            const amount = row / 4;
            const y = horizon + (-halfHeight - horizon) * amount;
            graphics.moveTo(-halfWidth, y);
            graphics.lineTo(halfWidth, y);
        }
        graphics.stroke();
    }
}
