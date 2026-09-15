import { resources, SpriteFrame, warn } from 'cc';
import {
    getOfficeTheme,
    OfficeThemeAssetKey,
    OfficeThemeConfig,
    OfficeThemeId,
} from './OfficeTheme';

export interface LoadedOfficeThemeAssets {
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

const OFFICE_THEME_ASSET_KEYS: readonly OfficeThemeAssetKey[] = [
    'background',
    'monitorPlay',
    'monitorWork',
    'monitorNote',
    'plant',
    'gameConsole',
    'snackBag',
    'blueContract',
    'inspectionTray',
    'personalDrawer',
    'wastebasket',
];

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
        const frames: Partial<Record<OfficeThemeAssetKey, SpriteFrame>> = {};
        let remaining = OFFICE_THEME_ASSET_KEYS.length;
        let failed = false;

        for (const assetKey of OFFICE_THEME_ASSET_KEYS) {
            resources.load(theme.assets[assetKey].resourcePath, SpriteFrame, (error, frame) => {
                if (error !== null && error !== undefined || frame === null || frame === undefined) {
                    failed = true;
                } else {
                    frames[assetKey] = frame;
                }
                remaining -= 1;
                if (remaining !== 0) {
                    return;
                }

                if (failed) {
                    runtime.state = 'failed';
                    runtime.assets = null;
                    if (!runtime.warningShown) {
                        runtime.warningShown = true;
                        warn(`办公室主题 ${themeId} 资源加载失败，继续使用现有矢量视觉`);
                    }
                } else {
                    runtime.state = 'ready';
                    runtime.assets = {
                        theme,
                        frames: frames as Record<OfficeThemeAssetKey, SpriteFrame>,
                    };
                }

                const result = runtime.assets;
                for (const waitingListener of runtime.listeners) {
                    waitingListener(result);
                }
                runtime.listeners.clear();
            });
        }
    }

    return () => {
        runtime.listeners.delete(listener);
    };
}
