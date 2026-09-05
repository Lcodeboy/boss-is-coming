export const PROGRESS_STORAGE_KEY = 'boss-is-coming.progress';
export const PROGRESS_VERSION = 1;

export interface ProgressStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface ProgressData {
    readonly version: number;
    readonly highestUnlockedLevel: number;
    readonly tutorialSeen: boolean;
}

/** 带版本和损坏恢复的进度服务，不依赖浏览器 DOM。 */
export class ProgressService {
    private _data: ProgressData;

    public constructor(
        private readonly _storage: ProgressStorage,
        private readonly _levelCount: number,
    ) {
        this._data = this.load();
    }

    public get snapshot(): ProgressData {
        return { ...this._data };
    }

    public isUnlocked(levelOrder: number): boolean {
        return Number.isInteger(levelOrder)
            && levelOrder >= 1
            && levelOrder <= this._data.highestUnlockedLevel;
    }

    public recordResult(levelOrder: number, success: boolean): boolean {
        if (!success || !this.isUnlocked(levelOrder) || levelOrder >= this._levelCount) {
            return false;
        }
        const nextUnlocked = Math.min(this._levelCount, levelOrder + 1);
        if (nextUnlocked <= this._data.highestUnlockedLevel) {
            return false;
        }
        this._data = { ...this._data, highestUnlockedLevel: nextUnlocked };
        this.persist();
        return true;
    }

    public markTutorialSeen(): boolean {
        if (this._data.tutorialSeen) {
            return false;
        }
        this._data = { ...this._data, tutorialSeen: true };
        this.persist();
        return true;
    }

    private load(): ProgressData {
        try {
            const raw = this._storage.getItem(PROGRESS_STORAGE_KEY);
            if (raw === null) {
                return this.createDefault();
            }
            const parsed = JSON.parse(raw) as unknown;
            if (!this.isValid(parsed)) {
                return this.recoverDefault();
            }
            return parsed;
        } catch {
            return this.recoverDefault();
        }
    }

    private isValid(value: unknown): value is ProgressData {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
        }
        const source = value as Record<string, unknown>;
        return source.version === PROGRESS_VERSION
            && Number.isInteger(source.highestUnlockedLevel)
            && typeof source.highestUnlockedLevel === 'number'
            && source.highestUnlockedLevel >= 1
            && source.highestUnlockedLevel <= this._levelCount
            && typeof source.tutorialSeen === 'boolean';
    }

    private recoverDefault(): ProgressData {
        const fallback = this.createDefault();
        this.persistValue(fallback);
        return fallback;
    }

    private createDefault(): ProgressData {
        return {
            version: PROGRESS_VERSION,
            highestUnlockedLevel: 1,
            tutorialSeen: false,
        };
    }

    private persist(): void {
        this.persistValue(this._data);
    }

    private persistValue(value: ProgressData): void {
        try {
            this._storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(value));
        } catch {
            // 存储不可用时仍保留本轮内存进度，不影响关卡运行。
        }
    }
}
