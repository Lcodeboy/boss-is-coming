import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
import { WorkItemConfig } from '../data/LevelTypes';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette, requireTransform } from './UIFactory';
import { LEVEL_ONE_PLANT_VISUAL_OFFSET_X } from './VisualMetrics';

const { ccclass } = _decorator;

/** 物品的纯视觉组件；不参与触摸、目标判断和任务完成。 */
@ccclass('WorkItemVisual')
export class WorkItemVisual extends Component {
    private _config: WorkItemConfig | null = null;
    private _graphics: Graphics | null = null;
    private _mainLabel: Label | null = null;
    private _pageLabel: Label | null = null;
    private _checkBadge: Node | null = null;
    private _formal = false;

    public initialize(config: WorkItemConfig, formal: boolean): void {
        this._config = config;
        this._formal = formal;
        this._graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this.buildLabels();
    }

    public render(clickProgress: number, completed: boolean, selected: boolean): void {
        const config = this._config;
        const graphics = this._graphics;
        if (config === null || graphics === null) {
            return;
        }
        if (this._formal) {
            this.paintFormal(graphics, config, clickProgress, completed, selected);
        } else {
            this.paintLegacy(config, clickProgress, completed, selected);
        }
        if (this._checkBadge !== null) {
            this._checkBadge.active = completed && this._formal;
        }
    }

    private buildLabels(): void {
        const config = this._config;
        if (config === null || this._mainLabel !== null || this._pageLabel !== null) {
            return;
        }
        if (config.visual === 'monitor') {
            this._pageLabel = createLabel(
                this.node,
                'MonitorPage',
                '',
                config.size.width - (this._formal ? 58 : 34),
                config.size.height - (this._formal ? 66 : 46),
                {
                    fontSize: this._formal ? 21 : 24,
                    color: Palette.white,
                    bold: true,
                    wrap: false,
                },
            );
            this._pageLabel.node.setPosition(0, this._formal ? 13 : 8);
            const clicks = Math.max(1, config.clickStates.length - 1);
            this._mainLabel = createLabel(
                this.node,
                'MonitorHint',
                clicks > 1 ? `点击 ${clicks} 次切换` : this._formal ? '轻触切换页面' : '点击切换页面',
                config.size.width,
                30,
                { fontSize: this._formal ? 20 : 17, color: this._formal ? Palette.blueGrayDark : Palette.muted, wrap: false },
            );
            this._mainLabel.node.setPosition(0, -96);
        } else {
            const labelText = this._formal ? this.formalLabel(config) : config.label;
            this._mainLabel = createLabel(
                this.node,
                'ItemLabel',
                labelText,
                config.size.width - (this._formal ? 12 : 10),
                this._formal ? Math.min(40, config.size.height - 8) : config.size.height - 8,
                {
                    fontSize: this._formal ? 17 : config.visual === 'plant' ? 20 : 22,
                    color: this.labelColor(config.visual),
                    bold: true,
                    wrap: false,
                },
            );
            this._mainLabel.node.setPosition(0, this._formal ? this.labelY(config) : 0);
        }

        if (this._formal) {
            this._checkBadge = createRoundedPanel(this.node, 'CompleteBadge', 38, 38, Palette.success, 19, Palette.white, 2);
            this._checkBadge.setPosition(config.size.width / 2 - 10, config.size.height / 2 - 8);
            createLabel(this._checkBadge, 'Check', '✓', 30, 30, {
                fontSize: 22,
                color: Palette.white,
                bold: true,
                wrap: false,
            });
            this._checkBadge.active = false;
        }
    }

    private paintFormal(
        graphics: Graphics,
        config: WorkItemConfig,
        clickProgress: number,
        completed: boolean,
        selected: boolean,
    ): void {
        graphics.clear();
        if (selected) {
            this.paintDragShadow(graphics, config.size.width, config.size.height);
        }
        switch (config.visual) {
            case 'monitor':
                this.paintMonitor(graphics, config, clickProgress, completed, selected);
                break;
            case 'console':
                this.paintConsole(graphics, config, completed, selected);
                break;
            case 'snack':
                this.paintSnack(graphics, config, completed, selected);
                break;
            case 'contract':
                this.paintContract(graphics, config, completed, selected);
                break;
            case 'plant':
                this.paintPlant(graphics, config, completed, selected);
                break;
            default:
                this.paintLegacy(config, clickProgress, completed, selected);
                return;
        }
        if (this._pageLabel !== null) {
            const stateIndex = Math.min(clickProgress, config.clickStates.length - 1);
            this._pageLabel.string = config.clickStates[stateIndex] ?? config.label;
            this._pageLabel.color = completed ? new Color(205, 245, 218, 255) : Palette.white;
        }
        if (this._mainLabel !== null && config.visual !== 'monitor') {
            this._mainLabel.string = this.formalLabel(config);
            this._mainLabel.color = this.labelColor(config.visual);
        }
    }

    private paintLegacy(
        config: WorkItemConfig,
        clickProgress: number,
        completed: boolean,
        selected: boolean,
    ): void {
        const fill = this.itemFill(config.visual, completed);
        const stroke = completed ? Palette.success : selected ? Palette.warning : Palette.blueGrayDark;
        const lineWidth = selected ? 6 : completed ? 5 : 3;
        drawRoundedPanel(this.node, fill, this.isDocument(config.visual) ? 8 : 16, stroke, lineWidth);
        if (this._pageLabel !== null) {
            const stateIndex = Math.min(clickProgress, config.clickStates.length - 1);
            this._pageLabel.string = config.clickStates[stateIndex] ?? config.label;
        }
        if (this._mainLabel !== null && config.visual !== 'monitor') {
            this._mainLabel.string = completed ? `✓ ${config.label}` : config.label;
            this._mainLabel.color = completed || config.visual !== 'report-page' ? Palette.white : Palette.ink;
        }
    }

    private paintMonitor(
        graphics: Graphics,
        config: WorkItemConfig,
        clickProgress: number,
        completed: boolean,
        selected: boolean,
    ): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.fillColor = Palette.monitorBezel;
        graphics.roundRect(-width / 2, -height / 2 + 24, width, height - 20, 13);
        graphics.fill();
        graphics.fillColor = clickProgress > 0 ? Palette.monitorWork : Palette.monitorFun;
        graphics.roundRect(-width / 2 + 15, -height / 2 + 39, width - 30, height - 52, 8);
        graphics.fill();
        graphics.fillColor = new Color(69, 82, 91, 255);
        graphics.roundRect(-18, -height / 2 + 3, 36, 33, 6);
        graphics.roundRect(-62, -height / 2, 124, 12, 6);
        graphics.fill();
        this.strokeSelection(graphics, width, height - 20, selected, completed, 24);
    }

    private paintConsole(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.fillColor = Palette.consoleBody;
        graphics.roundRect(-width / 2, -height / 2, width, height, 28);
        graphics.fill();
        graphics.fillColor = Palette.consoleScreen;
        graphics.roundRect(-38, -height / 2 + 13, 76, height - 26, 8);
        graphics.fill();
        graphics.fillColor = Palette.consoleButton;
        graphics.circle(-53, 7, 12);
        graphics.circle(52, 10, 8);
        graphics.fill();
        graphics.fillColor = Palette.warning;
        graphics.circle(65, -8, 6);
        graphics.fill();
        this.strokeSelection(graphics, width, height, selected, completed, 28);
    }

    private paintSnack(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.fillColor = Palette.snack;
        graphics.moveTo(-width * 0.42, -height / 2);
        graphics.lineTo(-width / 2, height * 0.36);
        graphics.lineTo(-width * 0.34, height / 2);
        graphics.lineTo(-width * 0.12, height * 0.43);
        graphics.lineTo(width * 0.12, height / 2);
        graphics.lineTo(width * 0.38, height * 0.42);
        graphics.lineTo(width / 2, -height * 0.38);
        graphics.lineTo(width * 0.34, -height / 2);
        graphics.close();
        graphics.fill();
        graphics.lineWidth = 7;
        graphics.strokeColor = Palette.snackAccent;
        graphics.moveTo(-width * 0.34, height * 0.33);
        graphics.lineTo(width * 0.34, height * 0.33);
        graphics.moveTo(-width * 0.3, -height * 0.34);
        graphics.lineTo(width * 0.3, -height * 0.34);
        graphics.stroke();
        this.strokeSelection(graphics, width, height, selected, completed, 15);
    }

    private paintContract(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.fillColor = Palette.contractBlue;
        graphics.roundRect(-width / 2, -height / 2, width, height, 8);
        graphics.fill();
        graphics.fillColor = Palette.documentLine;
        for (let line = 0; line < 3; line += 1) {
            graphics.roundRect(-width / 2 + 24, 10 - line * 17, width - 48, 5, 2);
        }
        graphics.fill();
        graphics.fillColor = Palette.documentFold;
        graphics.moveTo(-width / 2, height / 2 - 28);
        graphics.lineTo(-width / 2 + 28, height / 2);
        graphics.lineTo(-width / 2, height / 2);
        graphics.close();
        graphics.fill();
        this.strokeSelection(graphics, width, height, selected, completed, 8);
    }

    private paintPlant(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        const offsetX = LEVEL_ONE_PLANT_VISUAL_OFFSET_X;
        graphics.fillColor = Palette.plant;
        graphics.ellipse(offsetX - 22, 30, 30, 66);
        graphics.ellipse(offsetX + 18, 38, 32, 76);
        graphics.ellipse(offsetX + 2, 55, 28, 76);
        graphics.fill();
        graphics.fillColor = Palette.plantLight;
        graphics.ellipse(offsetX - 35, 48, 22, 52);
        graphics.ellipse(offsetX + 35, 48, 22, 52);
        graphics.fill();
        graphics.fillColor = Palette.plantPot;
        graphics.moveTo(offsetX - width * 0.34, 5);
        graphics.lineTo(offsetX + width * 0.34, 5);
        graphics.lineTo(offsetX + width * 0.25, -height / 2);
        graphics.lineTo(offsetX - width * 0.25, -height / 2);
        graphics.close();
        graphics.fill();
        if (selected || completed) {
            graphics.lineWidth = selected ? 5 : 4;
            graphics.strokeColor = completed ? Palette.success : Palette.blue;
            graphics.roundRect(offsetX - width / 2 + 2, -height / 2 + 2, width - 4, height - 4, 16);
            graphics.stroke();
        }
    }

    private paintDragShadow(graphics: Graphics, width: number, height: number): void {
        graphics.fillColor = Palette.shadow;
        graphics.roundRect(-width / 2 + 7, -height / 2 - 12, width, height, 18);
        graphics.fill();
    }

    private strokeSelection(
        graphics: Graphics,
        width: number,
        height: number,
        selected: boolean,
        completed: boolean,
        radius: number,
    ): void {
        if (!selected && !completed) {
            return;
        }
        graphics.lineWidth = selected ? 5 : 4;
        graphics.strokeColor = completed ? Palette.success : Palette.blue;
        graphics.roundRect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4, radius);
        graphics.stroke();
    }

    private formalLabel(config: WorkItemConfig): string {
        switch (config.visual) {
            case 'console':
                return '游戏机';
            case 'snack':
                return '脆脆零食';
            case 'contract':
                return '蓝色合同';
            case 'plant':
                return '';
            default:
                return config.label;
        }
    }

    private labelY(config: WorkItemConfig): number {
        switch (config.visual) {
            case 'console':
                return -2;
            case 'snack':
                return 0;
            case 'contract':
                return 29;
            case 'plant':
                return -config.size.height / 2 + 16;
            default:
                return 0;
        }
    }

    private labelColor(visual: WorkItemConfig['visual']): Color {
        return visual === 'report-page' ? Palette.ink : Palette.white;
    }

    private isDocument(visual: WorkItemConfig['visual']): boolean {
        return visual === 'contract'
            || visual === 'contract-red'
            || visual === 'contract-yellow'
            || visual === 'report-page'
            || visual === 'bound-report'
            || visual === 'visitor-badge';
    }

    private itemFill(visual: WorkItemConfig['visual'], completed: boolean): Color {
        if (completed) {
            return Palette.success;
        }
        switch (visual) {
            case 'monitor':
                return new Color(49, 65, 78, 255);
            case 'console':
                return new Color(94, 88, 132, 255);
            case 'snack':
                return new Color(214, 119, 48, 255);
            case 'contract':
                return Palette.contractBlue;
            case 'contract-red':
                return new Color(190, 83, 76, 255);
            case 'contract-yellow':
                return new Color(205, 161, 55, 255);
            case 'plant':
                return new Color(72, 145, 103, 255);
            case 'report-page':
                return new Color(235, 235, 226, 255);
            case 'bound-report':
                return new Color(70, 111, 151, 255);
            case 'coffee':
                return new Color(151, 95, 57, 255);
            case 'visitor-badge':
                return new Color(52, 150, 157, 255);
        }
    }
}
