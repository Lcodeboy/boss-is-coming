import { LevelTaskConfig, TaskResult } from '../data/LevelTypes';

/** 管理静态与动态任务；未激活的动态任务同样会阻止提前完成。 */
export class TaskTracker {
    private readonly _activeTaskIds = new Set<string>();
    private readonly _completedTaskIds = new Set<string>();
    private _tasks: readonly LevelTaskConfig[] = [];

    public configure(tasks: readonly LevelTaskConfig[]): void {
        this._tasks = tasks;
        this.reset();
    }

    public activate(taskId: string): boolean {
        if (this._activeTaskIds.has(taskId) || !this._tasks.some((task) => task.id === taskId)) {
            return false;
        }
        this._activeTaskIds.add(taskId);
        return true;
    }

    public completeReadyTasks(completedActionIds: ReadonlySet<string>): readonly string[] {
        const completedNow: string[] = [];
        for (const task of this._tasks) {
            if (
                this._activeTaskIds.has(task.id)
                && !this._completedTaskIds.has(task.id)
                && task.requiredActionIds.every((actionId) => completedActionIds.has(actionId))
            ) {
                this._completedTaskIds.add(task.id);
                completedNow.push(task.id);
            }
        }
        return completedNow;
    }

    public isComplete(taskId: string): boolean {
        return this._completedTaskIds.has(taskId);
    }

    public isActive(taskId: string): boolean {
        return this._activeTaskIds.has(taskId);
    }

    public get completedCount(): number {
        return this._completedTaskIds.size;
    }

    public get activeCount(): number {
        return this._activeTaskIds.size;
    }

    public get totalCount(): number {
        return this._tasks.length;
    }

    public get allCompleted(): boolean {
        return this._tasks.length > 0 && this._completedTaskIds.size === this._tasks.length;
    }

    public get activeTaskIds(): readonly string[] {
        return Array.from(this._activeTaskIds);
    }

    public createResults(): readonly TaskResult[] {
        return this._tasks.map((task) => ({
            task,
            completed: this._completedTaskIds.has(task.id),
        }));
    }

    public firstIncompleteTask(): LevelTaskConfig | null {
        return this._tasks.find((task) => !this._completedTaskIds.has(task.id)) ?? null;
    }

    public reset(): void {
        this._activeTaskIds.clear();
        this._completedTaskIds.clear();
        for (const task of this._tasks) {
            if (task.initiallyActive) {
                this._activeTaskIds.add(task.id);
            }
        }
    }
}
