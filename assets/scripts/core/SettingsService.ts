import { ProgressStorage } from './ProgressService';

export const SETTINGS_STORAGE_KEY = 'boss-is-coming.settings';
export interface SettingsData {
    readonly version: 1;
    readonly soundEnabled: boolean;
    readonly vibrationEnabled: boolean;
}

/** 设置存储与关卡进度完全独立；存储不可用时继续使用内存设置。 */
export class SettingsService {
    private _data: SettingsData = { version: 1, soundEnabled: true, vibrationEnabled: true };
    private readonly _listeners = new Set<(settings: SettingsData) => void>();

    public constructor(private readonly _storage: ProgressStorage) {
        try {
            const raw = _storage.getItem(SETTINGS_STORAGE_KEY);
            if (raw === null) { return; }
            const value: unknown = JSON.parse(raw);
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const data = value as Record<string, unknown>;
                if (data.version === 1 && typeof data.soundEnabled === 'boolean' && typeof data.vibrationEnabled === 'boolean') {
                    this._data = { version: 1, soundEnabled: data.soundEnabled, vibrationEnabled: data.vibrationEnabled };
                    return;
                }
            }
        } catch {
            // 损坏或被系统禁止访问时写回默认值（写入失败也不阻塞游戏）。
        }
        this.persist();
    }

    public get snapshot(): SettingsData { return { ...this._data }; }

    public subscribe(listener: (settings: SettingsData) => void): () => void {
        this._listeners.add(listener);
        listener(this.snapshot);
        return () => { this._listeners.delete(listener); };
    }

    public setSoundEnabled(enabled: boolean): void { this.update({ ...this._data, soundEnabled: enabled }); }
    public setVibrationEnabled(enabled: boolean): void { this.update({ ...this._data, vibrationEnabled: enabled }); }

    private update(data: SettingsData): void {
        this._data = data;
        this.persist();
        this._listeners.forEach((listener) => listener(this.snapshot));
    }

    private persist(): void {
        try { this._storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this._data)); }
        catch { /* 无持久存储权限时保留内存值。 */ }
    }
}
