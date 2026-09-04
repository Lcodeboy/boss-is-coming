export interface PointData {
    readonly x: number;
    readonly y: number;
}

export interface SizeData {
    readonly width: number;
    readonly height: number;
}

export type ItemInteraction = 'click' | 'drag' | 'static';
export type ItemVisual = 'monitor' | 'console' | 'snack' | 'contract' | 'plant';

export interface LevelTaskConfig {
    readonly id: string;
    readonly prompt: string;
    readonly successInspection: string;
    readonly failureInspection: string;
}

export interface DropZoneConfig {
    readonly id: string;
    readonly label: string;
    readonly position: PointData;
    readonly size: SizeData;
}

export interface WorkItemConfig {
    readonly id: string;
    readonly label: string;
    readonly interaction: ItemInteraction;
    readonly visual: ItemVisual;
    readonly initialPosition: PointData;
    readonly size: SizeData;
    readonly taskId?: string;
    readonly targetZoneId?: string;
    readonly completionFeedback?: string;
}

export interface LevelConfig {
    readonly id: string;
    readonly name: string;
    readonly durationSeconds: number;
    readonly targetFloor: number;
    readonly intro: string;
    readonly tasks: readonly LevelTaskConfig[];
    readonly zones: readonly DropZoneConfig[];
    readonly items: readonly WorkItemConfig[];
    readonly successEvaluation: string;
    readonly failureEvaluation: string;
}

export interface TaskResult {
    readonly task: LevelTaskConfig;
    readonly completed: boolean;
}
