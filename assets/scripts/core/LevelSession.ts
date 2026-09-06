import { LevelConfig, LevelTaskConfig, LevelTimedEventConfig, TaskResult, WorkItemConfig } from '../data/LevelTypes';
import { TaskTracker } from './TaskTracker';

export interface ZoneProgress {
    readonly zoneId: string;
    readonly completed: number;
    readonly total: number;
}

export interface LevelSessionSnapshot {
    readonly activeTaskIds: readonly string[];
    readonly activeItemIds: readonly string[];
    readonly completedTaskIds: readonly string[];
    readonly zoneProgress: readonly ZoneProgress[];
}

export interface LevelSessionUpdate {
    readonly accepted: boolean;
    readonly activatedTaskIds: readonly string[];
    readonly activatedItemIds: readonly string[];
    readonly completedTaskIds: readonly string[];
    readonly triggeredEvents: readonly LevelTimedEventConfig[];
    readonly zoneProgress: readonly ZoneProgress[];
}

const EMPTY_UPDATE: LevelSessionUpdate = {
    accepted: false,
    activatedTaskIds: [],
    activatedItemIds: [],
    completedTaskIds: [],
    triggeredEvents: [],
    zoneProgress: [],
};

/** 单轮关卡的纯逻辑会话，统一处理动作组合、前置条件和定时事件。 */
export class LevelSession {
    private readonly _taskTracker = new TaskTracker();
    private readonly _completedActionIds = new Set<string>();
    private readonly _activeItemIds = new Set<string>();
    private readonly _triggeredEventIds = new Set<string>();
    private readonly _itemsById = new Map<string, WorkItemConfig>();
    private _level: LevelConfig | null = null;

    public configure(level: LevelConfig): void {
        this._level = level;
        this._itemsById.clear();
        for (const item of level.items) {
            this._itemsById.set(item.id, item);
        }
        this._taskTracker.configure(level.tasks);
        this.reset();
    }

    public reset(): void {
        this._completedActionIds.clear();
        this._activeItemIds.clear();
        this._triggeredEventIds.clear();
        this._taskTracker.reset();
        for (const item of this._level?.items ?? []) {
            if (item.initiallyVisible) {
                this._activeItemIds.add(item.id);
            }
        }
    }

    public performItemAction(itemId: string): LevelSessionUpdate {
        const item = this._itemsById.get(itemId);
        const actionId = item?.actionId;
        if (item === undefined || actionId === undefined || !this._activeItemIds.has(itemId)) {
            return EMPTY_UPDATE;
        }
        if (this._completedActionIds.has(actionId)) {
            return EMPTY_UPDATE;
        }

        this._completedActionIds.add(actionId);
        const activatedItemIds = this.activateItemsUnlockedByActions();
        const completedTaskIds = this._taskTracker.completeReadyTasks(this._completedActionIds);
        return {
            accepted: true,
            activatedTaskIds: [],
            activatedItemIds,
            completedTaskIds,
            triggeredEvents: [],
            zoneProgress: this.createZoneProgress(),
        };
    }

    public advanceTime(remainingSeconds: number): LevelSessionUpdate {
        const level = this._level;
        if (level === null) {
            return EMPTY_UPDATE;
        }

        const dueEvents = level.events.filter((event) => (
            remainingSeconds <= event.triggerRemainingSeconds && !this._triggeredEventIds.has(event.id)
        ));
        if (dueEvents.length === 0) {
            return EMPTY_UPDATE;
        }

        const activatedTaskIds: string[] = [];
        const activatedItemIds: string[] = [];
        for (const event of dueEvents) {
            this._triggeredEventIds.add(event.id);
            for (const taskId of event.activateTaskIds) {
                if (this._taskTracker.activate(taskId)) {
                    activatedTaskIds.push(taskId);
                }
            }
            for (const itemId of event.activateItemIds) {
                if (!this._activeItemIds.has(itemId) && this._itemsById.has(itemId)) {
                    this._activeItemIds.add(itemId);
                    activatedItemIds.push(itemId);
                }
            }
        }

        const completedTaskIds = this._taskTracker.completeReadyTasks(this._completedActionIds);
        return {
            accepted: true,
            activatedTaskIds,
            activatedItemIds,
            completedTaskIds,
            triggeredEvents: dueEvents,
            zoneProgress: this.createZoneProgress(),
        };
    }

    public get snapshot(): LevelSessionSnapshot {
        const completedTaskIds = this._taskTracker.createResults()
            .filter((result) => result.completed)
            .map((result) => result.task.id);
        return {
            activeTaskIds: this._taskTracker.activeTaskIds,
            activeItemIds: Array.from(this._activeItemIds),
            completedTaskIds,
            zoneProgress: this.createZoneProgress(),
        };
    }

    public get allCompleted(): boolean {
        return this._taskTracker.allCompleted;
    }

    public get completedCount(): number {
        return this._taskTracker.completedCount;
    }

    public get activeTaskCount(): number {
        return this._taskTracker.activeCount;
    }

    public get totalCount(): number {
        return this._taskTracker.totalCount;
    }

    public createResults(): readonly TaskResult[] {
        return this._taskTracker.createResults();
    }

    public firstIncompleteTask(): LevelTaskConfig | null {
        return this._taskTracker.firstIncompleteTask();
    }

    public isItemActive(itemId: string): boolean {
        return this._activeItemIds.has(itemId);
    }

    public isTaskActive(taskId: string): boolean {
        return this._taskTracker.isActive(taskId);
    }

    private activateItemsUnlockedByActions(): readonly string[] {
        const activatedItemIds: string[] = [];
        for (const item of this._level?.items ?? []) {
            if (
                !this._activeItemIds.has(item.id)
                && item.unlockWhenActionIds.length > 0
                && item.unlockWhenActionIds.every((actionId) => this._completedActionIds.has(actionId))
            ) {
                this._activeItemIds.add(item.id);
                activatedItemIds.push(item.id);
            }
        }
        return activatedItemIds;
    }

    private createZoneProgress(): readonly ZoneProgress[] {
        const progress: ZoneProgress[] = [];
        for (const zone of this._level?.zones ?? []) {
            if (zone.progressActionIds.length === 0) {
                continue;
            }
            progress.push({
                zoneId: zone.id,
                completed: zone.progressActionIds.filter((actionId) => this._completedActionIds.has(actionId)).length,
                total: zone.progressActionIds.length,
            });
        }
        return progress;
    }
}
