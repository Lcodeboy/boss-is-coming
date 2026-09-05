import { LevelSession } from '../assets/scripts/core/LevelSession';
import { ProgressService, ProgressStorage } from '../assets/scripts/core/ProgressService';
import { parseLevel, validateLevelCatalog } from '../assets/scripts/data/LevelParser';
import { LevelConfig } from '../assets/scripts/data/LevelTypes';

declare function require(moduleName: string): unknown;

interface FileSystemReader {
    readFileSync(path: string, encoding: 'utf8'): string;
}

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

const level2 = getLevel(levels, 2);
const level2Session = new LevelSession();
level2Session.configure(level2);
const wrongFileUpdate = level2Session.performItemAction('red-contract');
assert(!wrongFileUpdate.accepted, '第2关错误文件不能产生有效动作');
assert(!level2Session.createResults().find((result) => result.task.id === 'contract')?.completed, '错误文件不能完成合同任务');
const correctFileUpdate = level2Session.performItemAction('blue-contract');
assert(correctFileUpdate.completedTaskIds.indexOf('contract') >= 0, '蓝色文件应完成合同任务');

const level3 = getLevel(levels, 3);
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
