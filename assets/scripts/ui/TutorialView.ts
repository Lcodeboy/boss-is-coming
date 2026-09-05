import { _decorator, Component, Label } from 'cc';
import { ActionButton } from './ActionButton';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

@ccclass('TutorialView')
export class TutorialView extends Component {
    private _confirmButton: ActionButton | null = null;
    private _firstLabel: Label | null = null;
    private _secondLabel: Label | null = null;

    public initialize(onConfirm: () => void): void {
        drawRoundedPanel(this.node, Palette.overlay, 0);
        const card = createRoundedPanel(this.node, 'TutorialCard', 620, 520, Palette.panel, 30, Palette.blue, 4);
        const title = createLabel(card, 'Title', '操作教学', 500, 70, {
            fontSize: 42,
            color: Palette.ink,
            bold: true,
        });
        title.node.setPosition(0, 170);
        const first = createRoundedPanel(card, 'TapTip', 500, 92, Palette.paleBlue, 20);
        first.setPosition(0, 65);
        this._firstLabel = createLabel(first, 'Text', '', 450, 68, {
            fontSize: 28,
            color: Palette.blueGrayDark,
            bold: true,
            wrap: false,
        });
        const second = createRoundedPanel(card, 'DragTip', 500, 92, Palette.paleBlue, 20);
        second.setPosition(0, -48);
        this._secondLabel = createLabel(second, 'Text', '', 450, 68, {
            fontSize: 27,
            color: Palette.blueGrayDark,
            bold: true,
            wrap: false,
        });
        const buttonNode = createRoundedPanel(card, 'ConfirmButton', 320, 94, Palette.blue, 26);
        buttonNode.setPosition(0, -170);
        createLabel(buttonNode, 'Text', '我知道了', 280, 72, {
            fontSize: 32,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        this._confirmButton = buttonNode.addComponent(ActionButton);
        this._confirmButton.configure(() => {
            this._confirmButton?.setInteractable(false);
            onConfirm();
        });
        this.node.active = false;
    }

    public show(messages: readonly string[]): void {
        if (this._firstLabel !== null) {
            this._firstLabel.string = messages[0] ?? '轻触电脑切换页面';
        }
        if (this._secondLabel !== null) {
            this._secondLabel.string = messages[1] ?? '长按并拖动物品到正确位置';
        }
        this._confirmButton?.setInteractable(true);
        this.node.active = true;
    }

    public hide(): void {
        this.node.active = false;
    }
}
