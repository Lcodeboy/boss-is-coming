import { Color, Label, Node } from 'cc';
import { OfficeLabelPlacement, OfficeLabelStyle } from './OfficeTheme';
import { createUiNode, drawRoundedPanel, requireTransform } from './UIFactory';

export const OFFICE_LABEL_BACKDROP_PREFIX = 'OfficeLabelBackdrop-';

interface LabelBackdrop {
    readonly node: Node;
    readonly originalFontSize: number;
    readonly originalLineHeight: number;
    readonly originalColor: Color;
}

/** Passive sibling graphics, owned/destroyed by the existing item or zone root.
 * Never changes logical size, registers input, starts tweens, or edits artwork.
 */
export class OfficeLabelBackdrops {
    private readonly _entries = new Map<Label, LabelBackdrop>();

    public reset(): void {
        for (const [label, entry] of this._entries) {
            entry.node.active = false;
            label.fontSize = entry.originalFontSize;
            label.lineHeight = entry.originalLineHeight;
            label.color = entry.originalColor;
        }
    }

    public apply(label: Label | null, style: OfficeLabelStyle, placement: OfficeLabelPlacement): void {
        if (label === null || !label.string || !label.node.parent) { return; }
        const transform = requireTransform(label.node);
        // Clamp only the decorative plate, never the text reservation or touch box.
        const width = Math.min(placement.plateWidth, transform.width);
        const height = Math.min(placement.plateHeight, transform.height);
        let entry = this._entries.get(label);
        if (entry === undefined) {
            entry = {
                node: createUiNode(label.node.parent, `${OFFICE_LABEL_BACKDROP_PREFIX}${label.node.name}`, width, height),
                originalFontSize: label.fontSize, originalLineHeight: label.lineHeight,
                originalColor: label.color.clone(),
            };
            this._entries.set(label, entry);
        }
        const plate = entry.node;
        requireTransform(plate).setContentSize(width, height);
        plate.setPosition(label.node.position);
        const labelIndex = label.node.getSiblingIndex();
        plate.setSiblingIndex(labelIndex - (plate.getSiblingIndex() < labelIndex ? 1 : 0));
        plate.active = true;
        const color = (rgba: readonly [number, number, number, number]): Color => new Color(...rgba);
        drawRoundedPanel(plate, color(style.background), style.radius, color(style.border), 1);
        label.fontSize = placement.fontSize;
        label.lineHeight = Math.min(transform.height, Math.round(placement.fontSize * 1.15));
        label.color = color(style.foreground);
    }
}
