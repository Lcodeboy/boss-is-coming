import { LevelSession } from '../assets/scripts/core/LevelSession';
import { ProgressService, ProgressStorage } from '../assets/scripts/core/ProgressService';
import { parseLevel, validateLevelCatalog } from '../assets/scripts/data/LevelParser';
import { LevelConfig, WorkItemConfig } from '../assets/scripts/data/LevelTypes';
import { calculateCoveredRatio, ITEM_VISUAL_TOP_OVERFLOW, VisualRect } from '../assets/scripts/ui/VisualMetrics';

declare function require(moduleName: string): unknown;

interface FileSystemReader {
    readFileSync(path: string, encoding: 'utf8'): string;
}

type JsonRecord = Record<string, unknown>;

const fileSystem = require('fs') as FileSystemReader;

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function loadLevels(): readonly LevelConfig[] {
    const levels: LevelConfig[] = [];
    for (let order = 1; order <= 5; order += 1) {
        const id = `00${order}`.slice(-3);
        const raw = fileSystem.readFileSync(`assets/resources/levels/level-${id}.json`, 'utf8');
        levels.push(parseLevel(JSON.parse(raw) as unknown));
    }
    return validateLevelCatalog(levels);
}

function getLevel(levels: readonly LevelConfig[], order: number): LevelConfig {
    const level = levels.find((entry) => entry.order === order);
    if (level === undefined) {
        throw new Error(`缺少第${order}关`);
    }
    return level;
}

function getItem(level: LevelConfig, itemId: string): WorkItemConfig {
    const item = level.items.find((entry) => entry.id === itemId);
    if (item === undefined) {
        throw new Error(`${level.id} 缺少物品 ${itemId}`);
    }
    return item;
}

function assertUniqueStrings(values: readonly (string | undefined)[], message: string): void {
    assert(values.every((value) => value !== undefined), `${message}：存在缺失值`);
    assert(new Set(values).size === values.length, message);
}

function createRect(
    x: number,
    y: number,
    width: number,
    height: number,
    topOverflow = 0,
): VisualRect {
    return {
        left: x - width / 2,
        right: x + width / 2,
        bottom: y - height / 2,
        top: y + height / 2 + topOverflow,
    };
}

function visualTopOverflow(item: WorkItemConfig): number {
    if (item.visual === 'coffee') {
        return ITEM_VISUAL_TOP_OVERFLOW.coffee;
    }
    if (item.visual === 'visitor-badge') {
        return ITEM_VISUAL_TOP_OVERFLOW['visitor-badge'];
    }
    return 0;
}

function assertItemDoesNotCoverTarget(level: LevelConfig, item: WorkItemConfig): void {
    if (item.targetZoneId === undefined) {
        return;
    }
    const zone = level.zones.find((entry) => entry.id === item.targetZoneId);
    assert(zone !== undefined, `${level.id}/${item.id} 的目标区域不存在`);
    if (zone === undefined) {
        return;
    }
    const itemRect = createRect(
        item.initialPosition.x,
        item.initialPosition.y,
        item.size.width,
        item.size.height,
        visualTopOverflow(item),
    );
    const zoneRect = createRect(zone.position.x, zone.position.y, zone.size.width, zone.size.height);
    assert(
        calculateCoveredRatio(zoneRect, itemRect) <= 0.2,
        `${level.id}/${item.id} 的初始视觉遮挡了目标区域`,
    );
}

function completeConfiguredLevel(session: LevelSession, level: LevelConfig): void {
    session.advanceTime(0);
    for (let pass = 0; pass <= level.items.length; pass += 1) {
        for (const item of level.items) {
            if (item.actionId !== undefined && session.isItemActive(item.id)) {
                session.performItemAction(item.id);
            }
        }
    }
}

class MemoryStorage implements ProgressStorage {
    private readonly _values = new Map<string, string>();

    public getItem(key: string): string | null {
        return this._values.get(key) ?? null;
    }

    public setItem(key: string, value: string): void {
        this._values.set(key, value);
    }
}

const levels = loadLevels();
assert(levels.length === 5, '必须加载五份有效关卡配置');
assert(levels.map((level) => level.id).join(',') === 'level-001,level-002,level-003,level-004,level-005', '关卡顺序错误');

const level1 = getLevel(levels, 1);
const level1VisualMap = level1.items.map((item) => `${item.id}:${item.visual}:${item.visualVariant ?? '-'}`).join(',');
assert(
    level1VisualMap === 'monitor:monitor:-,console:console:-,snack:snack:-,contract:contract:-,plant:plant:-',
    '第一关已验收的物品视觉映射不得改变',
);
assert(
    level1.zones.map((zone) => `${zone.id}:${zone.visual}`).join(',') === 'drawer:drawer,trash:trash,review:review-tray',
    '第一关已验收的目标区域视觉映射不得改变',
);

const legacyLevelRaw = JSON.parse(fileSystem.readFileSync('assets/resources/levels/level-001.json', 'utf8')) as JsonRecord;
const legacyZones = legacyLevelRaw.zones as JsonRecord[];
for (const zone of legacyZones) {
    delete zone.visual;
}
const legacyParsed = parseLevel(legacyLevelRaw);
assert(legacyParsed.zones.every((zone) => zone.visual === 'compat'), '旧配置缺少区域视觉字段时必须回退兼容外观');

const level2 = getLevel(levels, 2);
const level2Files = ['blue-contract', 'red-contract', 'yellow-contract'].map((id) => getItem(level2, id));
assertUniqueStrings(level2Files.map((item) => item.visualVariant), '第2关三份文件视觉类型必须唯一');
assertUniqueStrings(level2Files.map((item) => item.visualBadge), '第2关三份文件角标必须唯一');
assertUniqueStrings(level2Files.map((item) => item.visualCode), '第2关三份文件编号必须唯一');
assert(getItem(level2, 'blue-contract').visualVariant === 'file-current', '第2关正确文件必须使用本期文件视觉');
const level2Session = new LevelSession();
level2Session.configure(level2);
const wrongFileUpdate = level2Session.performItemAction('red-contract');
assert(!wrongFileUpdate.accepted, '第2关错误文件不能产生有效动作');
assert(!level2Session.createResults().find((result) => result.task.id === 'contract')?.completed, '错误文件不能完成合同任务');
const correctFileUpdate = level2Session.performItemAction('blue-contract');
assert(correctFileUpdate.completedTaskIds.indexOf('contract') >= 0, '蓝色文件应完成合同任务');

const level3 = getLevel(levels, 3);
const level3Pages = ['report-page-1', 'report-page-2', 'report-page-3'].map((id) => getItem(level3, id));
assertUniqueStrings(level3Pages.map((item) => item.visualVariant), '第3关三页报告视觉类型必须唯一');
assertUniqueStrings(level3Pages.map((item) => item.visualBadge), '第3关三页报告页码必须唯一');
const boundReport = getItem(level3, 'bound-report');
assert(!boundReport.initiallyVisible, '装订报告开局必须隐藏');
assert(boundReport.unlockWhenActionIds.join(',') === 'collect-page-1,collect-page-2,collect-page-3', '装订报告必须仅由三页齐全解锁');
const level3Session = new LevelSession();
level3Session.configure(level3);
level3Session.performItemAction('report-page-1');
level3Session.performItemAction('report-page-2');
assert(!level3Session.isItemActive('bound-report'), '页面未集齐前不能生成装订报告');
const thirdPageUpdate = level3Session.performItemAction('report-page-3');
assert(thirdPageUpdate.activatedItemIds.indexOf('bound-report') >= 0, '三页齐全后应生成装订报告');
assert(!level3Session.createResults().find((result) => result.task.id === 'report')?.completed, '装订报告未提交前任务不能完成');
const reportUpdate = level3Session.performItemAction('bound-report');
assert(reportUpdate.completedTaskIds.indexOf('report') >= 0, '提交装订报告后应完成组合任务');

const level4 = getLevel(levels, 4);
const coffee = getItem(level4, 'coffee');
assert(coffee.visual === 'coffee' && !coffee.initiallyVisible, '第4关咖啡必须使用正式视觉且开局隐藏');
assert(level4.events[0]?.messageStyle === 'coworker', '第4关动态通知必须使用同事消息视觉');
const level4Session = new LevelSession();
level4Session.configure(level4);
assert(level4Session.activeTaskCount === 3, '第4关开局应只有三项活动任务');
for (const itemId of ['monitor', 'console', 'contract']) {
    level4Session.performItemAction(itemId);
}
assert(!level4Session.allCompleted, '咖啡出现前不得提前完成第4关');
assert(!level4Session.advanceTime(16.1).accepted, '咖啡不能提前出现');
const coffeeEvent = level4Session.advanceTime(16);
assert(coffeeEvent.triggeredEvents.length === 1, '第4关咖啡事件应准时触发一次');
assert(coffeeEvent.activatedTaskIds.join(',') === 'coffee', '咖啡任务应动态加入');
assert(coffeeEvent.activatedItemIds.join(',') === 'coffee', '咖啡物品应动态出现');
assert(!level4Session.advanceTime(15).accepted, '第4关咖啡事件不得重复触发');

const level5 = getLevel(levels, 5);
const level5Current = getItem(level5, 'current-contract');
const level5Old = getItem(level5, 'old-contract');
assert(level5Current.visualVariant === 'file-current', '第5关本期合同视觉映射错误');
assert(level5Old.visualVariant === 'file-archive', '第5关旧版合同视觉映射错误');
assert(level5Current.initiallyVisible && level5Old.initiallyVisible, '第5关两份合同必须同时出现');
const visitorBadge = getItem(level5, 'visitor-badge');
assert(visitorBadge.visual === 'visitor-badge' && !visitorBadge.initiallyVisible, '访客证必须使用正式视觉且开局隐藏');
assert(level5.events[0]?.messageStyle === 'boss', '第5关动态通知必须使用老板消息视觉');
const level5Session = new LevelSession();
level5Session.configure(level5);
assert(!level5Session.isItemActive('visitor-badge'), '访客证开局不能出现');
assert(!level5Session.advanceTime(18.1).accepted, '访客证不能提前出现');
const badgeEvent = level5Session.advanceTime(18);
assert(badgeEvent.triggeredEvents.length === 1, '第5关访客证事件应准时触发一次');
assert(level5Session.isTaskActive('visitor-badge'), '访客证任务应动态加入');
assert(!level5Session.advanceTime(17).accepted, '第5关访客证事件不得重复触发');
const monitor = level5.items.find((item) => item.id === 'monitor');
assert(monitor?.clickStates.length === 3, '第5关电脑必须配置为两次点击完成');
assert(monitor?.visualVariant === 'monitor-two-step', '第5关电脑必须使用两步屏幕视觉');

for (const level of levels.slice(1)) {
    for (const item of level.items) {
        assertItemDoesNotCoverTarget(level, item);
    }
}

const lifecycleSession = new LevelSession();
for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    lifecycleSession.configure(level);
    assert(!lifecycleSession.allCompleted, `${level.id} 无操作时必须进入失败路径`);
    assert(
        lifecycleSession.createResults().every((result) => !result.completed),
        `${level.id} 开局不得残留上一轮完成状态`,
    );
    completeConfiguredLevel(lifecycleSession, level);
    assert(lifecycleSession.allCompleted, `${level.id} 完成全部配置动作后必须进入成功路径`);
    assert(lifecycleSession.completedCount === level.tasks.length, `${level.id} 成功时任务统计错误`);

    lifecycleSession.reset();
    assert(!lifecycleSession.allCompleted, `${level.id} 重试后必须清空完成状态`);
    completeConfiguredLevel(lifecycleSession, level);
    assert(lifecycleSession.allCompleted, `${level.id} 重试后仍应能够完成`);

    const nextLevel = levels[index + 1];
    if (nextLevel !== undefined) {
        lifecycleSession.configure(nextLevel);
        const expectedActiveItems = nextLevel.items.filter((item) => item.initiallyVisible).map((item) => item.id);
        assert(
            lifecycleSession.snapshot.activeItemIds.join(',') === expectedActiveItems.join(','),
            `${level.id} 切换到 ${nextLevel.id} 后物品集合存在残留`,
        );
    }
}

const progressStorage = new MemoryStorage();
const progress = new ProgressService(progressStorage, 5);
assert(progress.snapshot.highestUnlockedLevel === 1, '初始只能解锁第1关');
assert(!progress.recordResult(1, false), '失败不能解锁下一关');
assert(progress.snapshot.highestUnlockedLevel === 1, '失败后解锁进度不能变化');
assert(progress.recordResult(1, true), '通过第1关应解锁第2关');
assert(progress.snapshot.highestUnlockedLevel === 2, '解锁进度应保存为第2关');
progress.markTutorialSeen();
assert(progress.snapshot.tutorialSeen, '首次教学状态应保存');

const corruptStorage = new MemoryStorage();
corruptStorage.setItem('boss-is-coming.progress', '{broken-json');
const recovered = new ProgressService(corruptStorage, 5);
assert(recovered.snapshot.highestUnlockedLevel === 1, '损坏存档应恢复为仅解锁第1关');
assert(!recovered.snapshot.tutorialSeen, '损坏存档应恢复首次教学状态');

level4Session.reset();
assert(level4Session.activeTaskCount === 3, '重试后动态任务必须恢复为未激活');
assert(!level4Session.isItemActive('coffee'), '重试后咖啡不能残留');
assert(level4Session.advanceTime(16).triggeredEvents.length === 1, '重试后咖啡事件应能且只能再次触发一次');
level4Session.configure(level3);
assert(!level4Session.isItemActive('coffee'), '切关后不能保留上一关物品');
assert(level4Session.activeTaskCount === 3, '切关后任务集合应完全替换');

console.log('PASS: five levels, generic prerequisites/events, progress recovery, switching and retries');
