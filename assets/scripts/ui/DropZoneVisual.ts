import { _decorator, Color, Component, Graphics, Label } from 'cc';
import { DropZoneConfig } from '../data/LevelTypes';
import { createLabel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

/** 收纳区域的纯视觉组件；高亮与完成效果不改变碰撞节点尺寸。 */
@ccclass('DropZoneVisual')
export class DropZoneVisual extends Component {
    private _config: DropZoneConfig | null = null;
    private _graphics: Graphics | null = null;
    private _label: Label | null = null;
    private _formal = false;
    private _highlighted = false;
    private _completed = false;
    private _progressText: string | null = null;
    private _progressCompleted = 0;
    private _progressTotal = 0;

    public initialize(config: DropZoneConfig, formal: boolean): void {
        this._config = config;
        this._formal = formal;
        this._progressTotal = config.progressActionIds.length;
        this._progressText = this.createProgressText(0, this._progressTotal);
        this._graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this._label = createLabel(
            this.node,
            'ZoneLabel',
            this.zoneLabel(config),
            config.size.width - (formal ? 18 : 16),
            formal ? 52 : config.size.height - 12,
            {
                fontSize: formal ? 20 : 22,
                color: Palette.blueGrayDark,
                bold: true,
            },
        );
        this._label.node.setPosition(0, this.labelY(config));
        this.render();
    }

    public setHighlighted(highlighted: boolean): void {
        if (this._highlighted === highlighted || this._completed) {
            return;
        }
        this._highlighted = highlighted;
        this.render();
    }

    public setCompleted(completed: boolean): void {
        this._completed = completed;
        this._highlighted = false;
        this.render();
    }

    public setProgress(completed: number, total: number): void {
        const config = this._config;
        if (config === null || total <= 0) {
            return;
        }
        const safeCompleted = Math.max(0, Math.min(total, completed));
        this._progressCompleted = safeCompleted;
        this._progressTotal = total;
        this._completed = safeCompleted >= total;
        this._progressText = this.createProgressText(safeCompleted, total);
        this.render();
    }

    public reset(): void {
        this._completed = false;
        this._highlighted = false;
        this._progressCompleted = 0;
        this._progressTotal = this._config?.progressActionIds.length ?? 0;
        this._progressText = this.createProgressText(0, this._progressTotal);
        this.render();
    }

    private render(): void {
        const config = this._config;
        const graphics = this._graphics;
        if (config === null || graphics === null) {
            return;
        }
        if (!this._formal) {
            drawRoundedPanel(
                this.node,
                this._completed ? Palette.successPale : new Color(226, 234, 238, 220),
                16,
                this._completed ? Palette.success : this._highlighted ? Palette.blue : Palette.blueGray,
                this._highlighted ? 5 : 3,
            );
        } else {
            graphics.clear();
            switch (config.visual) {
                case 'drawer':
                    this.paintDrawer(graphics, config);
                    break;
                case 'trash':
                    this.paintTrash(graphics, config);
                    break;
                case 'review-tray':
                    this.paintReviewTray(graphics, config);
                    break;
                case 'report-folder':
                    this.paintReportFolder(graphics, config);
                    break;
                case 'badge-stand':
                    this.paintBadgeStand(graphics, config);
                    break;
                case 'compat':
                default:
                    drawRoundedPanel(
                        this.node,
                        this._completed ? Palette.successPale : Palette.blueSoft,
                        16,
                        this._completed ? Palette.success : this._highlighted ? Palette.blue : Palette.blueGray,
                        this._highlighted ? 5 : 3,
                    );
                    break;
            }
        }
        if (this._label !== null) {
            this._label.string = this._progressText ?? this.zoneLabel(config);
            this._label.color = this._completed
                ? Palette.success
                : this._highlighted ? Palette.blue : Palette.blueGrayDark;
        }
    }

    private paintDrawer(graphics: Graphics, config: DropZoneConfig): void {
        const width = config.size.width;
        const height = config.size.height;
        this.paintHighlight(graphics, width, height, 16);
        graphics.fillColor = Palette.cabinet;
        graphics.roundRect(-width / 2, -height / 2, width, height, 12);
        graphics.fill();
        graphics.fillColor = Palette.cabinetFront;
        graphics.roundRect(-width / 2 + 10, 4, width - 20, height / 2 - 14, 7);
        graphics.roundRect(-width / 2 + 10, -height / 2 + 10, width - 20, height / 2 - 20, 7);
        graphics.fill();
        graphics.fillColor = new Color(48, 67, 78, 255);
        graphics.roundRect(-25, 25, 50, 7, 4);
        graphics.roundRect(-25, -27, 50, 7, 4);
        graphics.fill();
        this.paintStateStroke(graphics, width, height, 12);
    }

    private paintTrash(graphics: Graphics, config: DropZoneConfig): void {
        const width = config.size.width;
        const height = config.size.height;
        this.paintHighlight(graphics, width, height, 18);
        graphics.fillColor = Palette.cabinet;
        graphics.moveTo(-width * 0.38, height * 0.34);
        graphics.lineTo(width * 0.38, height * 0.34);
        graphics.lineTo(width * 0.28, -height / 2);
        graphics.lineTo(-width * 0.28, -height / 2);
        graphics.close();
        graphics.fill();
        graphics.fillColor = Palette.containerDark;
        graphics.ellipse(0, height * 0.34, width * 0.44, 15);
        graphics.fill();
        graphics.lineWidth = 3;
        graphics.strokeColor = Palette.containerLine;
        for (let column = -1; column <= 1; column += 1) {
            graphics.moveTo(column * 20, height * 0.22);
            graphics.lineTo(column * 16, -height * 0.37);
        }
        graphics.stroke();
        this.paintStateStroke(graphics, width, height, 18);
    }

    private paintReviewTray(graphics: Graphics, config: DropZoneConfig): void {
        const width = config.size.width;
        const height = config.size.height;
        this.paintHighlight(graphics, width, height, 14);
        graphics.fillColor = Palette.tray;
        graphics.roundRect(-width / 2, -height / 2, width, height * 0.58, 12);
        graphics.fill();
        graphics.fillColor = Palette.trayPaper;
        graphics.roundRect(-width / 2 + 13, -height * 0.26, width - 26, height * 0.54, 7);
        graphics.fill();
        graphics.fillColor = new Color(74, 99, 114, 255);
        graphics.roundRect(-width / 2, -height * 0.06, 18, height * 0.42, 6);
        graphics.roundRect(width / 2 - 18, -height * 0.06, 18, height * 0.42, 6);
        graphics.fill();
        this.paintStateStroke(graphics, width, height, 14);
    }

    private paintReportFolder(graphics: Graphics, config: DropZoneConfig): void {
        const width = config.size.width;
        const height = config.size.height;
        this.paintHighlight(graphics, width, height, 16);
        graphics.fillColor = Palette.folder;
        graphics.roundRect(-width / 2, -height / 2, width, height * 0.76, 13);
        graphics.roundRect(-width / 2 + 15, height * 0.13, width * 0.44, height * 0.28, 10);
        graphics.fill();
        graphics.fillColor = Palette.trayPaper;
        graphics.roundRect(-width / 2 + 16, -height * 0.28, width - 32, height * 0.48, 8);
        graphics.fill();
        const total = Math.max(3, this._progressTotal);
        const dotGap = 34;
        const firstX = -dotGap * (total - 1) / 2;
        for (let index = 0; index < total; index += 1) {
            graphics.fillColor = index < this._progressCompleted ? Palette.success : Palette.blueGray;
            graphics.roundRect(firstX + index * dotGap - 11, -height * 0.27, 22, 10, 5);
            graphics.fill();
        }
        this.paintStateStroke(graphics, width, height, 16);
    }

    private paintBadgeStand(graphics: Graphics, config: DropZoneConfig): void {
        const width = config.size.width;
        const height = config.size.height;
        this.paintHighlight(graphics, width, height, 14);
        graphics.fillColor = Palette.badgeStand;
        graphics.roundRect(-width / 2, -height / 2, width, 26, 10);
        graphics.fill();
        graphics.lineWidth = 6;
        graphics.strokeColor = new Color(75, 97, 108, 255);
        graphics.moveTo(-width * 0.34, -height / 2 + 22);
        graphics.lineTo(-width * 0.24, height * 0.34);
        graphics.lineTo(width * 0.24, height * 0.34);
        graphics.lineTo(width * 0.34, -height / 2 + 22);
        graphics.stroke();
        graphics.fillColor = new Color(225, 235, 236, 210);
        graphics.roundRect(-width * 0.24, -height * 0.2, width * 0.48, height * 0.38, 8);
        graphics.fill();
        this.paintStateStroke(graphics, width, height, 14);
    }

    private paintHighlight(graphics: Graphics, width: number, height: number, radius: number): void {
        if (!this._highlighted) {
            return;
        }
        graphics.fillColor = new Color(Palette.blue.r, Palette.blue.g, Palette.blue.b, 46);
        graphics.roundRect(-width / 2 - 12, -height / 2 - 12, width + 24, height + 24, radius + 10);
        graphics.fill();
    }

    private paintStateStroke(graphics: Graphics, width: number, height: number, radius: number): void {
        graphics.lineWidth = this._highlighted ? 6 : this._completed ? 5 : 2;
        graphics.strokeColor = this._completed
            ? Palette.success
            : this._highlighted ? Palette.blue : new Color(54, 77, 90, 180);
        graphics.roundRect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4, radius);
        graphics.stroke();
    }

    private zoneLabel(config: DropZoneConfig): string {
        if (!this._formal) {
            return config.label;
        }
        switch (config.visual) {
            case 'drawer':
                return '私人物品';
            case 'trash':
                return '废弃物';
            case 'review-tray':
                return '待检查文件';
            case 'report-folder':
                return '报告文件夹';
            case 'badge-stand':
                return '访客证托架';
            case 'compat':
            default:
                return config.label;
        }
    }

    private labelY(config: DropZoneConfig): number {
        if (!this._formal) {
            return 0;
        }
        if (config.visual === 'review-tray') {
            return config.size.height * 0.25;
        }
        if (config.visual === 'report-folder') {
            return config.size.height * 0.17;
        }
        if (config.visual === 'badge-stand') {
            return 2;
        }
        if (config.visual === 'drawer' || config.visual === 'trash') {
            // 抽屉和垃圾桶标签置于图形上方，节点与碰撞框保持原位和原尺寸。
            return config.size.height / 2 + 30;
        }
        return 0;
    }

    private createProgressText(completed: number, total: number): string | null {
        const config = this._config;
        if (config === null || total <= 0) {
            return null;
        }
        if (completed >= total) {
            return config.progressCompleteLabel ?? `${config.label} ${total}/${total}`;
        }
        return `${config.label} ${completed}/${total}`;
    }
}
