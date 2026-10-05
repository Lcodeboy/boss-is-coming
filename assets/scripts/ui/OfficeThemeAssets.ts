import { JsonAsset, resources, SpriteFrame, warn } from 'cc';
import { OFFICE_LAYOUT_RESOURCE, OfficeLayoutCatalog, parseOfficeLayoutCatalog } from './OfficeLayoutCatalog';
import {
    getOfficeTheme,
    OfficeThemeAssetKey,
    OfficeThemeConfig,
    OfficeThemeId,
} from './OfficeTheme';

export interface LoadedOfficeThemeAssets {
    readonly layoutCatalog: OfficeLayoutCatalog;
    readonly theme: OfficeThemeConfig;
    readonly frames: Readonly<Record<OfficeThemeAssetKey, SpriteFrame>>;
}

type OfficeThemeLoadListener = (assets: LoadedOfficeThemeAssets | null) => void;
type OfficeThemeLoadState = 'idle' | 'loading' | 'ready' | 'failed';

interface OfficeThemeLoadRuntime {
    state: OfficeThemeLoadState;
    assets: LoadedOfficeThemeAssets | null;
    readonly listeners: Set<OfficeThemeLoadListener>;
    warningShown: boolean;
}

const LOAD_RUNTIMES: Partial<Record<OfficeThemeId, OfficeThemeLoadRuntime>> = {};

function getLoadRuntime(themeId: OfficeThemeId): OfficeThemeLoadRuntime {
    const existing = LOAD_RUNTIMES[themeId];
    if (existing !== undefined) {
        return existing;
    }
    const created: OfficeThemeLoadRuntime = {
        state: 'idle',
        assets: null,
        listeners: new Set<OfficeThemeLoadListener>(),
        warningShown: false,
    };
    LOAD_RUNTIMES[themeId] = created;
    return created;
}

/** 每个主题在同一游戏会话内只加载一次；监听者取消后不会收到旧异步结果。 */
export function requestOfficeThemeAssets(
    themeId: OfficeThemeId,
    listener: OfficeThemeLoadListener,
): () => void {
    const runtime = getLoadRuntime(themeId);
    if (runtime.state === 'ready') {
        listener(runtime.assets);
        return () => undefined;
    }
    if (runtime.state === 'failed') {
        listener(null);
        return () => undefined;
    }

    runtime.listeners.add(listener);
    if (runtime.state === 'idle') {
        runtime.state = 'loading';
        const theme = getOfficeTheme(themeId);
        const assetKeys = Object.keys(theme.assets) as OfficeThemeAssetKey[];
        const frames: Partial<Record<OfficeThemeAssetKey, SpriteFrame>> = {};
        let remaining = assetKeys.length + 1;
        let failed = false;
        let layoutCatalog: OfficeLayoutCatalog | null = null;

        const finish = (): void => {
            remaining -= 1;
            if (remaining !== 0) { return; }
            if (failed || layoutCatalog === null) {
                runtime.state = 'failed';
                runtime.assets = null;
                if (!runtime.warningShown) {
                    runtime.warningShown = true;
                    warn(`办公室主题 ${themeId} 资源或布局表加载失败，继续使用现有矢量视觉`);
                }
            } else {
                runtime.state = 'ready';
                runtime.assets = {
                    theme: { ...theme, levelLayouts: layoutCatalog.levels },
                    frames: frames as Record<OfficeThemeAssetKey, SpriteFrame>,
                    layoutCatalog,
                };
            }
            const listeners = Array.from(runtime.listeners);
            runtime.listeners.clear();
            for (const waitingListener of listeners) { waitingListener(runtime.assets); }
        };

        resources.load(OFFICE_LAYOUT_RESOURCE, JsonAsset, (error, asset) => {
            try {
                if (error || !asset) { throw error ?? new Error('Missing office layout table'); }
                layoutCatalog = parseOfficeLayoutCatalog(asset.json as unknown);
            } catch (error: unknown) {
                failed = true;
                warn(`办公室布局表无效：${String(error)}`);
            }
            finish();
        });

        for (const assetKey of assetKeys) {
            resources.load(theme.assets[assetKey].resourcePath, SpriteFrame, (error, frame) => {
                if (error !== null && error !== undefined || frame === null || frame === undefined) {
                    failed = true;
                } else {
                    frames[assetKey] = frame;
                }
                finish();
            });
        }
    }

    return () => {
        runtime.listeners.delete(listener);
    };
}
