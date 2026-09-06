import { _decorator, Color, Component, Graphics, Label, Node } from 'cc';
import { calculateLevelSelectLayout, FixedWidthViewport } from '../core/ViewportLayout';
import { LevelConfig } from '../data/LevelTypes';
import { ActionButton } from './ActionButton';
import { createLabel, createRoundedPanel, createUiNode, drawRoundedPanel, Palette } from './UIFactory';
import { createThemedButton } from './VisualFactory';

const { ccclass } = _decorator;

interface LevelButtonEntry {
    readonly level: LevelConfig;
    readonly node: Node;
    readonly title: Label;
    readonly detail: Label;
    readonly statusPill: Node;
    readonly status: Label;
    readonly lockIcon: Node;
    readonly button: ActionButton;
}

@ccclass('LevelSelectView')
export class LevelSelectView extends Component {
    private readonly _entries: LevelButtonEntry[] = [];
    private _highestUnlockedLevel = 1;

    public initialize(
        levels: readonly LevelConfig[],
        viewport: FixedWidthViewport,
        onSelect: (levelId: string) => void,
        onBack: () => void,
    ): void {
        const layout = calculateLevelSelectLayout(viewport, levels.length);
        const card = createRoundedPanel(
            this.node,
            'LevelSelectCard',
            680,
            layout.panelHeight,
            Palette.backgroundSoft,
            28,
            Palette.elevatorMetal,
            3,
        );
        card.setPosition(0, layout.panelY);
        const consoleLabel = createLabel(card, 'ConsoleLabel', '电梯突击记录', 590, 34, {
            fontSize: 20,
            color: Palette.mutedLight,
            bold: true,
            wrap: false,
        });
        consoleLabel.node.setPosition(0, layout.titleY + 52);
        const title = createLabel(card, 'Title', '选择检查任务', 560, 64, {
            fontSize: 42,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        title.node.setPosition(0, layout.titleY);
        const subtitle = createLabel(card, 'Subtitle', '完成当前关卡即可解锁下一关', 560, 48, {
            fontSize: 21,
            color: Palette.mutedLight,
            wrap: false,
        });
        subtitle.node.setPosition(0, layout.subtitleY);

        const rail = createRoundedPanel(
            card,
            'TimelineRail',
            6,
            Math.max(80, layout.listTop - layout.listBottom - 34),
            Palette.elevatorMetal,
            3,
        );
        rail.setPosition(-276, (layout.listTop + layout.listBottom) / 2);

        for (let index = 0; index < levels.length; index += 1) {
            const level = levels[index];
            const entryNode = createRoundedPanel(
                card,
                `Level-${level.order}`,
                610,
                layout.entryHeight,
                Palette.panelStrong,
                16,
            );
            entryNode.setPosition(
                0,
                layout.listTop - layout.entryHeight / 2 - index * (layout.entryHeight + layout.entryGap),
            );
            const indexBadge = createRoundedPanel(entryNode, 'IndexBadge', 58, 58, Palette.blueGrayDark, 29);
            indexBadge.setPosition(-268, 0);
            createLabel(indexBadge, 'Index', level.order < 10 ? `0${level.order}` : `${level.order}`, 48, 42, {
                fontSize: 22,
                color: Palette.white,
                bold: true,
                wrap: false,
            });
            const levelTitle = createLabel(entryNode, 'Name', level.name, 300, 46, {
                fontSize: 26,
                color: Palette.ink,
                bold: true,
                wrap: false,
            });
            levelTitle.node.setPosition(-80, 20);
            const detail = createLabel(entryNode, 'Detail', `限时 ${level.durationSeconds} 秒`, 300, 34, {
                fontSize: 18,
                color: Palette.muted,
                wrap: false,
            });
            detail.node.setPosition(-80, -25);
            const statusPill = createRoundedPanel(entryNode, 'StatusPill', 126, 44, Palette.blue, 22);
            statusPill.setPosition(222, 0);
            const status = createLabel(statusPill, 'Status', '可挑战', 112, 36, {
                fontSize: 19,
                color: Palette.white,
                bold: true,
                wrap: false,
            });
            const lockIcon = createUiNode(entryNode, 'LockIcon', 40, 48);
            lockIcon.setPosition(222, 13);
            this.paintLockIcon(lockIcon);
            lockIcon.active = false;
            const button = entryNode.addComponent(ActionButton);
            button.configure(() => {
                if (level.order <= this._highestUnlockedLevel) {
                    onSelect(level.id);
                }
            });
            this._entries.push({ level, node: entryNode, title: levelTitle, detail, statusPill, status, lockIcon, button });
        }

        const back = createThemedButton(card, 'BackButton', '返回首页', onBack, 240, 82, 'secondary');
        back.node.setPosition(0, layout.backButtonY);
        this.node.active = false;
    }

    public show(highestUnlockedLevel: number): void {
        this._highestUnlockedLevel = highestUnlockedLevel;
        for (const entry of this._entries) {
            const unlocked = entry.level.order <= highestUnlockedLevel;
            const completed = entry.level.order < highestUnlockedLevel;
            const current = unlocked && !completed;
            drawRoundedPanel(
                entry.node,
                unlocked ? Palette.panelStrong : new Color(75, 90, 99, 255),
                16,
                completed ? Palette.success : current ? Palette.blue : Palette.locked,
                current ? 5 : 3,
            );
            entry.title.color = unlocked ? Palette.ink : Palette.mutedLight;
            entry.detail.string = unlocked ? `限时 ${entry.level.durationSeconds} 秒` : '完成上一项后解锁';
            entry.detail.color = unlocked ? Palette.muted : Palette.mutedLight;
            entry.status.string = completed ? '再次挑战' : current ? '开始挑战' : '锁定';
            entry.status.color = completed ? Palette.success : Palette.white;
            drawRoundedPanel(
                entry.statusPill,
                completed ? Palette.successPale : Palette.blue,
                22,
            );
            entry.statusPill.active = unlocked;
            entry.lockIcon.active = !unlocked;
            entry.button.setInteractable(unlocked);
        }
        this.node.active = true;
    }

    public hide(): void {
        this.node.active = false;
    }

    private paintLockIcon(node: Node): void {
        const graphics = node.addComponent(Graphics);
        graphics.lineWidth = 4;
        graphics.strokeColor = Palette.mutedLight;
        graphics.arc(0, 8, 11, 0, Math.PI, false);
        graphics.stroke();
        graphics.fillColor = Palette.locked;
        graphics.roundRect(-16, -17, 32, 28, 6);
        graphics.fill();
        graphics.fillColor = Palette.backgroundDeep;
        graphics.circle(0, -4, 3);
        graphics.fill();
    }
}
