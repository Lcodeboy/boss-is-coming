import { LevelTaskConfig, TaskResult } from '../data/LevelTypes';

export class TaskTracker {
    private readonly _completedTaskIds = new Set<string>();
    private _tasks: readonly LevelTaskConfig[] = [];

    public configure(tasks: readonly LevelTaskConfig[]): void {
        this._tasks = tasks;
        this.reset();
    }

    public complete(taskId: string): boolean {
        if (this._completedTaskIds.has(taskId) || !this._tasks.some((task) => task.id === taskId)) {
            return false;
        }
        this._completedTaskIds.add(taskId);
        return true;
    }

    public isComplete(taskId: string): boolean {
        return this._completedTaskIds.has(taskId);
    }

    public get completedCount(): number {
        return this._completedTaskIds.size;
    }

    public get totalCount(): number {
        return this._tasks.length;
    }

    public get allCompleted(): boolean {
        return this._tasks.length > 0 && this._completedTaskIds.size === this._tasks.length;
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
        this._completedTaskIds.clear();
    }
}
