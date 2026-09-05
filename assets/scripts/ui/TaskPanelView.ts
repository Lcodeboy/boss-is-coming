import { _decorator, Component, Label } from 'cc';
import { LevelTaskConfig } from '../data/LevelTypes';
import { createLabel, drawRoundedPanel, Palette } from './UIFactory';

const { ccclass } = _decorator;

@ccclass('TaskPanelView')
export class TaskPanelView extends Component {
    private readonly _taskLabels = new Map<string, Label>();
    private readonly _activeTaskIds = new Set<string>();
    private readonly _completedTaskIds = new Set<string>();
    private _countLabel: Label | null = null;
    private _tasks: readonly LevelTaskConfig[] = [];

    public initialize(tasks: readonly LevelTaskConfig[], activeTaskIds: readonly string[]): void {
        this._tasks = tasks;
        this._activeTaskIds.clear();
        activeTaskIds.forEach((taskId) => this._activeTaskIds.add(taskId));
        drawRoundedPanel(this.node, Palette.panel, 20, Palette.paleBlue, 3);
        this._countLabel = createLabel(this.node, 'TaskCount', '', 250, 42, {
            fontSize: 24,
            color: Palette.ink,
            bold: true,
            wrap: false,
        });
        this._countLabel.node.setPosition(-195, 51);

        for (const task of tasks) {
            const label = createLabel(this.node, `Task-${task.id}`, '', 310, 50, {
                fontSize: 20,
                color: Palette.muted,
                wrap: false,
            });
            this._taskLabels.set(task.id, label);
        }
        this.refreshLayout();
    }

    public activateTask(taskId: string): void {
        if (this._activeTaskIds.has(taskId)) {
            return;
        }
        this._activeTaskIds.add(taskId);
        this.refreshLayout();
    }

    public setCompleted(taskId: string): void {
        if (!this._activeTaskIds.has(taskId)) {
            return;
        }
        this._completedTaskIds.add(taskId);
        this.refreshLabel(taskId);
        this.refreshCount();
    }

    public resetView(activeTaskIds: readonly string[]): void {
        this._activeTaskIds.clear();
        activeTaskIds.forEach((taskId) => this._activeTaskIds.add(taskId));
        this._completedTaskIds.clear();
        this.refreshLayout();
    }

    private refreshLayout(): void {
        const activeTasks = this._tasks.filter((task) => this._activeTaskIds.has(task.id));
        for (const task of this._tasks) {
            const label = this._taskLabels.get(task.id);
            if (label !== undefined) {
                label.node.active = this._activeTaskIds.has(task.id);
            }
        }
        for (let index = 0; index < activeTasks.length; index += 1) {
            const task = activeTasks[index];
            const label = this._taskLabels.get(task.id);
            if (label === undefined) {
                continue;
            }
            const column = index % 2;
            const row = Math.floor(index / 2);
            label.node.setPosition(-170 + column * 330, 0 - row * 52);
            this.refreshLabel(task.id);
        }
        this.refreshCount();
    }

    private refreshLabel(taskId: string): void {
        const label = this._taskLabels.get(taskId);
        const task = this._tasks.find((entry) => entry.id === taskId);
        if (label === undefined || task === undefined) {
            return;
        }
        const completed = this._completedTaskIds.has(taskId);
        label.string = `${completed ? '✓' : '○'} ${task.prompt}`;
        label.color = completed ? Palette.success : Palette.muted;
    }

    private refreshCount(): void {
        if (this._countLabel !== null) {
            this._countLabel.string = `整理清单 ${this._completedTaskIds.size}/${this._activeTaskIds.size}`;
        }
    }
}
