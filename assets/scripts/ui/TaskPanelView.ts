import { _decorator, Component, Label } from 'cc';
import { LevelTaskConfig } from '../data/LevelTypes';
import { createLabel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

@ccclass('TaskPanelView')
export class TaskPanelView extends Component {
    private readonly _taskLabels = new Map<string, Label>();
    private _countLabel: Label | null = null;
    private _tasks: readonly LevelTaskConfig[] = [];

    public initialize(tasks: readonly LevelTaskConfig[]): void {
        this._tasks = tasks;
        drawRoundedPanel(this.node, Palette.panel, 20, Palette.paleBlue, 3);
        this._countLabel = createLabel(this.node, 'TaskCount', `整理清单 0/${tasks.length}`, 230, 42, {
            fontSize: 24,
            color: Palette.ink,
            bold: true,
        });
        this._countLabel.node.setPosition(-205, 51);

        const columns = 2;
        for (let index = 0; index < tasks.length; index += 1) {
            const task = tasks[index];
            const label = createLabel(this.node, `Task-${task.id}`, `○ ${task.prompt}`, 310, 52, {
                fontSize: 20,
                color: Palette.muted,
            });
            const column = index % columns;
            const row = Math.floor(index / columns);
            label.node.setPosition(-170 + column * 330, 9 - row * 54);
            this._taskLabels.set(task.id, label);
        }
    }

    public setCompleted(taskId: string, completedCount: number): void {
        const label = this._taskLabels.get(taskId);
        const task = this._tasks.find((entry) => entry.id === taskId);
        if (label !== undefined && task !== undefined) {
            label.string = `✓ ${task.prompt}`;
            label.color = Palette.success;
        }
        if (this._countLabel !== null) {
            this._countLabel.string = `整理清单 ${completedCount}/${this._tasks.length}`;
        }
    }

    public resetView(): void {
        for (const task of this._tasks) {
            const label = this._taskLabels.get(task.id);
            if (label !== undefined) {
                label.string = `○ ${task.prompt}`;
                label.color = Palette.muted;
            }
        }
        if (this._countLabel !== null) {
            this._countLabel.string = `整理清单 0/${this._tasks.length}`;
        }
    }
}
