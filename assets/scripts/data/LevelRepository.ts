import { JsonAsset, resources } from 'cc';
import {
    DropZoneConfig,
    ItemInteraction,
    ItemVisual,
    LevelConfig,
    LevelTaskConfig,
    PointData,
    SizeData,
    WorkItemConfig,
} from './LevelTypes';

type JsonRecord = Record<string, unknown>;

const INTERACTIONS: readonly ItemInteraction[] = ['click', 'drag', 'static'];
const VISUALS: readonly ItemVisual[] = ['monitor', 'console', 'snack', 'contract', 'plant'];

/** 统一加载并校验关卡数据，避免 UI 层依赖某个具体关卡。 */
export class LevelRepository {
    public static load(levelId: string): Promise<LevelConfig> {
        return new Promise<LevelConfig>((resolve, reject) => {
            resources.load(`levels/${levelId}`, JsonAsset, (error, asset) => {
                if (error) {
                    reject(new Error(`关卡 ${levelId} 加载失败：${error.message}`));
                    return;
                }

                try {
                    resolve(parseLevel(asset.json as unknown));
                } catch (parseError: unknown) {
                    const message = parseError instanceof Error ? parseError.message : String(parseError);
                    reject(new Error(`关卡 ${levelId} 配置无效：${message}`));
                }
            });
        });
    }
}

function parseLevel(value: unknown): LevelConfig {
    const source = readRecord(value, 'root');
    const tasks = readArray(source.tasks, 'tasks').map((entry, index) => parseTask(entry, index));
    const zones = readArray(source.zones, 'zones').map((entry, index) => parseZone(entry, index));
    const items = readArray(source.items, 'items').map((entry, index) => parseItem(entry, index));
    assertUniqueIds(tasks, '任务');
    assertUniqueIds(zones, '区域');
    assertUniqueIds(items, '物品');
    const taskIds = new Set(tasks.map((task) => task.id));
    const zoneIds = new Set(zones.map((zone) => zone.id));
    const taskItemCounts = new Map<string, number>();

    for (const item of items) {
        if (item.taskId !== undefined && !taskIds.has(item.taskId)) {
            throw new Error(`物品 ${item.id} 引用了不存在的任务 ${item.taskId}`);
        }
        if (item.targetZoneId !== undefined && !zoneIds.has(item.targetZoneId)) {
            throw new Error(`物品 ${item.id} 引用了不存在的区域 ${item.targetZoneId}`);
        }
        if (item.interaction === 'drag' && item.targetZoneId === undefined) {
            throw new Error(`拖拽物品 ${item.id} 必须配置 targetZoneId`);
        }
        if (item.interaction !== 'static' && item.taskId === undefined) {
            throw new Error(`可交互物品 ${item.id} 必须配置 taskId`);
        }
        if (item.taskId !== undefined) {
            taskItemCounts.set(item.taskId, (taskItemCounts.get(item.taskId) ?? 0) + 1);
        }
    }

    if (tasks.length === 0) {
        throw new Error('关卡至少需要一个任务');
    }
    for (const task of tasks) {
        if (taskItemCounts.get(task.id) !== 1) {
            throw new Error(`任务 ${task.id} 必须且只能关联一个物品`);
        }
    }

    return {
        id: readString(source.id, 'id'),
        name: readString(source.name, 'name'),
        durationSeconds: readPositiveNumber(source.durationSeconds, 'durationSeconds'),
        targetFloor: readPositiveNumber(source.targetFloor, 'targetFloor'),
        intro: readString(source.intro, 'intro'),
        tasks,
        zones,
        items,
        successEvaluation: readString(source.successEvaluation, 'successEvaluation'),
        failureEvaluation: readString(source.failureEvaluation, 'failureEvaluation'),
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

function parseTask(value: unknown, index: number): LevelTaskConfig {
    const source = readRecord(value, `tasks[${index}]`);
    return {
        id: readString(source.id, `tasks[${index}].id`),
        prompt: readString(source.prompt, `tasks[${index}].prompt`),
        successInspection: readString(source.successInspection, `tasks[${index}].successInspection`),
        failureInspection: readString(source.failureInspection, `tasks[${index}].failureInspection`),
    };
}

function parseZone(value: unknown, index: number): DropZoneConfig {
    const source = readRecord(value, `zones[${index}]`);
    return {
        id: readString(source.id, `zones[${index}].id`),
        label: readString(source.label, `zones[${index}].label`),
        position: readPoint(source.position, `zones[${index}].position`),
        size: readSize(source.size, `zones[${index}].size`),
    };
}

function parseItem(value: unknown, index: number): WorkItemConfig {
    const source = readRecord(value, `items[${index}]`);
    const interaction = readEnum(source.interaction, INTERACTIONS, `items[${index}].interaction`);
    const visual = readEnum(source.visual, VISUALS, `items[${index}].visual`);
    return {
        id: readString(source.id, `items[${index}].id`),
        label: readString(source.label, `items[${index}].label`),
        interaction,
        visual,
        initialPosition: readPoint(source.initialPosition, `items[${index}].initialPosition`),
        size: readSize(source.size, `items[${index}].size`),
        taskId: readOptionalString(source.taskId, `items[${index}].taskId`),
        targetZoneId: readOptionalString(source.targetZoneId, `items[${index}].targetZoneId`),
        completionFeedback: readOptionalString(source.completionFeedback, `items[${index}].completionFeedback`),
    };
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

function readString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${path} 必须是非空字符串`);
    }
    return value;
}

function readOptionalString(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : readString(value, path);
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
