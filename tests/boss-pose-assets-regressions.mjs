#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHARACTER_DIRECTORY = resolve(ROOT, 'assets/resources/characters');
const SOURCE_DIRECTORY = '/Users/zhuxiaofei/myapp/资源图/老板要来了';
const CHECK_BUILDS = process.argv.includes('--builds');

const ASSETS = [
    {
        pose: 'check',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-check-a-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-check.png'),
        hash: '598be8c1c981c605d08e65d1c2a447779b372feed51a7f4c46461cd7e89a11be',
    },
    {
        pose: 'magnifier',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-magnifier-no-board-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-magnifier.png'),
        hash: '09c635bc8ac486bf41975b67ae85e41c23b832694bb9cb83af830384eabbc931',
    },
    {
        pose: 'pass',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-pass-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-pass.png'),
        hash: '9cea9bb8dd042287089fe89ef12c12b4a28283de6dcf80a8c6effa6da5a6a554',
    },
    {
        pose: 'fail',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-fail-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-fail.png'),
        hash: '86f06b94ef11650739698500a14b106d2fbca2b8e73dc19bac0f086f4438faa1',
    },
];

const EXPECTED_NEUTRAL_UUIDS = new Map([
    ['boss-inspector.png.meta', '1c779f51-667b-4954-b09b-32bed445f7c6'],
    ['boss-inspector-head.png.meta', 'cf8c294b-f579-4fc1-8a64-4698ff83d9b4'],
    ['boss-inspector-body.png.meta', 'a30bf240-97a2-4cca-873a-e1b49543be58'],
]);
const EXISTING_NEUTRAL_UUIDS = new Set(EXPECTED_NEUTRAL_UUIDS.values());

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readMeta(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

execFileSync(
    process.execPath,
    [resolve(ROOT, 'tools/validate-boss-pose-assets.mjs'), '--with-destinations'],
    { stdio: 'pipe' },
);

for (const [file, expectedUuid] of EXPECTED_NEUTRAL_UUIDS) {
    const meta = readMeta(resolve(CHARACTER_DIRECTORY, file));
    assert.equal(meta.uuid, expectedUuid, `${file} UUID不得变化`);
}

const originalMeta = readMeta(resolve(CHARACTER_DIRECTORY, 'boss-inspector.png.meta'));
const originalSpriteMeta = Object.values(originalMeta.subMetas).find((entry) => entry.name === 'spriteFrame');
assert(originalSpriteMeta, '现有boss-inspector必须包含SpriteFrame子资源');

const imageUuids = new Set();
const spriteFrameUuids = new Set();
for (const asset of ASSETS) {
    const metaPath = `${asset.destination}.meta`;
    assert(existsSync(asset.source), `${asset.pose}本地源图必须存在`);
    assert(existsSync(asset.destination), `${asset.pose}正式PNG必须存在`);
    assert(existsSync(metaPath), `${asset.pose}.meta必须由Creator生成`);
    assert.equal(sha256(asset.source), asset.hash, `${asset.pose}源图SHA-256不得变化`);
    assert.equal(sha256(asset.destination), asset.hash, `${asset.pose}正式PNG必须与源图逐字节相同`);

    const meta = readMeta(metaPath);
    const spriteMeta = Object.values(meta.subMetas).find((entry) => entry.name === 'spriteFrame');
    assert(spriteMeta, `${asset.pose}必须包含SpriteFrame子资源`);
    assert.equal(meta.importer, 'image', `${asset.pose}必须使用Cocos image importer`);
    assert.equal(meta.imported, true, `${asset.pose}必须已被Creator正式导入`);
    assert.equal(meta.userData.type, 'sprite-frame', `${asset.pose}必须导入为SpriteFrame`);
    assert.equal(meta.userData.hasAlpha, true, `${asset.pose}必须保留Alpha通道`);
    assert.equal(meta.userData.fixAlphaTransparencyArtifacts, false, `${asset.pose}不得修改透明边缘像素`);
    assert.equal(spriteMeta.userData.rawWidth, 1024, `${asset.pose}原始宽度必须保留`);
    assert.equal(spriteMeta.userData.rawHeight, 1536, `${asset.pose}原始高度必须保留`);
    assert.equal(spriteMeta.userData.trimType, originalSpriteMeta.userData.trimType, `${asset.pose}导入方式必须与现有Boss一致`);
    assert.equal(spriteMeta.userData.packable, originalSpriteMeta.userData.packable, `${asset.pose}打包方式必须与现有Boss一致`);
    assert(!EXISTING_NEUTRAL_UUIDS.has(meta.uuid), `${asset.pose}不得复用neutral/head/body UUID`);
    assert(!imageUuids.has(meta.uuid), `${asset.pose}图片UUID必须唯一`);
    assert(!spriteFrameUuids.has(spriteMeta.uuid), `${asset.pose} SpriteFrame UUID必须唯一`);
    imageUuids.add(meta.uuid);
    spriteFrameUuids.add(spriteMeta.uuid);
}

const magnifierFiles = readdirSync(CHARACTER_DIRECTORY)
    .filter((name) => name.startsWith('boss-inspector-magnifier'))
    .sort();
assert.deepEqual(
    magnifierFiles,
    ['boss-inspector-magnifier.png', 'boss-inspector-magnifier.png.meta'],
    '资源目录只能包含确认过的无检查板magnifier及其meta',
);

if (CHECK_BUILDS) {
    for (const platform of ['web-mobile', 'bytedance-mini-game']) {
        const output = resolve(ROOT, 'build', platform);
        assert(existsSync(output), `${platform}构建目录必须存在`);
        const resourceConfigPath = resolve(output, 'assets/resources/config.json');
        assert(existsSync(resourceConfigPath), `${platform}必须包含resources资源索引`);
        const resourceConfig = readFileSync(resourceConfigPath, 'utf8');
        assert(
            !/magnifier[^\"]*(?:board|check)|(?:board|check)[^\"]*magnifier/i.test(resourceConfig),
            `${platform}资源索引不得注册废弃的放大镜＋检查板资源`,
        );
        for (const asset of ASSETS) {
            const meta = readMeta(`${asset.destination}.meta`);
            const builtPng = resolve(output, 'assets/resources/native', meta.uuid.slice(0, 2), `${meta.uuid}.png`);
            const builtSpriteFrame = resolve(
                output,
                'assets/resources/import',
                meta.uuid.slice(0, 2),
                `${meta.uuid}@f9941.json`,
            );
            assert(existsSync(builtPng), `${platform}必须包含${asset.pose}姿势纹理`);
            assert(existsSync(builtSpriteFrame), `${platform}必须包含${asset.pose} SpriteFrame`);
            assert.equal(sha256(builtPng), asset.hash, `${platform}中的${asset.pose}纹理不得被有损处理`);
            assert(
                resourceConfig.includes(`characters/boss-inspector-${asset.pose}/spriteFrame`),
                `${platform}必须注册${asset.pose}资源加载路径`,
            );
        }
        const builtFiles = [];
        const visit = (directory) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const path = resolve(directory, entry.name);
                if (entry.isDirectory()) visit(path); else builtFiles.push(basename(path));
            }
        };
        visit(output);
        assert(
            builtFiles.every((name) => !/magnifier.*(board|check)|(?:board|check).*magnifier/i.test(name)),
            `${platform}不得包含废弃的放大镜＋检查板图片`,
        );
    }
}

console.log(`PASS: four byte-identical boss pose PNGs, Creator metas, unique UUIDs${CHECK_BUILDS ? ', Web Mobile and Douyin packages' : ''}`);
