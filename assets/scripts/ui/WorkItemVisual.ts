import { _decorator, Color, Component, Graphics, Label, Node, Sprite } from 'cc';
import { WorkItemConfig } from '../data/LevelTypes';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette, requireTransform } from './UIFactory';
import {
    calculateOfficeArtworkLayout,
    resolveOfficeItemArtwork,
} from './OfficeTheme';
import { LoadedOfficeThemeAssets } from './OfficeThemeAssets';
import { createPassiveSprite } from './VisualFactory';
import { LEVEL_ONE_PLANT_VISUAL_OFFSET_X } from './VisualMetrics';

const { ccclass } = _decorator;

const MONITOR_NOTE_FONT_SIZE = 18;
const MONITOR_NOTE_TEXT_COLOR = new Color(35, 43, 48, 255);

/** 物品的纯视觉组件；不参与触摸、目标判断和任务完成。 */
@ccclass('WorkItemVisual')
export class WorkItemVisual extends Component {
    private _config: WorkItemConfig | null = null;
    private _graphics: Graphics | null = null;
    private _mainLabel: Label | null = null;
    private _pageLabel: Label | null = null;
    private _visualBadgeLabel: Label | null = null;
    private _visualCodeLabel: Label | null = null;
    private _checkBadge: Node | null = null;
    private _themeAssets: LoadedOfficeThemeAssets | null = null;
    private _themeArtworkNode: Node | null = null;
    private _themeArtworkSprite: Sprite | null = null;
    private _monitorNoteNode: Node | null = null;
    private _monitorNoteSprite: Sprite | null = null;
    private _monitorNoteLabel: Label | null = null;
    private _formal = false;
    private _clickProgress = 0;
    private _completed = false;
    private _selected = false;
    private _collectedHidden = false;

    public initialize(
        config: WorkItemConfig,
        formal: boolean,
        themeAssets: LoadedOfficeThemeAssets | null = null,
    ): void {
        this._config = config;
        this._formal = formal;
        this._themeAssets = themeAssets;
        this._graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this.buildLabels();
    }

    public setOfficeThemeAssets(themeAssets: LoadedOfficeThemeAssets | null): void {
        this._themeAssets = themeAssets;
        if (!this._collectedHidden) {
            this.render(this._clickProgress, this._completed, this._selected);
        }
    }

    public render(clickProgress: number, completed: boolean, selected: boolean): void {
        const config = this._config;
        const graphics = this._graphics;
        if (config === null || graphics === null) {
            return;
        }
        this._clickProgress = clickProgress;
        this._completed = completed;
        this._selected = selected;
        this._collectedHidden = false;
        this.setLabelsVisible(true);
        const themedArtwork = this._formal
            && this.renderOfficeThemeArtwork(graphics, config, clickProgress, completed, selected);
        if (this._formal) {
            if (!themedArtwork) {
                this.hideOfficeThemeArtwork();
                this.paintFormal(graphics, config, clickProgress, completed, selected);
            }
        } else {
            this.hideOfficeThemeArtwork();
            this.paintLegacy(config, clickProgress, completed, selected);
        }
        if (this._checkBadge !== null) {
            this._checkBadge.active = completed && this._formal;
        }
    }

    /** 组合任务页面收入容器后只隐藏外观，逻辑节点与碰撞状态保持不变。 */
    public hideCollectedVisual(): void {
        this._graphics?.clear();
        this._collectedHidden = true;
        this.hideOfficeThemeArtwork();
        this.setLabelsVisible(false);
        if (this._checkBadge !== null) {
            this._checkBadge.active = false;
        }
        // 页面已收入文件夹后退到底层，避免透明逻辑节点遮挡新生成的装订报告。
        this.node.setSiblingIndex(0);
    }

    private renderOfficeThemeArtwork(
        graphics: Graphics,
        config: WorkItemConfig,
        clickProgress: number,
        completed: boolean,
        selected: boolean,
    ): boolean {
        const themeAssets = this._themeAssets;
        const artwork = resolveOfficeItemArtwork(config);
        if (themeAssets === null || artwork === null) {
            return false;
        }
        const assetKey = config.visual === 'monitor'
            ? clickProgress > 0 ? 'monitorWork' : 'monitorPlay'
            : artwork.asset;
        const spriteFrame = themeAssets.frames[assetKey];
        const layout = calculateOfficeArtworkLayout(
            themeAssets.theme,
            assetKey,
            config.size.width,
            config.size.height,
        );
        if (this._themeArtworkNode === null || this._themeArtworkSprite === null) {
            const visual = createPassiveSprite(
                this.node,
                'OfficeThemeArtwork',
                layout.width,
                layout.height,
                spriteFrame,
            );
            this._themeArtworkNode = visual.node;
            this._themeArtworkSprite = visual.sprite;
        }
        requireTransform(this._themeArtworkNode).setContentSize(layout.width, layout.height);
        this._themeArtworkNode.setPosition(layout.x, layout.y);
        this._themeArtworkNode.setScale(1, 1, 1);
        this._themeArtworkNode.setSiblingIndex(0);
        this._themeArtworkNode.active = true;
        this._themeArtworkSprite.spriteFrame = spriteFrame;

        graphics.clear();
        this.strokeSelection(
            graphics,
            config.size.width,
            config.size.height,
            selected,
            completed,
            this.isDocument(config.visual) ? 8 : 16,
        );

        if (config.visual === 'monitor') {
            this.renderMonitorNote(themeAssets, config, clickProgress === 0 && !completed);
            if (this._pageLabel !== null) {
                this._pageLabel.node.active = false;
            }
        } else {
            this.hideMonitorNote();
            if (this._mainLabel !== null) {
                this._mainLabel.string = artwork.runtimeLabel;
                this._mainLabel.color = this.labelColor(config.visual);
            }
        }
        return true;
    }

    private renderMonitorNote(
        themeAssets: LoadedOfficeThemeAssets,
        config: WorkItemConfig,
        visible: boolean,
    ): void {
        if (!visible) {
            this.hideMonitorNote();
            return;
        }
        const assetKey = 'monitorNote';
        const spriteFrame = themeAssets.frames[assetKey];
        const layout = calculateOfficeArtworkLayout(
            themeAssets.theme,
            assetKey,
            config.size.width,
            config.size.height,
        );
        if (this._monitorNoteNode === null || this._monitorNoteSprite === null) {
            const visual = createPassiveSprite(
                this.node,
                'MonitorNoteArtwork',
                layout.width,
                layout.height,
                spriteFrame,
            );
            this._monitorNoteNode = visual.node;
            this._monitorNoteSprite = visual.sprite;
            this._monitorNoteLabel = createLabel(
                this._monitorNoteNode,
                'MonitorNoteLabel',
                '摸鱼中',
                layout.width * 0.98,
                34,
                {
                    fontSize: MONITOR_NOTE_FONT_SIZE,
                    color: MONITOR_NOTE_TEXT_COLOR,
                    bold: true,
                    wrap: false,
                },
            );
            this._monitorNoteLabel.node.setPosition(0, -2);
        }
        requireTransform(this._monitorNoteNode).setContentSize(layout.width, layout.height);
        this._monitorNoteNode.setPosition(layout.x, layout.y);
        this._monitorNoteNode.setScale(1, 1, 1);
        this._monitorNoteNode.setSiblingIndex(1);
        this._monitorNoteNode.active = true;
        this._monitorNoteSprite.spriteFrame = spriteFrame;
        if (this._monitorNoteLabel !== null) {
            this._monitorNoteLabel.string = '摸鱼中';
        }
    }

    private hideOfficeThemeArtwork(): void {
        if (this._themeArtworkNode !== null) {
            this._themeArtworkNode.active = false;
        }
        this.hideMonitorNote();
    }

    private hideMonitorNote(): void {
        if (this._monitorNoteNode !== null) {
            this._monitorNoteNode.active = false;
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
            this._pageLabel.node.setPosition(
                this._formal && config.visualVariant === 'monitor-two-step' ? 20 : 0,
                this._formal ? 13 : 8,
            );
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
            if (config.visualBadge !== undefined) {
                this._visualBadgeLabel = createLabel(this.node, 'VisualBadge', config.visualBadge, 72, 28, {
                    fontSize: config.visual === 'report-page' ? 18 : 15,
                    color: Palette.white,
                    bold: true,
                    wrap: false,
                });
                this._visualBadgeLabel.node.setPosition(
                    this.visualBadgeX(config),
                    config.size.height / 2 - 18,
                );
            }
            if (config.visualCode !== undefined) {
                this._visualCodeLabel = createLabel(this.node, 'VisualCode', config.visualCode, 64, 26, {
                    fontSize: 14,
                    color: Palette.white,
                    bold: true,
                    wrap: false,
                });
                this._visualCodeLabel.node.setPosition(config.size.width / 2 - 36, -config.size.height / 2 + 17);
            }
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
            case 'contract-red':
            case 'contract-yellow':
                this.paintContract(graphics, config, completed, selected);
                break;
            case 'plant':
                this.paintPlant(graphics, config, completed, selected);
                break;
            case 'report-page':
                this.paintReportPage(graphics, config, completed, selected);
                break;
            case 'bound-report':
                this.paintBoundReport(graphics, config, completed, selected);
                break;
            case 'coffee':
                this.paintCoffee(graphics, config, completed, selected);
                break;
            case 'visitor-badge':
                this.paintVisitorBadge(graphics, config, completed, selected);
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
        if (config.visualVariant === 'monitor-two-step') {
            this.paintMonitorState(graphics, width, clickProgress, completed);
        }
        graphics.fillColor = new Color(69, 82, 91, 255);
        graphics.roundRect(-18, -height / 2 + 3, 36, 33, 6);
        graphics.roundRect(-62, -height / 2, 124, 12, 6);
        graphics.fill();
        this.strokeSelection(graphics, width, height - 20, selected, completed, 24);
    }

    private paintMonitorState(
        graphics: Graphics,
        width: number,
        clickProgress: number,
        completed: boolean,
    ): void {
        const iconX = -width / 2 + 42;
        const iconY = 15;
        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(235, 242, 243, 225);
        graphics.fillColor = new Color(235, 242, 243, 210);
        if (clickProgress === 0) {
            graphics.circle(iconX, iconY, 18);
            graphics.stroke();
            graphics.moveTo(iconX - 5, iconY - 9);
            graphics.lineTo(iconX + 10, iconY);
            graphics.lineTo(iconX - 5, iconY + 9);
            graphics.close();
            graphics.fill();
            return;
        }
        if (!completed) {
            graphics.roundRect(iconX - 21, iconY - 14, 42, 28, 5);
            graphics.stroke();
            graphics.moveTo(iconX - 19, iconY + 11);
            graphics.lineTo(iconX, iconY - 2);
            graphics.lineTo(iconX + 19, iconY + 11);
            graphics.stroke();
            return;
        }
        for (let index = 0; index < 3; index += 1) {
            graphics.roundRect(iconX - 22 + index * 16, iconY - 15, 10, 15 + index * 10, 3);
        }
        graphics.fill();
        graphics.moveTo(iconX - 24, iconY - 17);
        graphics.lineTo(iconX + 26, iconY - 17);
        graphics.stroke();
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
        if (config.visualVariant === undefined) {
            this.paintDefaultContract(graphics, width, height);
            this.strokeSelection(graphics, width, height, selected, completed, 8);
            return;
        }
        graphics.fillColor = this.contractFill(config);
        graphics.roundRect(-width / 2, -height / 2, width, height, 8);
        graphics.fill();
        graphics.fillColor = Palette.documentLine;
        const lineStart = config.visualVariant === 'file-reference' ? -width / 2 + 17 : -width / 2 + 24;
        for (let line = 0; line < 3; line += 1) {
            const lineWidth = config.visualVariant === 'file-archive' && line === 1 ? width * 0.42 : width - 48;
            graphics.roundRect(lineStart, 7 - line * 15, lineWidth, 4, 2);
        }
        graphics.fill();
        this.paintContractVariantMarks(graphics, config, width, height);
        this.strokeSelection(graphics, width, height, selected, completed, 8);
    }

    private paintDefaultContract(graphics: Graphics, width: number, height: number): void {
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
    }

    private paintContractVariantMarks(
        graphics: Graphics,
        config: WorkItemConfig,
        width: number,
        height: number,
    ): void {
        switch (config.visualVariant) {
            case 'file-current':
                graphics.fillColor = Palette.contractCurrentMark;
                graphics.roundRect(-width / 2 + 8, height / 2 - 29, 62, 23, 6);
                graphics.fill();
                graphics.lineWidth = 3;
                graphics.strokeColor = new Color(224, 239, 246, 220);
                graphics.circle(width / 2 - 24, height / 2 - 22, 13);
                graphics.stroke();
                break;
            case 'file-archive':
                graphics.fillColor = Palette.contractArchiveMark;
                graphics.roundRect(width / 2 - 70, height / 2 - 29, 62, 23, 6);
                graphics.fill();
                graphics.lineWidth = 5;
                graphics.strokeColor = new Color(235, 210, 204, 180);
                graphics.moveTo(-width / 2 + 10, -height / 2 + 12);
                graphics.lineTo(width / 2 - 10, height / 2 - 12);
                graphics.stroke();
                break;
            case 'file-reference':
                graphics.fillColor = Palette.contractReferenceMark;
                graphics.roundRect(-width / 2 + 7, -height / 2 + 7, 22, height - 14, 5);
                graphics.fill();
                graphics.lineWidth = 3;
                graphics.strokeColor = new Color(255, 238, 176, 210);
                graphics.roundRect(width / 2 - 46, height / 2 - 31, 36, 22, 5);
                graphics.stroke();
                break;
            default:
                break;
        }
    }

    private contractFill(config: WorkItemConfig): Color {
        if (config.visualVariant === 'file-archive' && config.visual === 'contract') {
            return Palette.contractArchive;
        }
        switch (config.visual) {
            case 'contract-red':
                return Palette.contractRed;
            case 'contract-yellow':
                return Palette.contractYellow;
            default:
                return Palette.contractBlue;
        }
    }

    private paintReportPage(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.fillColor = Palette.paper;
        graphics.roundRect(-width / 2, -height / 2, width, height, 7);
        graphics.fill();
        graphics.fillColor = Palette.reportHeader;
        graphics.roundRect(-width / 2 + 9, height / 2 - 31, width - 18, 18, 5);
        graphics.fill();
        graphics.fillColor = Palette.reportLine;
        for (let line = 0; line < 3; line += 1) {
            graphics.roundRect(-width / 2 + 10, -height / 2 + 13 + line * 12, width - 20, 4, 2);
        }
        graphics.fill();
        this.paintReportChart(graphics, config, width);
        graphics.fillColor = Palette.paperFold;
        graphics.moveTo(width / 2 - 18, height / 2);
        graphics.lineTo(width / 2, height / 2 - 18);
        graphics.lineTo(width / 2, height / 2);
        graphics.close();
        graphics.fill();
        this.strokeSelection(graphics, width, height, selected, completed, 7);
    }

    private paintReportChart(graphics: Graphics, config: WorkItemConfig, width: number): void {
        const centerY = 10;
        graphics.fillColor = Palette.reportChart;
        graphics.strokeColor = Palette.reportChart;
        graphics.lineWidth = 4;
        switch (config.visualVariant) {
            case 'report-bars':
                for (let index = 0; index < 3; index += 1) {
                    graphics.roundRect(-width / 2 + 13 + index * 17, centerY - 15, 11, 15 + index * 9, 3);
                }
                graphics.fill();
                break;
            case 'report-line':
                graphics.moveTo(-width / 2 + 12, centerY - 12);
                graphics.lineTo(-8, centerY + 8);
                graphics.lineTo(10, centerY - 1);
                graphics.lineTo(width / 2 - 12, centerY + 18);
                graphics.stroke();
                break;
            case 'report-donut':
                graphics.lineWidth = 7;
                graphics.arc(0, centerY + 2, 19, 0.35, Math.PI * 1.72, false);
                graphics.stroke();
                graphics.fillColor = new Color(221, 132, 48, 230);
                graphics.circle(12, centerY + 16, 5);
                graphics.fill();
                break;
            default:
                graphics.roundRect(-width / 2 + 13, centerY - 4, width - 26, 8, 4);
                graphics.fill();
                break;
        }
    }

    private paintBoundReport(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.fillColor = Palette.reportStack;
        graphics.roundRect(-width / 2 + 8, -height / 2 - 4, width - 8, height - 2, 8);
        graphics.fill();
        graphics.fillColor = new Color(61, 108, 151, 255);
        graphics.roundRect(-width / 2, -height / 2 + 6, width - 8, height - 6, 9);
        graphics.fill();
        graphics.fillColor = Palette.binder;
        graphics.roundRect(-width / 2, -height / 2 + 6, 20, height - 6, 7);
        graphics.fill();
        graphics.fillColor = new Color(210, 224, 229, 230);
        graphics.roundRect(-width / 2 + 34, 8, width - 58, 6, 3);
        graphics.roundRect(-width / 2 + 34, -8, width - 72, 5, 3);
        graphics.fill();
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(205, 217, 221, 255);
        graphics.moveTo(-width / 2 + 9, height / 2 - 24);
        graphics.lineTo(-width / 2 + 9, height / 2 - 9);
        graphics.moveTo(-width / 2 + 9, -height / 2 + 14);
        graphics.lineTo(-width / 2 + 9, -height / 2 + 29);
        graphics.stroke();
        this.strokeSelection(graphics, width, height, selected, completed, 9);
    }

    private paintCoffee(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(112, 79, 60, 150);
        graphics.arc(-14, height / 2 - 5, 9, 0.4, 2.5, false);
        graphics.arc(14, height / 2 + 2, 9, 0.5, 2.6, false);
        graphics.stroke();
        graphics.fillColor = Palette.coffeeCup;
        graphics.moveTo(-width * 0.34, height * 0.34);
        graphics.lineTo(width * 0.34, height * 0.34);
        graphics.lineTo(width * 0.25, -height / 2);
        graphics.lineTo(-width * 0.25, -height / 2);
        graphics.close();
        graphics.fill();
        graphics.fillColor = Palette.coffeeLid;
        graphics.roundRect(-width * 0.42, height * 0.28, width * 0.84, 18, 8);
        graphics.fill();
        graphics.fillColor = Palette.coffeeSleeve;
        graphics.roundRect(-width * 0.32, -14, width * 0.64, 42, 7);
        graphics.fill();
        this.strokeSelection(graphics, width, height, selected, completed, 16);
    }

    private paintVisitorBadge(graphics: Graphics, config: WorkItemConfig, completed: boolean, selected: boolean): void {
        const width = config.size.width;
        const height = config.size.height;
        graphics.lineWidth = 7;
        graphics.strokeColor = new Color(48, 104, 137, 255);
        graphics.moveTo(-25, height / 2 - 2);
        graphics.lineTo(0, height / 2 + 28);
        graphics.lineTo(25, height / 2 - 2);
        graphics.stroke();
        graphics.fillColor = Palette.badgePaper;
        graphics.roundRect(-width / 2, -height / 2, width, height, 10);
        graphics.fill();
        graphics.fillColor = Palette.badgeAccent;
        graphics.roundRect(-width / 2, height / 2 - 22, width, 22, 9);
        graphics.fill();
        graphics.fillColor = new Color(112, 139, 150, 255);
        graphics.roundRect(-width / 2 + 10, -height / 2 + 12, 30, 32, 7);
        graphics.fill();
        graphics.fillColor = new Color(133, 151, 157, 190);
        graphics.roundRect(-width / 2 + 49, -height / 2 + 31, width - 61, 5, 2);
        graphics.roundRect(-width / 2 + 49, -height / 2 + 18, width - 72, 5, 2);
        graphics.fill();
        this.strokeSelection(graphics, width, height, selected, completed, 10);
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
            case 'contract-red':
            case 'contract-yellow':
                return config.visualVariant === undefined ? '蓝色合同' : '';
            case 'plant':
                return '';
            case 'report-page':
                return '';
            case 'bound-report':
                return '装订报告';
            case 'coffee':
                return '咖啡';
            case 'visitor-badge':
                return '访客';
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
            case 'contract-red':
            case 'contract-yellow':
                return 29;
            case 'plant':
                return -config.size.height / 2 + 16;
            case 'bound-report':
                return 0;
            case 'coffee':
                return -8;
            case 'visitor-badge':
                return -18;
            default:
                return 0;
        }
    }

    private labelColor(visual: WorkItemConfig['visual']): Color {
        return visual === 'report-page' || visual === 'visitor-badge' ? Palette.blueGrayDark : Palette.white;
    }

    private visualBadgeX(config: WorkItemConfig): number {
        if (config.visual === 'report-page') {
            return 0;
        }
        return config.visualVariant === 'file-archive'
            ? config.size.width / 2 - 39
            : -config.size.width / 2 + 39;
    }

    private setLabelsVisible(visible: boolean): void {
        if (this._mainLabel !== null) {
            this._mainLabel.node.active = visible;
        }
        if (this._pageLabel !== null) {
            this._pageLabel.node.active = visible;
        }
        if (this._visualBadgeLabel !== null) {
            this._visualBadgeLabel.node.active = visible;
        }
        if (this._visualCodeLabel !== null) {
            this._visualCodeLabel.node.active = visible;
        }
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
