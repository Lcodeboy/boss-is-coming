import { _decorator, Component, Label, Node } from 'cc';
import { SettingsService } from '../core/SettingsService';
import { createLabel, createRoundedPanel, Palette } from './UIFactory';
import { createThemedButton } from './VisualFactory';

const { ccclass } = _decorator;

@ccclass('SettingsView')
export class SettingsView extends Component {
    private _settings: SettingsService | null = null;
    private _soundLabel: Label | null = null;
    private _vibrationLabel: Label | null = null;
    public initialize(settings: SettingsService): void {
        this._settings = settings;
        const card = createRoundedPanel(this.node, 'SettingsCard', 610, 490, Palette.panel, 30);
        createLabel(card, 'Title', '反馈设置', 480, 66, { fontSize: 38, color: Palette.ink, bold: true }).node.setPosition(0, 165);
        const sound = createThemedButton(card, 'SoundToggle', '', () => {
            settings.setSoundEnabled(!settings.snapshot.soundEnabled);
            this.refresh();
        }, 440, 88, 'secondary');
        sound.node.setPosition(0, 62);
        this._soundLabel = this.addToggleLabel(sound.node);
        const vibration = createThemedButton(card, 'VibrationToggle', '', () => {
            settings.setVibrationEnabled(!settings.snapshot.vibrationEnabled);
            this.refresh();
        }, 440, 88, 'secondary');
        vibration.node.setPosition(0, -42);
        this._vibrationLabel = this.addToggleLabel(vibration.node);
        createThemedButton(card, 'CloseSettings', '关闭', () => { this.node.active = false; }, 240, 88, 'primary').node.setPosition(0, -155);
        this.node.active = false;
    }
    public show(): void { this.refresh(); this.node.active = true; }
    private refresh(): void {
        const settings = this._settings?.snapshot;
        if (settings === undefined) { return; }
        if (this._soundLabel !== null) { this._soundLabel.string = `音效：${settings.soundEnabled ? '开' : '关'}`; }
        if (this._vibrationLabel !== null) { this._vibrationLabel.string = `振动：${settings.vibrationEnabled ? '开' : '关'}`; }
    }
    private addToggleLabel(parent: Node): Label {
        return createLabel(parent, 'SettingValue', '', 400, 64, { fontSize: 28, color: Palette.ink, bold: true });
    }
}
