import {
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Layers,
    Node,
    UITransform,
    VerticalTextAlignment,
} from 'cc';
import { SizeData } from '../data/LevelTypes';

export const DESIGN_WIDTH = 750;
export const DESIGN_HEIGHT = 1334;

export const Palette = {
    background: new Color(239, 238, 232, 255),
    panel: new Color(255, 255, 252, 255),
    ink: new Color(42, 55, 66, 255),
    muted: new Color(102, 119, 132, 255),
    blueGray: new Color(91, 119, 140, 255),
    blueGrayDark: new Color(55, 78, 94, 255),
    paleBlue: new Color(222, 232, 238, 255),
    blue: new Color(50, 112, 184, 255),
    contractBlue: new Color(47, 119, 206, 255),
    success: new Color(55, 164, 103, 255),
    successPale: new Color(220, 244, 229, 255),
    warning: new Color(222, 79, 48, 255),
    warningPale: new Color(255, 226, 212, 255),
    overlay: new Color(24, 34, 43, 205),
    white: new Color(255, 255, 255, 255),
    transparent: new Color(0, 0, 0, 0),
} as const;

export interface LabelOptions {
    readonly fontSize?: number;
    readonly color?: Color;
    readonly horizontalAlign?: HorizontalTextAlignment;
    readonly verticalAlign?: VerticalTextAlignment;
    readonly bold?: boolean;
}

export function createUiNode(parent: Node, name: string, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(width, height);
    return node;
}

export function createRoundedPanel(
    parent: Node,
    name: string,
    width: number,
    height: number,
    fill: Color,
    radius = 20,
    stroke: Color | null = null,
    lineWidth = 3,
): Node {
    const node = createUiNode(parent, name, width, height);
    node.addComponent(Graphics);
    drawRoundedPanel(node, fill, radius, stroke, lineWidth);
    return node;
}

export function drawRoundedPanel(
    node: Node,
    fill: Color,
    radius = 20,
    stroke: Color | null = null,
    lineWidth = 3,
): void {
    const transform = requireTransform(node);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    graphics.clear();
    graphics.fillColor = fill;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (stroke !== null) {
        graphics.lineWidth = lineWidth;
        graphics.strokeColor = stroke;
        graphics.roundRect(-width / 2 + lineWidth / 2, -height / 2 + lineWidth / 2, width - lineWidth, height - lineWidth, radius);
        graphics.stroke();
    }
}

export function createLabel(
    parent: Node,
    name: string,
    text: string,
    width: number,
    height: number,
    options: LabelOptions = {},
): Label {
    const node = createUiNode(parent, name, width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = options.fontSize ?? 28;
    label.lineHeight = Math.round((options.fontSize ?? 28) * 1.25);
    label.color = options.color ?? Palette.ink;
    label.horizontalAlign = options.horizontalAlign ?? HorizontalTextAlignment.CENTER;
    label.verticalAlign = options.verticalAlign ?? VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    label.isBold = options.bold ?? false;
    return label;
}

export function setNodeSize(node: Node, size: SizeData): void {
    requireTransform(node).setContentSize(size.width, size.height);
}

export function requireTransform(node: Node): UITransform {
    const transform = node.getComponent(UITransform);
    if (transform === null) {
        throw new Error(`节点 ${node.name} 缺少 UITransform`);
    }
    return transform;
}
