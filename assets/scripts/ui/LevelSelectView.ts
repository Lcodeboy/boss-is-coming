import { _decorator, Color, Component, Label, Node } from 'cc';
import { calculateLevelSelectLayout, FixedWidthViewport } from '../core/ViewportLayout';
import { LevelConfig } from '../data/LevelTypes';
import { ActionButton } from './ActionButton';
import { createLabel, createRoundedPanel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

interface LevelButtonEntry {
    readonly level: LevelConfig;
    readonly node: Node;
    readonly title: Label;
    readonly detail: Label;
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
            Palette.panel,
            30,
            Palette.paleBlue,
            4,
        );
        card.setPosition(0, layout.panelY);
        const title = createLabel(card, 'Title', '选择关卡', 560, 72, {
            fontSize: 44,
            color: Palette.ink,
            bold: true,
        });
        title.node.setPosition(0, layout.titleY);
        const subtitle = createLabel(card, 'Subtitle', '完成当前关卡即可解锁下一关', 560, 48, {
            fontSize: 23,
            color: Palette.muted,
            wrap: false,
        });
        subtitle.node.setPosition(0, layout.subtitleY);

        for (let index = 0; index < levels.length; index += 1) {
            const level = levels[index];
            const entryNode = createRoundedPanel(card, `Level-${level.order}`, 610, layout.entryHeight, Palette.paleBlue, 22);
            entryNode.setPosition(
                0,
                layout.listTop - layout.entryHeight / 2 - index * (layout.entryHeight + layout.entryGap),
            );
            const levelTitle = createLabel(entryNode, 'Name', `第${level.order}关 · ${level.name}`, 540, 66, {
                fontSize: 28,
                color: Palette.ink,
                bold: true,
                wrap: false,
            });
            levelTitle.node.setPosition(0, layout.entryHeight * 0.17);
            const detail = createLabel(entryNode, 'Detail', `${level.durationSeconds}秒`, 500, 48, {
                fontSize: 21,
                color: Palette.muted,
                wrap: false,
            });
            detail.node.setPosition(0, -layout.entryHeight * 0.20);
            const button = entryNode.addComponent(ActionButton);
            button.configure(() => {
                if (level.order <= this._highestUnlockedLevel) {
                    onSelect(level.id);
                }
            });
            this._entries.push({ level, node: entryNode, title: levelTitle, detail, button });
        }

        const backNode = createRoundedPanel(card, 'BackButton', 260, 90, Palette.blueGray, 24);
        backNode.setPosition(0, layout.backButtonY);
        createLabel(backNode, 'BackText', '返回首页', 230, 70, {
            fontSize: 28,
            color: Palette.white,
            bold: true,
            wrap: false,
        });
        backNode.addComponent(ActionButton).configure(onBack);
        this.node.active = false;
    }

    public show(highestUnlockedLevel: number): void {
        this._highestUnlockedLevel = highestUnlockedLevel;
        for (const entry of this._entries) {
            const unlocked = entry.level.order <= highestUnlockedLevel;
            drawRoundedPanel(
                entry.node,
                unlocked ? Palette.paleBlue : new Color(220, 222, 222, 255),
                22,
                unlocked ? Palette.blue : Palette.muted,
                3,
            );
            entry.title.color = unlocked ? Palette.ink : Palette.muted;
            entry.detail.string = unlocked ? `${entry.level.durationSeconds}秒 · 点击挑战` : '尚未解锁';
            entry.detail.color = unlocked ? Palette.blue : Palette.muted;
            entry.button.setInteractable(unlocked);
        }
        this.node.active = true;
    }

    public hide(): void {
        this.node.active = false;
    }
}
