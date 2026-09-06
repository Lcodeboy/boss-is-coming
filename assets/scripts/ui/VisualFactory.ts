import { Color, Graphics, Label, Node } from 'cc';
import {
    calculateStartPageLayout,
    FixedWidthViewport,
    WorkspaceLayout,
    WORKSPACE_DESK_HEIGHT,
} from '../core/ViewportLayout';
import { ActionButton, ButtonAction } from './ActionButton';
import { createLabel, createUiNode, requireTransform } from './UIFactory';
import { Palette, ThemeButtonVariant, VisualTheme } from './VisualTheme';

export interface ThemedButton {
    readonly node: Node;
    readonly label: Label;
    readonly button: ActionButton;
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

/** 绘制开始页的电梯厅。高度来自可视区域，保证长屏不是单色留白。 */
export function createElevatorHall(parent: Node, viewport: FixedWidthViewport): Node {
    const hall = createUiNode(parent, 'ElevatorHall', viewport.width, viewport.height);
    const graphics = hall.addComponent(Graphics);
    const halfWidth = viewport.width / 2;
    const halfHeight = viewport.height / 2;
    graphics.fillColor = Palette.backgroundDeep;
    graphics.rect(-halfWidth, -halfHeight, viewport.width, viewport.height);
    graphics.fill();

    const wallTop = viewport.safeTop - 220;
    const floorTop = viewport.safeBottom + Math.max(220, viewport.safeHeight * 0.22);
    graphics.fillColor = Palette.backgroundSoft;
    graphics.rect(-halfWidth, floorTop, viewport.width, wallTop - floorTop);
    graphics.fill();
    graphics.fillColor = new Color(35, 51, 61, 255);
    graphics.rect(-halfWidth, viewport.safeBottom, viewport.width, floorTop - viewport.safeBottom);
    graphics.fill();

    graphics.lineWidth = 3;
    graphics.strokeColor = new Color(77, 96, 106, 150);
    for (let index = -3; index <= 3; index += 1) {
        const x = index * 125;
        graphics.moveTo(0, floorTop);
        graphics.lineTo(x, viewport.safeBottom);
    }
    for (let row = 1; row <= 4; row += 1) {
        const amount = row / 4;
        const y = floorTop + (viewport.safeBottom - floorTop) * amount;
        graphics.moveTo(-halfWidth, y);
        graphics.lineTo(halfWidth, y);
    }
    graphics.stroke();

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
    graphics.fillColor = Palette.officeFloor;
    graphics.roundRect(-width / 2, -height / 2, width, height, VisualTheme.radius.large);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = Palette.officeFloorGrid;
    for (let row = 1; row < 6; row += 1) {
        const y = -height / 2 + height * row / 6;
        graphics.moveTo(-width / 2 + 16, y);
        graphics.lineTo(width / 2 - 16, y);
    }
    for (let column = -2; column <= 2; column += 1) {
        const x = column * width / 6;
        graphics.moveTo(x, -height / 2 + 16);
        graphics.lineTo(x, height / 2 - 16);
    }
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
    graphics.fillColor = new Color(92, 119, 130, 72);
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
