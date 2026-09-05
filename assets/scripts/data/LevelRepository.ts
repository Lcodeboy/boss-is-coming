import { JsonAsset, resources } from 'cc';
import { parseLevel, validateLevelCatalog } from './LevelParser';
import { LevelConfig } from './LevelTypes';

export const LEVEL_IDS = ['level-001', 'level-002', 'level-003', 'level-004', 'level-005'] as const;

/** 统一加载并校验关卡数据，避免流程层依赖具体关卡内容。 */
export class LevelRepository {
    public static async loadAll(): Promise<readonly LevelConfig[]> {
        const levels = await Promise.all(LEVEL_IDS.map((levelId) => this.load(levelId)));
        return validateLevelCatalog(levels);
    }

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
