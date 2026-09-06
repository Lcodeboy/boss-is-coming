import {
    DropZoneConfig,
    DropZoneVisual,
    EventMessageStyle,
    ItemInteraction,
    ItemVisual,
    ItemVisualVariant,
    LevelConfig,
    LevelTaskConfig,
    LevelTimedEventConfig,
    PointData,
    SizeData,
    WorkItemConfig,
} from './LevelTypes';

type JsonRecord = Record<string, unknown>;

const INTERACTIONS: readonly ItemInteraction[] = ['click', 'drag', 'static'];
const VISUALS: readonly ItemVisual[] = [
    'monitor',
    'console',
    'snack',
    'contract',
    'contract-red',
    'contract-yellow',
    'plant',
    'report-page',
    'bound-report',
    'coffee',
    'visitor-badge',
];
const VISUAL_VARIANTS: readonly ItemVisualVariant[] = [
    'file-current',
    'file-archive',
    'file-reference',
    'report-bars',
    'report-line',
    'report-donut',
    'monitor-two-step',
];
const ZONE_VISUALS: readonly DropZoneVisual[] = [
    'drawer',
    'trash',
    'review-tray',
    'report-folder',
    'badge-stand',
    'compat',
];
const EVENT_MESSAGE_STYLES: readonly EventMessageStyle[] = ['coworker', 'boss', 'neutral'];

/** 将未知 JSON 转为完整关卡配置，并校验所有跨引用。 */
export function parseLevel(value: unknown): LevelConfig {
    const source = readRecord(value, 'root');
    const tasks = readArray(source.tasks, 'tasks').map((entry, index) => parseTask(entry, index));
    const zones = readArray(source.zones, 'zones').map((entry, index) => parseZone(entry, index));
    const items = readArray(source.items, 'items').map((entry, index) => parseItem(entry, index));
    const events = readOptionalArray(source.events, 'events').map((entry, index) => parseEvent(entry, index));
    const durationSeconds = readPositiveNumber(source.durationSeconds, 'durationSeconds');

    assertUniqueIds(tasks, '任务');
    assertUniqueIds(zones, '区域');
    assertUniqueIds(items, '物品');
    assertUniqueIds(events, '事件');
    validateReferences(tasks, zones, items, events, durationSeconds);

    if (tasks.length === 0) {
        throw new Error('关卡至少需要一个任务');
    }

    return {
        id: readString(source.id, 'id'),
        order: readPositiveInteger(source.order, 'order'),
        name: readString(source.name, 'name'),
        durationSeconds,
        targetFloor: readPositiveInteger(source.targetFloor, 'targetFloor'),
        intro: readString(source.intro, 'intro'),
        tutorial: readOptionalStringArray(source.tutorial, 'tutorial'),
        tasks,
        zones,
        items,
        events,
        successEvaluation: readString(source.successEvaluation, 'successEvaluation'),
        failureEvaluation: readString(source.failureEvaluation, 'failureEvaluation'),
    };
}

/** 校验多份关卡之间的ID和顺序，返回按关卡顺序排列的只读数组。 */
export function validateLevelCatalog(levels: readonly LevelConfig[]): readonly LevelConfig[] {
    if (levels.length === 0) {
        throw new Error('关卡目录不能为空');
    }
    assertUniqueIds(levels, '关卡');
    const orders = new Set<number>();
    for (const level of levels) {
        if (orders.has(level.order)) {
            throw new Error(`关卡顺序重复：${level.order}`);
        }
        orders.add(level.order);
    }
    const sorted = [...levels].sort((left, right) => left.order - right.order);
    for (let index = 0; index < sorted.length; index += 1) {
        if (sorted[index].order !== index + 1) {
            throw new Error('关卡顺序必须从1开始连续递增');
        }
    }
    return sorted;
}

function validateReferences(
    tasks: readonly LevelTaskConfig[],
    zones: readonly DropZoneConfig[],
    items: readonly WorkItemConfig[],
    events: readonly LevelTimedEventConfig[],
    durationSeconds: number,
): void {
    const taskIds = new Set(tasks.map((task) => task.id));
    const zoneIds = new Set(zones.map((zone) => zone.id));
    const itemIds = new Set(items.map((item) => item.id));
    const actionIds = new Set<string>();
    const eventTaskIds = new Set<string>();
    const eventItemIds = new Set<string>();

    for (const item of items) {
        if (item.actionId !== undefined) {
            if (actionIds.has(item.actionId)) {
                throw new Error(`动作 ID 重复：${item.actionId}`);
            }
            actionIds.add(item.actionId);
        }
        if (item.targetZoneId !== undefined && !zoneIds.has(item.targetZoneId)) {
            throw new Error(`物品 ${item.id} 引用了不存在的区域 ${item.targetZoneId}`);
        }
        if (item.interaction === 'drag' && item.actionId !== undefined && item.targetZoneId === undefined) {
            throw new Error(`可完成动作的拖拽物品 ${item.id} 必须配置 targetZoneId`);
        }
        if (item.interaction === 'click' && item.clickStates.length < 2) {
            throw new Error(`点击物品 ${item.id} 至少需要两个 clickStates`);
        }
        if (item.interaction === 'static' && item.actionId !== undefined) {
            throw new Error(`静态物品 ${item.id} 不能配置 actionId`);
        }
        if (!item.initiallyVisible && item.unlockWhenActionIds.length === 0) {
            eventItemIds.add(item.id);
        }
    }

    for (const task of tasks) {
        if (task.requiredActionIds.length === 0) {
            throw new Error(`任务 ${task.id} 至少需要一个动作`);
        }
        for (const actionId of task.requiredActionIds) {
            if (!actionIds.has(actionId)) {
                throw new Error(`任务 ${task.id} 引用了不存在的动作 ${actionId}`);
            }
        }
        if (!task.initiallyActive) {
            eventTaskIds.add(task.id);
        }
    }

    for (const item of items) {
        for (const actionId of item.unlockWhenActionIds) {
            if (!actionIds.has(actionId)) {
                throw new Error(`物品 ${item.id} 的前置动作不存在：${actionId}`);
            }
        }
    }

    for (const zone of zones) {
        for (const actionId of zone.progressActionIds) {
            if (!actionIds.has(actionId)) {
                throw new Error(`区域 ${zone.id} 的进度动作不存在：${actionId}`);
            }
        }
    }

    for (const event of events) {
        if (event.triggerRemainingSeconds > durationSeconds) {
            throw new Error(`事件 ${event.id} 的触发时间超过关卡时长`);
        }
        for (const taskId of event.activateTaskIds) {
            if (!taskIds.has(taskId)) {
                throw new Error(`事件 ${event.id} 引用了不存在的任务 ${taskId}`);
            }
            eventTaskIds.delete(taskId);
        }
        for (const itemId of event.activateItemIds) {
            if (!itemIds.has(itemId)) {
                throw new Error(`事件 ${event.id} 引用了不存在的物品 ${itemId}`);
            }
            eventItemIds.delete(itemId);
        }
    }

    if (eventTaskIds.size > 0) {
        throw new Error(`动态任务缺少激活事件：${[...eventTaskIds].join(', ')}`);
    }
    if (eventItemIds.size > 0) {
        throw new Error(`隐藏物品缺少激活条件：${[...eventItemIds].join(', ')}`);
    }
}

function parseTask(value: unknown, index: number): LevelTaskConfig {
    const path = `tasks[${index}]`;
    const source = readRecord(value, path);
    return {
        id: readString(source.id, `${path}.id`),
        prompt: readString(source.prompt, `${path}.prompt`),
        successInspection: readString(source.successInspection, `${path}.successInspection`),
        failureInspection: readString(source.failureInspection, `${path}.failureInspection`),
        requiredActionIds: readStringArray(source.requiredActionIds, `${path}.requiredActionIds`),
        initiallyActive: readOptionalBoolean(source.initiallyActive, `${path}.initiallyActive`, true),
    };
}

function parseZone(value: unknown, index: number): DropZoneConfig {
    const path = `zones[${index}]`;
    const source = readRecord(value, path);
    return {
        id: readString(source.id, `${path}.id`),
        label: readString(source.label, `${path}.label`),
        position: readPoint(source.position, `${path}.position`),
        size: readSize(source.size, `${path}.size`),
        visual: readOptionalEnum(source.visual, ZONE_VISUALS, `${path}.visual`, 'compat') ?? 'compat',
        progressActionIds: readOptionalStringArray(source.progressActionIds, `${path}.progressActionIds`),
        progressCompleteLabel: readOptionalString(source.progressCompleteLabel, `${path}.progressCompleteLabel`),
    };
}

function parseItem(value: unknown, index: number): WorkItemConfig {
    const path = `items[${index}]`;
    const source = readRecord(value, path);
    return {
        id: readString(source.id, `${path}.id`),
        label: readString(source.label, `${path}.label`),
        interaction: readEnum(source.interaction, INTERACTIONS, `${path}.interaction`),
        visual: readEnum(source.visual, VISUALS, `${path}.visual`),
        visualVariant: readOptionalEnum(source.visualVariant, VISUAL_VARIANTS, `${path}.visualVariant`),
        visualBadge: readOptionalString(source.visualBadge, `${path}.visualBadge`),
        visualCode: readOptionalString(source.visualCode, `${path}.visualCode`),
        initialPosition: readPoint(source.initialPosition, `${path}.initialPosition`),
        size: readSize(source.size, `${path}.size`),
        actionId: readOptionalString(source.actionId, `${path}.actionId`),
        targetZoneId: readOptionalString(source.targetZoneId, `${path}.targetZoneId`),
        completionFeedback: readOptionalString(source.completionFeedback, `${path}.completionFeedback`),
        wrongDropFeedback: readOptionalString(source.wrongDropFeedback, `${path}.wrongDropFeedback`),
        clickStates: readOptionalStringArray(source.clickStates, `${path}.clickStates`),
        progressFeedbacks: readOptionalStringArray(source.progressFeedbacks, `${path}.progressFeedbacks`),
        initiallyVisible: readOptionalBoolean(source.initiallyVisible, `${path}.initiallyVisible`, true),
        unlockWhenActionIds: readOptionalStringArray(source.unlockWhenActionIds, `${path}.unlockWhenActionIds`),
        completeZoneOnDrop: readOptionalBoolean(source.completeZoneOnDrop, `${path}.completeZoneOnDrop`, true),
    };
}

function parseEvent(value: unknown, index: number): LevelTimedEventConfig {
    const path = `events[${index}]`;
    const source = readRecord(value, path);
    return {
        id: readString(source.id, `${path}.id`),
        triggerRemainingSeconds: readPositiveNumber(source.triggerRemainingSeconds, `${path}.triggerRemainingSeconds`),
        notification: readString(source.notification, `${path}.notification`),
        messageStyle: readOptionalEnum(source.messageStyle, EVENT_MESSAGE_STYLES, `${path}.messageStyle`, 'neutral') ?? 'neutral',
        activateTaskIds: readOptionalStringArray(source.activateTaskIds, `${path}.activateTaskIds`),
        activateItemIds: readOptionalStringArray(source.activateItemIds, `${path}.activateItemIds`),
    };
}

function assertUniqueIds(entries: readonly { readonly id: string }[], label: string): void {
    const ids = new Set<string>();
    for (const entry of entries) {
        if (ids.has(entry.id)) {
            throw new Error(`${label} ID 重复：${entry.id}`);
        }
        ids.add(entry.id);
    }
}

function readRecord(value: unknown, path: string): JsonRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${path} 必须是对象`);
    }
    return value as JsonRecord;
}

function readArray(value: unknown, path: string): readonly unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} 必须是数组`);
    }
    return value;
}

function readOptionalArray(value: unknown, path: string): readonly unknown[] {
    return value === undefined ? [] : readArray(value, path);
}

function readString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${path} 必须是非空字符串`);
    }
    return value;
}

function readOptionalString(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : readString(value, path);
}

function readStringArray(value: unknown, path: string): readonly string[] {
    const entries = readArray(value, path).map((entry, index) => readString(entry, `${path}[${index}]`));
    if (new Set(entries).size !== entries.length) {
        throw new Error(`${path} 不能包含重复值`);
    }
    return entries;
}

function readOptionalStringArray(value: unknown, path: string): readonly string[] {
    return value === undefined ? [] : readStringArray(value, path);
}

function readOptionalBoolean(value: unknown, path: string, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`${path} 必须是布尔值`);
    }
    return value;
}

function readPositiveInteger(value: unknown, path: string): number {
    const number = readPositiveNumber(value, path);
    if (!Number.isInteger(number)) {
        throw new Error(`${path} 必须是正整数`);
    }
    return number;
}

function readPositiveNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${path} 必须是正数`);
    }
    return value;
}

function readPoint(value: unknown, path: string): PointData {
    const source = readRecord(value, path);
    return {
        x: readFiniteNumber(source.x, `${path}.x`),
        y: readFiniteNumber(source.y, `${path}.y`),
    };
}

function readSize(value: unknown, path: string): SizeData {
    const source = readRecord(value, path);
    return {
        width: readPositiveNumber(source.width, `${path}.width`),
        height: readPositiveNumber(source.height, `${path}.height`),
    };
}

function readFiniteNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${path} 必须是有限数字`);
    }
    return value;
}

function readEnum<T extends string>(value: unknown, choices: readonly T[], path: string): T {
    if (typeof value !== 'string' || choices.indexOf(value as T) < 0) {
        throw new Error(`${path} 不是受支持的值`);
    }
    return value as T;
}

function readOptionalEnum<T extends string>(
    value: unknown,
    choices: readonly T[],
    path: string,
    fallback?: T,
): T | undefined {
    if (value === undefined) {
        return fallback;
    }
    return readEnum(value, choices, path);
}
