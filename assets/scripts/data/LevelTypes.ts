export interface PointData {
    readonly x: number;
    readonly y: number;
}

export interface SizeData {
    readonly width: number;
    readonly height: number;
}

export type ItemInteraction = 'click' | 'drag' | 'static';
export type ItemVisual =
    | 'monitor'
    | 'console'
    | 'snack'
    | 'contract'
    | 'contract-red'
    | 'contract-yellow'
    | 'plant'
    | 'report-page'
    | 'bound-report'
    | 'coffee'
    | 'visitor-badge';

export interface LevelTaskConfig {
    readonly id: string;
    readonly prompt: string;
    readonly successInspection: string;
    readonly failureInspection: string;
    readonly requiredActionIds: readonly string[];
    readonly initiallyActive: boolean;
}

export interface DropZoneConfig {
    readonly id: string;
    readonly label: string;
    readonly position: PointData;
    readonly size: SizeData;
    readonly progressActionIds: readonly string[];
    readonly progressCompleteLabel?: string;
}

export interface WorkItemConfig {
    readonly id: string;
    readonly label: string;
    readonly interaction: ItemInteraction;
    readonly visual: ItemVisual;
    readonly initialPosition: PointData;
    readonly size: SizeData;
    readonly actionId?: string;
    readonly targetZoneId?: string;
    readonly completionFeedback?: string;
    readonly wrongDropFeedback?: string;
    readonly clickStates: readonly string[];
    readonly progressFeedbacks: readonly string[];
    readonly initiallyVisible: boolean;
    readonly unlockWhenActionIds: readonly string[];
    readonly completeZoneOnDrop: boolean;
}

export interface LevelTimedEventConfig {
    readonly id: string;
    readonly triggerRemainingSeconds: number;
    readonly notification: string;
    readonly activateTaskIds: readonly string[];
    readonly activateItemIds: readonly string[];
}

export interface LevelConfig {
    readonly id: string;
    readonly order: number;
    readonly name: string;
    readonly durationSeconds: number;
    readonly targetFloor: number;
    readonly intro: string;
    readonly tutorial: readonly string[];
    readonly tasks: readonly LevelTaskConfig[];
    readonly zones: readonly DropZoneConfig[];
    readonly items: readonly WorkItemConfig[];
    readonly events: readonly LevelTimedEventConfig[];
    readonly successEvaluation: string;
    readonly failureEvaluation: string;
}

export interface TaskResult {
    readonly task: LevelTaskConfig;
    readonly completed: boolean;
}
