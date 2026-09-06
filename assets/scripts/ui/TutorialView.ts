import { _decorator, Component, Label } from 'cc';
import { ActionButton } from './ActionButton';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette } from './UIFactory';
import { createThemedButton } from './VisualFactory';

const { ccclass } = _decorator;

@ccclass('TutorialView')
export class TutorialView extends Component {
    private _confirmButton: ActionButton | null = null;
    private _firstLabel: Label | null = null;
    private _secondLabel: Label | null = null;

    public initialize(onConfirm: () => void): void {
        drawRoundedPanel(this.node, Palette.overlay, 0);
        const card = createRoundedPanel(this.node, 'TutorialCard', 620, 520, Palette.panel, 30, Palette.blueGray, 2);
        const eyebrow = createLabel(card, 'Eyebrow', 'FIRST DAY · 操作指南', 500, 30, {
            fontSize: 15,
            color: Palette.blue,
            bold: true,
            wrap: false,
        });
        eyebrow.node.setPosition(0, 220);
        const title = createLabel(card, 'Title', '操作教学', 500, 70, {
            fontSize: 42,
            color: Palette.ink,
            bold: true,
        });
        title.node.setPosition(0, 170);
        const first = createRoundedPanel(card, 'TapTip', 500, 92, Palette.panelStrong, 18, Palette.blueSoft, 2);
        first.setPosition(0, 65);
        const firstNumber = createRoundedPanel(first, 'StepNumber', 52, 52, Palette.blue, 26);
        firstNumber.setPosition(-208, 0);
        createLabel(firstNumber, 'Number', '1', 38, 38, {
            fontSize: 22,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        this._firstLabel = createLabel(first, 'Text', '', 390, 68, {
            fontSize: 28,
            color: Palette.blueGrayDark,
            bold: true,
            wrap: false,
        });
        this._firstLabel.node.setPosition(34, 0);
        const second = createRoundedPanel(card, 'DragTip', 500, 92, Palette.panelStrong, 18, Palette.blueSoft, 2);
        second.setPosition(0, -48);
        const secondNumber = createRoundedPanel(second, 'StepNumber', 52, 52, Palette.blue, 26);
        secondNumber.setPosition(-208, 0);
        createLabel(secondNumber, 'Number', '2', 38, 38, {
            fontSize: 22,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        this._secondLabel = createLabel(second, 'Text', '', 390, 68, {
            fontSize: 27,
            color: Palette.blueGrayDark,
            bold: true,
            wrap: false,
        });
        this._secondLabel.node.setPosition(34, 0);
        const confirm = createThemedButton(card, 'ConfirmButton', '我知道了', onConfirm, 320, 94, 'primary');
        confirm.node.setPosition(0, -170);
        this._confirmButton = confirm.button;
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
