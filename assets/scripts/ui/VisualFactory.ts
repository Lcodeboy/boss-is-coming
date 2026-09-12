import { Color, Graphics, Label, Node } from 'cc';
import {
    calculateStartPageLayout,
    FixedWidthViewport,
    WorkspaceLayout,
    WORKSPACE_DESK_HEIGHT,
} from '../core/ViewportLayout';
import { EventMessageStyle } from '../data/LevelTypes';
import { ActionButton, ButtonAction } from './ActionButton';
import { createLabel, createUiNode, requireTransform } from './UIFactory';
import { Palette, ThemeButtonVariant, VisualTheme } from './VisualTheme';

export interface ThemedButton {
    readonly node: Node;
    readonly label: Label;
    readonly button: ActionButton;
}

/** 游戏进行页使用的紧凑返回按钮；80设计像素触摸区内绘制30像素箭头。 */
export function createBackArrowButton(
    parent: Node,
    name: string,
    action: ButtonAction,
    size = 80,
): Node {
    const node = createUiNode(parent, name, size, size);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(112, 135, 143, 72);
    graphics.circle(0, 0, size / 2 - 2);
    graphics.fill();
    graphics.lineWidth = 5;
    graphics.strokeColor = Palette.white;
    graphics.moveTo(8, 15);
    graphics.lineTo(-8, 0);
    graphics.lineTo(8, -15);
    graphics.moveTo(-7, 0);
    graphics.lineTo(15, 0);
    graphics.stroke();
    const button = node.addComponent(ActionButton);
    button.configure(action);
    return node;
}

/** 创建统一弹窗卡片；阴影、圆角、细描边和顶部层级标识保持一致。 */
export function createModalCard(
    parent: Node,
    name: string,
    width: number,
    height: number,
    accent: Color = Palette.blueGray,
): Node {
    const node = createUiNode(parent, name, width, height);
    node.addComponent(Graphics);
    paintModalCard(node, accent);
    return node;
}

export function paintModalCard(node: Node, accent: Color = Palette.blueGray): void {
    const transform = requireTransform(node);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const radius = VisualTheme.radius.modal;
    graphics.clear();
    graphics.fillColor = new Color(Palette.shadow.r, Palette.shadow.g, Palette.shadow.b, 132);
    graphics.roundRect(-width / 2 + 8, -height / 2 - 12, width - 16, height, radius);
    graphics.fill();
    graphics.fillColor = Palette.panel;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 178);
    graphics.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius);
    graphics.stroke();
    graphics.fillColor = new Color(accent.r, accent.g, accent.b, 220);
    graphics.roundRect(-width / 2 + 28, height / 2 - 13, width - 56, 8, 4);
    graphics.fill();
}

/** 创建统一按钮；阴影直接绘制在按钮节点内，缩放反馈不会与主体脱节。 */
export function createThemedButton(
    parent: Node,
    name: string,
    text: string,
    action: ButtonAction,
    width: number,
    height: number,
    variant: ThemeButtonVariant = 'primary',
): ThemedButton {
    const node = createUiNode(parent, name, width, height);
    node.addComponent(Graphics);
    paintButton(node, variant);
    const label = createLabel(node, 'ButtonText', text, width - 24, height - 14, {
        fontSize: Math.min(VisualTheme.typography.button, height * 0.34),
        color: variant === 'secondary' ? Palette.blueGrayDark : Palette.white,
        bold: true,
        wrap: false,
    });
    const button = node.addComponent(ActionButton);
    button.configure(action);
    return { node, label, button };
}

export function paintButton(node: Node, variant: ThemeButtonVariant): void {
    const transform = requireTransform(node);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const radius = Math.min(VisualTheme.radius.medium, height / 2);
    const fill = buttonFill(variant);
    graphics.clear();
    graphics.fillColor = Palette.shadow;
    graphics.roundRect(-width / 2, -height / 2 - 5, width, height, radius);
    graphics.fill();
    graphics.fillColor = fill;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (variant === 'secondary' || variant === 'quiet') {
        graphics.lineWidth = 2;
        graphics.strokeColor = variant === 'secondary' ? Palette.blueGray : Palette.muted;
        graphics.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius);
        graphics.stroke();
    }
}

/** 创建开始页电梯前景；整屏场景由 FullBleedBackground 独立负责。 */
export function createElevatorHall(parent: Node, viewport: FixedWidthViewport): Node {
    const hall = createUiNode(parent, 'ElevatorHall', viewport.width, viewport.height);
    const layout = calculateStartPageLayout(viewport);
    const elevatorWidth = 520;
    const frame = createUiNode(hall, 'ElevatorFrame', elevatorWidth, layout.elevatorHeight);
    frame.setPosition(0, layout.elevatorY);
    paintElevator(frame, elevatorWidth, layout.elevatorHeight);
    return hall;
}

export function paintElevator(node: Node, width: number, height: number): void {
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = Palette.shadow;
    graphics.roundRect(-width / 2 - 14, -height / 2 - 12, width + 28, height + 28, 18);
    graphics.fill();
    graphics.fillColor = Palette.elevatorMetal;
    graphics.roundRect(-width / 2, -height / 2, width, height, 14);
    graphics.fill();
    graphics.fillColor = Palette.elevatorDoor;
    graphics.rect(-width / 2 + 22, -height / 2 + 22, width - 44, height - 44);
    graphics.fill();
    graphics.lineWidth = 5;
    graphics.strokeColor = Palette.elevatorSeam;
    graphics.moveTo(0, -height / 2 + 22);
    graphics.lineTo(0, height / 2 - 22);
    graphics.stroke();
    graphics.fillColor = new Color(126, 147, 157, 255);
    graphics.roundRect(-width / 2 + 36, -height / 2 + 36, 14, height - 72, 7);
    graphics.roundRect(width / 2 - 50, -height / 2 + 36, 14, height - 72, 7);
    graphics.fill();
    graphics.fillColor = Palette.elevatorSeam;
    graphics.circle(-22, 0, 6);
    graphics.circle(22, 0, 6);
    graphics.fill();
}

export function paintBossSilhouette(node: Node): void {
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(9, 20, 28, 185);
    graphics.circle(0, 54, 32);
    graphics.fill();
    graphics.moveTo(-47, 19);
    graphics.bezierCurveTo(-59, -5, -65, -78, -70, -116);
    graphics.lineTo(70, -116);
    graphics.bezierCurveTo(65, -78, 59, -5, 47, 19);
    graphics.close();
    graphics.fill();
    graphics.fillColor = Palette.warning;
    graphics.roundRect(38, -12, 8, 46, 4);
    graphics.fill();
}

/** 工位桌面只改变绘制，不改变原有660×405交互坐标。 */
export function paintFormalDesk(node: Node): void {
    const transform = requireTransform(node);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = Palette.shadow;
    graphics.roundRect(-width / 2 + 8, -height / 2 - 9, width - 16, height - 8, 22);
    graphics.fill();
    graphics.fillColor = Palette.deskTop;
    graphics.roundRect(-width / 2, -height / 2 + 92, width, height - 92, 20);
    graphics.fill();
    graphics.fillColor = Palette.deskFront;
    graphics.roundRect(-width / 2, -height / 2 + 72, width, 112, 14);
    graphics.fill();
    graphics.fillColor = Palette.blueGrayDark;
    graphics.roundRect(-width / 2 + 34, -height / 2 + 10, 38, 116, 12);
    graphics.roundRect(width / 2 - 72, -height / 2 + 10, 38, 116, 12);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(196, 210, 214, 160);
    for (let index = 1; index <= 4; index += 1) {
        const y = -height / 2 + 122 + index * 52;
        graphics.moveTo(-width / 2 + 22, y);
        graphics.lineTo(width / 2 - 22, y);
    }
    graphics.stroke();
}

export function paintFormalOfficeFloor(node: Node): void {
    const transform = requireTransform(node);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = Palette.sceneFloor;
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = Palette.sceneFloorGrid;
    for (let row = 1; row < 6; row += 1) {
        const y = -height / 2 + height * row / 6;
        graphics.moveTo(-width / 2, y);
        graphics.lineTo(width / 2, y);
    }
    for (let column = -2; column <= 2; column += 1) {
        const x = column * width / 6;
        graphics.moveTo(x, -height / 2);
        graphics.lineTo(x, height / 2);
    }
    graphics.stroke();
}

/** 收纳区是铺在办公室地面上的低对比地毯，不再表现为独立的大卡片。 */
export function paintStorageArea(node: Node): void {
    const transform = requireTransform(node);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    // 只提供地面分区和物体落地阴影，避免再次形成包围收纳物件的大面板。
    graphics.fillColor = new Color(16, 29, 37, 68);
    graphics.ellipse(-238, -height / 2 + 30, 118, 22);
    graphics.ellipse(245, -height / 2 + 30, 118, 22);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(151, 173, 179, 62);
    graphics.moveTo(-width / 2 + 38, height / 2 - 18);
    graphics.lineTo(width / 2 - 38, height / 2 - 18);
    graphics.stroke();
}

/**
 * 用地毯、桌边投影与办公椅连接桌面和底部收纳区。
 * 节点只包含 Graphics，不注册触摸事件，也不会改变物品或目标节点的坐标。
 */
export function paintWorkspaceDepth(node: Node, layout: WorkspaceLayout): void {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const deskBottom = layout.deskY - WORKSPACE_DESK_HEIGHT / 2;
    const storageTop = layout.targetBandY + layout.targetBandHeight / 2;
    const availableDepth = deskBottom - storageTop;
    graphics.clear();

    graphics.fillColor = new Color(43, 61, 72, 34);
    graphics.roundRect(-306, deskBottom - 15, 612, 22, 11);
    graphics.fill();

    if (availableDepth <= 54) {
        return;
    }

    const rugInset = Math.min(24, availableDepth * 0.12);
    const rugBottom = storageTop + rugInset;
    const rugHeight = Math.max(24, availableDepth - rugInset * 2);
    graphics.fillColor = Palette.sceneRug;
    graphics.roundRect(-224, rugBottom, 448, rugHeight, 28);
    graphics.fill();
    graphics.lineWidth = 3;
    graphics.strokeColor = new Color(70, 96, 108, 86);
    graphics.roundRect(-224, rugBottom, 448, rugHeight, 28);
    graphics.stroke();

    if (availableDepth < 185) {
        return;
    }

    const chairCenterY = storageTop + availableDepth * 0.52;
    graphics.fillColor = new Color(54, 73, 84, 92);
    graphics.roundRect(-78, chairCenterY + 18, 156, 94, 34);
    graphics.roundRect(-102, chairCenterY - 52, 204, 58, 24);
    graphics.roundRect(-13, chairCenterY - 104, 26, 60, 10);
    graphics.fill();
    graphics.lineWidth = 10;
    graphics.strokeColor = new Color(54, 73, 84, 92);
    graphics.moveTo(0, chairCenterY - 92);
    graphics.lineTo(-82, chairCenterY - 134);
    graphics.moveTo(0, chairCenterY - 92);
    graphics.lineTo(82, chairCenterY - 134);
    graphics.stroke();
    graphics.fillColor = new Color(42, 59, 69, 110);
    graphics.circle(-86, chairCenterY - 138, 13);
    graphics.circle(86, chairCenterY - 138, 13);
    graphics.fill();
}

/** 绘制定时事件消息气泡；节点不注册输入事件。 */
export function paintEventMessageBubble(node: Node, style: EventMessageStyle): void {
    const transform = requireTransform(node);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const accent = style === 'boss'
        ? Palette.warning
        : style === 'coworker' ? Palette.messageCoworker : Palette.blue;
    graphics.clear();
    graphics.fillColor = Palette.shadow;
    graphics.roundRect(-width / 2 + 5, -height / 2 - 7, width - 10, height, 22);
    graphics.fill();
    graphics.fillColor = Palette.panelStrong;
    graphics.roundRect(-width / 2, -height / 2, width, height, 22);
    graphics.fill();
    graphics.fillColor = accent;
    graphics.roundRect(-width / 2, -height / 2, 12, height, 6);
    graphics.circle(-width / 2 + 44, 0, 24);
    graphics.fill();
    const pointerX = -width / 2 + 44;
    graphics.moveTo(pointerX - 18, -height / 2 + 2);
    graphics.lineTo(pointerX, -height / 2 - 16);
    graphics.lineTo(pointerX + 18, -height / 2 + 2);
    graphics.close();
    graphics.fill();
    graphics.fillColor = Palette.white;
    if (style === 'boss') {
        graphics.roundRect(-width / 2 + 34, -8, 20, 20, 5);
        graphics.fill();
        graphics.fillColor = accent;
        graphics.roundRect(-width / 2 + 38, 12, 12, 7, 3);
        graphics.fill();
    } else {
        graphics.circle(-width / 2 + 44, 7, 8);
        graphics.roundRect(-width / 2 + 34, -16, 20, 17, 8);
        graphics.fill();
    }
}

function buttonFill(variant: ThemeButtonVariant): Color {
    switch (variant) {
        case 'primary':
            return Palette.blue;
        case 'secondary':
            return Palette.panelStrong;
        case 'quiet':
            return Palette.blueGray;
        case 'danger':
            return Palette.warning;
    }
}
