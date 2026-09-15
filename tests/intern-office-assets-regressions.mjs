#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = '/Users/zhuxiaofei/myapp/资源图/老板要来了/intern-office-assets-v1/assets';
const DESTINATION_ROOT = resolve(ROOT, 'assets/resources/office/intern-office-v1');
const CHECK_BUILDS = process.argv.includes('--builds');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ASSETS = [
    ['intern-blue-contract.png', 606, 368, true, 'a2fdacdbc0f22d2b1fcbabfe5ab5313b33eb38db840115c419d0fa3da4077931'],
    ['intern-game-console.png', 696, 301, true, 'b2dce3692d6b3e41f9e61b312920f02879b6340e3619ea80f9511c3e8f54b890'],
    ['intern-inspection-tray.png', 567, 406, true, '003a96ecafe1825da2c241e4285f49428ede737b4a916fc30197f183fdf4f652'],
    ['intern-monitor-note.png', 252, 254, true, '22b9baefcfcdd52e34708b7d3fb8746ece6e408e4a304f38ffdab6815f9145ce'],
    ['intern-monitor-play.png', 768, 512, true, '82309eae760db15b84ac3a34f89093863ae97cb7326efdd3ef6a8df8e8f1f4e3'],
    ['intern-monitor-work.png', 768, 512, true, '3ea95993b908a5b9deb333eb2eb4d594471e9f880df0b02b463f639f65ce4dff'],
    ['intern-office-background.png', 860, 1828, false, 'c36c996bb62b2c1cb7d55d962d559702816283c5ebd93fd39a1de8ceb6b708e5'],
    ['intern-personal-drawer.png', 510, 483, true, '05912180e6c0971181c5f8239e226f4414b3a81aae324764806f057ecbcc25bb'],
    ['intern-plant.png', 460, 496, true, '7fef0610349730dad4b60c60634bc38c59ab91d72834b20dcd615163dfb35bbc'],
    ['intern-snack-bag.png', 536, 417, true, 'e9d2c88cd69e1450e77c354418c2c2f40c89bf2d9f90cea8f6d5d6f7effde35e'],
    ['intern-wastebasket.png', 400, 450, true, 'e4ee103f374fd846ff1d572b270790639a996c30fdfa6c9f75e06abb45810151'],
].map(([file, width, height, hasAlpha, hash]) => ({ file, width, height, hasAlpha, hash }));

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readMeta(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function decodePng(path) {
    const png = readFileSync(path);
    assert(png.subarray(0, 8).equals(PNG_SIGNATURE), `${path}必须是PNG`);
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = -1;
    const idat = [];
    while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('ascii', offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length);
        offset += length + 12;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            assert.equal(data[8], 8, `${path}必须是8-bit PNG`);
            colorType = data[9];
            assert(colorType === 2 || colorType === 6, `${path}必须是RGB或RGBA PNG`);
            assert.equal(data[12], 0, `${path}不得使用交错PNG`);
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const stride = width * bytesPerPixel;
    const packed = inflateSync(Buffer.concat(idat));
    const pixels = Buffer.alloc(stride * height);
    let sourceOffset = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = packed[sourceOffset++];
        for (let x = 0; x < stride; x += 1) {
            const raw = packed[sourceOffset++];
            const pixelOffset = y * stride + x;
            const left = x >= bytesPerPixel ? pixels[pixelOffset - bytesPerPixel] : 0;
            const up = y > 0 ? pixels[pixelOffset - stride] : 0;
            const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[pixelOffset - stride - bytesPerPixel] : 0;
            let value = raw;
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += Math.floor((left + up) / 2);
            else if (filter === 4) {
                const prediction = left + up - upperLeft;
                const leftDistance = Math.abs(prediction - left);
                const upDistance = Math.abs(prediction - up);
                const upperLeftDistance = Math.abs(prediction - upperLeft);
                value += leftDistance <= upDistance && leftDistance <= upperLeftDistance
                    ? left
                    : upDistance <= upperLeftDistance ? up : upperLeft;
            } else assert.equal(filter, 0, `${path}使用了未知PNG过滤器${filter}`);
            pixels[pixelOffset] = value & 255;
        }
    }
    return { width, height, colorType, bytesPerPixel, pixels };
}

function alphaAt(image, x, y) {
    return image.colorType === 6
        ? image.pixels[(y * image.width + x) * image.bytesPerPixel + 3]
        : 255;
}

function loadPureTypeScript(file, dependencies = {}) {
    const context = { exports: {}, require: name => {
        assert(name in dependencies, `Unexpected pure layout dependency: ${name}`);
        return dependencies[name];
    } };
    vm.runInNewContext(ts.transpileModule(readFileSync(resolve(ROOT, file), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.exports;
}
const metrics = loadPureTypeScript('assets/scripts/ui/VisualMetrics.ts');
const layoutModule = loadPureTypeScript('assets/scripts/ui/OfficeTheme.ts', { './VisualMetrics': metrics });
const actualTheme = layoutModule.INTERN_OFFICE_V1;
for (const [key, spec] of Object.entries(actualTheme.assets)) {
    if (spec.visibleAlphaTop === undefined) continue;
    const image = decodePng(resolve(ROOT, 'assets/resources', spec.resourcePath.replace('/spriteFrame', '.png')));
    let left = image.width, right = 0, top = image.height, bottom = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (alphaAt(image, x, y) > 0) {
        left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
    assert.deepEqual([spec.visibleAlphaLeft, spec.visibleAlphaRight, spec.visibleAlphaTop, spec.visibleAlphaBottom], [left, right, top, bottom], `${key}: geometry must match actual Alpha, including shadow`);
    if (spec.supportLeft !== undefined) {
        let footLeft = image.width, footRight = 0;
        for (let y = bottom - 8; y < bottom; y++) for (let x = left; x < right; x++) if (alphaAt(image, x, y) > 0) {
            footLeft = Math.min(footLeft, x); footRight = Math.max(footRight, x + 1);
        }
        assert.deepEqual([spec.supportLeft, spec.supportRight], [footLeft, footRight], `${key}: rear footprint must match PNG`);
    }
}
const woodImage = decodePng(resolve(DESTINATION_ROOT, 'intern-office-background.png'));
const woodConfig = actualTheme.levelLayouts['level-001'].tabletop;
for (let x = 0; x < woodImage.width; x++) {
    const back = Math.ceil(layoutModule.officeSurfaceBackPixel(woodConfig, x));
    for (let y = back; y < woodConfig.frontPixel; y++) {
        const p = (y * woodImage.width + x) * woodImage.bytesPerPixel;
        const [r, g, b] = woodImage.pixels.subarray(p, p + 3);
        assert(r > 150 && g > 90 && b < 160 && r > g * 1.18, `wood profile is outside actual wooden pixels at ${x},${y}`);
    }
}

const imageUuids = new Set();
const spriteFrameUuids = new Set();
for (const asset of ASSETS) {
    const source = resolve(SOURCE_ROOT, asset.file);
    const destination = resolve(DESTINATION_ROOT, asset.file);
    const metaPath = `${destination}.meta`;
    assert(existsSync(source), `缺少源资源${asset.file}`);
    assert(existsSync(destination), `缺少正式资源${asset.file}`);
    assert(existsSync(metaPath), `缺少Creator生成的${asset.file}.meta`);
    assert.equal(sha256(source), asset.hash, `${asset.file}源文件哈希错误`);
    assert.equal(sha256(destination), asset.hash, `${asset.file}复制后必须保持逐字节一致`);

    const image = decodePng(destination);
    assert.equal(image.width, asset.width, `${asset.file}宽度错误`);
    assert.equal(image.height, asset.height, `${asset.file}高度错误`);
    assert.equal(image.colorType, asset.hasAlpha ? 6 : 2, `${asset.file}颜色通道错误`);
    if (asset.hasAlpha) {
        for (const [x, y] of [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]]) {
            assert.equal(alphaAt(image, x, y), 0, `${asset.file}四角必须透明`);
        }
        let transparentPixels = 0;
        for (let y = 0; y < image.height; y += 1) {
            for (let x = 0; x < image.width; x += 1) {
                if (alphaAt(image, x, y) === 0) transparentPixels += 1;
            }
        }
        assert(transparentPixels > image.width * image.height * 0.1, `${asset.file}必须包含真实透明区域`);
    }

    const meta = readMeta(metaPath);
    const spriteMeta = Object.values(meta.subMetas).find(entry => entry.name === 'spriteFrame');
    assert(spriteMeta, `${asset.file}必须包含SpriteFrame子资源`);
    assert.equal(meta.importer, 'image', `${asset.file}必须由Creator image importer导入`);
    assert.equal(meta.imported, true, `${asset.file}必须完成Creator正式导入`);
    assert.equal(meta.userData.type, 'sprite-frame', `${asset.file}必须导入为SpriteFrame`);
    assert.equal(meta.userData.hasAlpha, asset.hasAlpha, `${asset.file} Alpha导入配置错误`);
    assert.equal(meta.userData.fixAlphaTransparencyArtifacts, false, `${asset.file}不得改写透明边缘像素`);
    assert.equal(spriteMeta.userData.rawWidth, asset.width, `${asset.file}必须保留原始宽度`);
    assert.equal(spriteMeta.userData.rawHeight, asset.height, `${asset.file}必须保留原始高度`);
    assert(!imageUuids.has(meta.uuid), `${asset.file}图片UUID必须唯一`);
    assert(!spriteFrameUuids.has(spriteMeta.uuid), `${asset.file} SpriteFrame UUID必须唯一`);
    imageUuids.add(meta.uuid);
    spriteFrameUuids.add(spriteMeta.uuid);
}

const playMeta = readMeta(resolve(DESTINATION_ROOT, 'intern-monitor-play.png.meta'));
const workMeta = readMeta(resolve(DESTINATION_ROOT, 'intern-monitor-work.png.meta'));
const playSpriteMeta = Object.values(playMeta.subMetas).find(entry => entry.name === 'spriteFrame');
const workSpriteMeta = Object.values(workMeta.subMetas).find(entry => entry.name === 'spriteFrame');
assert.equal(playSpriteMeta.userData.rawWidth, workSpriteMeta.userData.rawWidth, '电脑两态原始画布宽度必须相同');
assert.equal(playSpriteMeta.userData.rawHeight, workSpriteMeta.userData.rawHeight, '电脑两态原始画布高度必须相同');
assert.equal(playSpriteMeta.userData.pivotX, workSpriteMeta.userData.pivotX, '电脑两态锚点X必须相同');
assert.equal(playSpriteMeta.userData.pivotY, workSpriteMeta.userData.pivotY, '电脑两态锚点Y必须相同');

const assetKeys = [
    'background', 'monitorPlay', 'monitorWork', 'monitorNote', 'plant', 'gameConsole',
    'snackBag', 'blueContract', 'inspectionTray', 'personalDrawer', 'wastebasket',
];
const fakeTheme = {
    id: 'intern-office-v1',
    assets: Object.fromEntries(assetKeys.map(key => [key, { resourcePath: `office/${key}/spriteFrame` }])),
};
const pendingLoads = [];
const warnings = [];
class SpriteFrame {}
const loaderSource = readFileSync(resolve(ROOT, 'assets/scripts/ui/OfficeThemeAssets.ts'), 'utf8');
const workItemVisualSource = readFileSync(resolve(ROOT, 'assets/scripts/ui/WorkItemVisual.ts'), 'utf8');
const dropZoneVisualSource = readFileSync(resolve(ROOT, 'assets/scripts/ui/DropZoneVisual.ts'), 'utf8');
const gameViewSource = readFileSync(resolve(ROOT, 'assets/scripts/ui/GameView.ts'), 'utf8');
assert.match(workItemVisualSource, /MONITOR_NOTE_FONT_SIZE = 18/, '摸鱼中运行时Label字号必须清晰可见');
assert.match(workItemVisualSource, /MONITOR_NOTE_TEXT_COLOR = new Color\(35, 43, 48, 255\)/, '摸鱼中文字必须使用高对比深色');
assert.match(dropZoneVisualSource, /BOTTOM_ZONE_LABEL_FONT_SIZE = 22/, '底部目标标签必须提高字号');
assert.match(dropZoneVisualSource, /BOTTOM_ZONE_LABEL_COLOR = new Color\(226, 235, 238, 255\)/, '底部目标标签必须提高亮度');
assert.match(
    dropZoneVisualSource,
    /paintHighlight\(graphics, config\.size\.width, config\.size\.height, 16\);[\s\S]*?if \(this\._highlighted \|\| this\._completed\)[\s\S]*?paintStateStroke\(/,
    '办公室主题目标区未高亮或完成时不应显示默认半透明边框',
);
assert.match(gameViewSource, /fontSize: formal \? 21 : 19/, '快速收纳区标题必须提高字号');
const loaderCompiled = ts.transpileModule(loaderSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const loaderContext = {
    exports: {},
    require(name) {
        if (name === 'cc') {
            return {
                SpriteFrame,
                warn: message => warnings.push(message),
                resources: { load(path, Type, done) { pendingLoads.push({ path, Type, done }); } },
            };
        }
        if (name === './OfficeTheme') return { getOfficeTheme: () => fakeTheme };
        throw new Error(`未声明的OfficeThemeAssets依赖：${name}`);
    },
};
vm.runInNewContext(loaderCompiled, loaderContext);
const { requestOfficeThemeAssets } = loaderContext.exports;
const delivered = [];
requestOfficeThemeAssets('intern-office-v1', assets => delivered.push(assets));
const cancelSecond = requestOfficeThemeAssets('intern-office-v1', assets => delivered.push(assets));
cancelSecond();
assert.equal(pendingLoads.length, 11, '同一会话并发请求只能加载11张主题资源一次');
for (const pending of pendingLoads) {
    assert.equal(pending.Type, SpriteFrame, '主题资源必须按SpriteFrame加载');
    pending.done(undefined, Object.assign(new SpriteFrame(), { path: pending.path }));
}
assert.equal(delivered.length, 1, '已取消的主题监听器不得接收异步结果');
requestOfficeThemeAssets('intern-office-v1', assets => delivered.push(assets));
assert.equal(pendingLoads.length, 11, '主题加载完成后重试和切关不得重复解码纹理');
assert.equal(delivered.length, 2, '缓存完成后必须同步复用主题资源');
assert.equal(warnings.length, 0, '正常主题加载不得产生警告');

const failedLoads = [];
const failedWarnings = [];
const failedLoaderContext = {
    exports: {},
    require(name) {
        if (name === 'cc') {
            return {
                SpriteFrame,
                warn: message => failedWarnings.push(message),
                resources: { load(path, Type, done) { failedLoads.push({ path, Type, done }); } },
            };
        }
        if (name === './OfficeTheme') return { getOfficeTheme: () => fakeTheme };
        throw new Error(`未声明的失败回退依赖：${name}`);
    },
};
vm.runInNewContext(loaderCompiled, failedLoaderContext);
let failedResult = undefined;
failedLoaderContext.exports.requestOfficeThemeAssets('intern-office-v1', assets => { failedResult = assets; });
for (let index = 0; index < failedLoads.length; index += 1) {
    const pending = failedLoads[index];
    pending.done(index === 3 ? new Error('missing') : undefined, index === 3 ? undefined : new SpriteFrame());
}
assert.equal(failedResult, null, '任一主题资源失败时必须整体回退现有矢量视觉');
assert.equal(failedWarnings.length, 1, '主题加载失败只允许记录一次明确警告');
failedLoaderContext.exports.requestOfficeThemeAssets('intern-office-v1', assets => { failedResult = assets; });
assert.equal(failedLoads.length, 11, '失败状态重试不得持续重复请求或刷屏');
assert.equal(failedWarnings.length, 1, '失败状态重试不得重复警告');

const workItemSource = readFileSync(resolve(ROOT, 'assets/scripts/game/WorkItem.ts'), 'utf8');
const visualFactorySource = readFileSync(resolve(ROOT, 'assets/scripts/ui/VisualFactory.ts'), 'utf8');
assert.match(workItemSource, /interaction === 'static'[\s\S]*?removeListeners\(\)/, '静态绿植不得保留触摸监听');
assert.match(workItemSource, /setOfficeThemeAssets[\s\S]*?setSiblingIndex\(0\)/, '绿植必须放在所有交互节点后方');
assert.match(
    workItemSource,
    /setPosition\(initialPosition\.x, initialPosition\.y\);[\s\S]*?_homePosition\.set\(this\.node\.position\)/,
    'WorkItem必须先采用主题父节点位置再锁定错误归位坐标',
);
assert.match(workItemSource, /resetItem\(\)[\s\S]*?setPosition\(this\._homePosition\)/, '重试必须回到新的主题桌面位置');
assert.match(workItemSource, /returnHome\(\)[\s\S]*?position: this\._homePosition/, '错误释放必须回到新的主题桌面位置');
assert.match(workItemSource, /onDisable\(\)[\s\S]*?Tween\.stopAllByTarget\(this\.node\)/, '物品禁用时不得残留归位Tween');
assert.match(workItemSource, /onDestroy\(\)[\s\S]*?Tween\.stopAllByTarget\(this\.node\)/, '物品销毁时不得残留拖拽Tween');
assert.doesNotMatch(visualFactorySource.match(/function createPassiveSprite[\s\S]*?\n}/)?.[0] ?? '', /TOUCH_|BlockInputEvents/, '主题Sprite不得注册或阻挡触摸');
assert.match(gameViewSource, /DEFAULT_OFFICE_THEME_ID/, 'GameView必须通过集中配置选择办公室主题');
assert.match(gameViewSource, /setSpriteFrame\([\s\S]*?backgroundAsset/, '正式办公室背景必须注入FullBleedBackground的Cover入口');
assert.match(
    gameViewSource,
    /readonly _officeThemeId: OfficeThemeId = DEFAULT_OFFICE_THEME_ID/,
    '当前五关必须共享默认intern-office-v1主题入口',
);
assert.match(
    gameViewSource,
    /solveOfficeDeskLayout\(layout\.tabletop, geometry\)[\s\S]*?applyInitialLayout\(resolved\.positions\[id\]\)/,
    '主题桌面位置必须作用于WorkItem父逻辑节点而非视觉Sprite',
);
assert.match(workItemSource, /applyInitialLayout\([\s\S]*?_homePosition\.set\(position\.x, position\.y, 0\)[\s\S]*?node\.setPosition\(this\._homePosition\)/,
    '求解位置必须同步父节点及home，不能另设Sprite偏移');
assert.match(workItemSource, /_temporaryDragOrder && this\._dragSiblingIndex === null && \(this\._touchDelta\.x !== 0 \|\| this\._touchDelta\.y !== 0\)/,
    '第1关只允许实际拖动后临时置顶，电脑点击不得置顶');
assert.match(gameViewSource, /onDisable\(\)[\s\S]*?_cancelOfficeThemeLoad\?\.\(\)/, 'GameView禁用时必须取消主题异步监听');
assert.match(gameViewSource, /onDestroy\(\)[\s\S]*?_officeThemeLoadGeneration \+= 1/, 'GameView销毁时必须使旧主题回调失效');

if (CHECK_BUILDS) {
    for (const platform of ['web-mobile', 'bytedance-mini-game']) {
        const output = resolve(ROOT, 'build', platform);
        const resourceConfigPath = resolve(output, 'assets/resources/config.json');
        assert(existsSync(resourceConfigPath), `${platform}缺少resources资源索引`);
        const resourceConfig = readFileSync(resourceConfigPath, 'utf8');
        for (const asset of ASSETS) {
            const destination = resolve(DESTINATION_ROOT, asset.file);
            const meta = readMeta(`${destination}.meta`);
            const builtPng = resolve(output, 'assets/resources/native', meta.uuid.slice(0, 2), `${meta.uuid}.png`);
            assert(existsSync(builtPng), `${platform}缺少${asset.file}`);
            assert.equal(sha256(builtPng), asset.hash, `${platform}/${asset.file}必须保持源PNG哈希`);
            assert(
                resourceConfig.includes(`office/intern-office-v1/${basename(asset.file, '.png')}/spriteFrame`),
                `${platform}资源索引必须注册${asset.file}`,
            );
        }
    }
}

console.log(`PASS: intern-office-v1 11 assets, stable Creator import, one-session cache and passive visual bindings${CHECK_BUILDS ? ', Web Mobile and Douyin packages' : ''}`);
