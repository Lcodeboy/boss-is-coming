/*
 * Actual Web Mobile regression (not a coordinate-equality/screenshot mock).
 * Serve the repository, then run with an installed playwright-core module:
 * PLAYWRIGHT_MODULE=/path/to/playwright-core node tests/intern-office-layout-runtime.cjs
 * Optional: OFFICE_TEST_URL, OFFICE_TEST_OUTPUT, CHROME_EXECUTABLE.
 * Writes initial 0/4 screenshots, world-space geometry, feasibility and input results.
 * Reports every failure and exits nonzero even when the input tests pass.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inflateSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
// Exploratory browser-only hypothesis. Never changes production configuration.
// Keep its artifacts separate from actual production acceptance screenshots.
const CANDIDATE = process.argv.includes('--candidate');
const GEOMETRY_ONLY = process.argv.includes('--geometry-only');
const OUTPUT = process.env.OFFICE_TEST_OUTPUT || path.join(ROOT, CANDIDATE ? 'temp/office-layout-candidate' : 'temp/office-layout-validation');
const URL = process.env.OFFICE_TEST_URL || 'http://127.0.0.1:8765/build/web-mobile/';
const SIZES = [[750, 1334], [360, 640], [360, 780], [360, 800], [393, 852], [393, 873]];
const FRONT = ['console', 'snack', 'contract'];
const ASSET_NAMES = { console: 'game-console', snack: 'snack-bag', contract: 'blue-contract', monitor: 'monitor-play', plant: 'plant', review: 'inspection-tray', note: 'monitor-note' };
const failures = [];
const reports = [];
const inputResults = [];
if (require.main === module) fs.mkdirSync(OUTPUT, { recursive: true });

function readPng(filename) {
    const file = fs.readFileSync(filename);
    assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    let width, height, channels, offset = 8;
    const chunks = [];
    while (offset < file.length) {
        const length = file.readUInt32BE(offset), type = file.toString('ascii', offset + 4, offset + 8);
        const data = file.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            assert.equal(data[8], 8); assert([2, 6].includes(data[9])); assert.equal(data[12], 0);
            channels = data[9] === 6 ? 4 : 3;
        }
        if (type === 'IDAT') chunks.push(data);
        offset += length + 12;
    }
    const packed = inflateSync(Buffer.concat(chunks)), stride = width * channels;
    const pixels = Buffer.alloc(stride * height);
    let source = 0;
    for (let y = 0; y < height; y++) {
        const filter = packed[source++]; assert(filter >= 0 && filter <= 4);
        for (let x = 0; x < stride; x++) {
            const i = y * stride + x, left = x >= channels ? pixels[i - channels] : 0;
            const up = y ? pixels[i - stride] : 0, upperLeft = y && x >= channels ? pixels[i - stride - channels] : 0;
            let prediction = 0;
            if (filter === 1) prediction = left;
            if (filter === 2) prediction = up;
            if (filter === 3) prediction = Math.floor((left + up) / 2);
            if (filter === 4) {
                const p = left + up - upperLeft, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
                prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft;
            }
            pixels[i] = (packed[source++] + prediction) & 255;
        }
    }
    return { width, height, channels, pixels, sha256: createHash('sha256').update(file).digest('hex') };
}
function alphaBounds(image) {
    let left = image.width, right = 0, top = image.height, bottom = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (image.channels === 3 || image.pixels[(y * image.width + x) * 4 + 3] > 0) {
            left = Math.min(left, x); right = Math.max(right, x + 1);
            top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        }
    }
    return { left, right, top, bottom, width: image.width, height: image.height };
}
const assetRoot = path.join(ROOT, 'assets/resources/office/intern-office-v1');
const images = Object.fromEntries(Object.entries(ASSET_NAMES).map(([key, name]) => [key, readPng(path.join(assetRoot, `intern-${name}.png`))]));
const bounds = Object.fromEntries(Object.entries(images).map(([key, image]) => [key, alphaBounds(image)]));
const background = readPng(path.join(assetRoot, 'intern-office-background.png'));
// Identify the continuous warm wood surface in the real PNG, not its dark fascia.
// Each column is independently scanned; sloping side/back edges remain part of the test.
const wood = Array.from({ length: background.width }, (_, x) => {
    let first = background.height, last = -1, start = -1;
    for (let y = 0; y < background.height; y++) {
        const p = (y * background.width + x) * background.channels;
        const [r, g, b] = background.pixels.subarray(p, p + 3);
        if (r > 150 && g > 90 && b < 160 && r > g * 1.18) {
            if (start < 0) start = y;
            if (y - start > last - first) { first = start; last = y; }
        } else { start = -1; }
    }
    assert(last - first > 100, `background column ${x}: cannot identify continuous wood`);
    return { back: first, front: last + 1 };
});
function point(n, x, y) {
    const m = n.matrix;
    return { x: m.m00 * x + m.m04 * y + m.m12, y: m.m01 * x + m.m05 * y + m.m13 };
}
function imagePoint(n, a, x, y) { return point(n, (x / a.width - n.anchor.x) * n.size.width, (1 - y / a.height - n.anchor.y) * n.size.height); }
function rect(n, a) {
    const points = [[a.left, a.top], [a.right, a.top], [a.left, a.bottom], [a.right, a.bottom]].map(([x, y]) => imagePoint(n, a, x, y));
    return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y)) };
}
function union(a, b) { return { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), bottom: Math.min(a.bottom, b.bottom), top: Math.max(a.top, b.top) }; }
function overlap(a, b) { return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom; }
function inverseImagePoint(n, a, p) {
    const m = n.matrix, dx = p.x - m.m12, dy = p.y - m.m13, det = m.m00 * m.m05 - m.m04 * m.m01;
    return { x: ((dx * m.m05 - dy * m.m04) / det / n.size.width + n.anchor.x) * a.width,
        y: (1 - n.anchor.y - (dy * m.m00 - dx * m.m01) / det / n.size.height) * a.height };
}
function woodUnder(data, visual) {
    const bg = data.nodes.find(n => n.name === 'FullBleedArtwork');
    const topLeft = inverseImagePoint(bg, background, { x: visual.left, y: visual.top });
    const bottomRight = inverseImagePoint(bg, background, { x: visual.right, y: visual.bottom });
    const columns = wood.slice(Math.max(0, Math.floor(topLeft.x)), Math.min(background.width, Math.ceil(bottomRight.x)));
    assert(columns.length > 0, 'visible footprint is outside background');
    const frontPixel = Math.min(...columns.map(c => c.front)), backPixel = Math.max(...columns.map(c => c.back));
    return { topLeft, bottomRight, frontPixel, backPixel,
        front: imagePoint(bg, background, 0, frontPixel).y,
        back: imagePoint(bg, background, 0, backPixel).y };
}
function rearSupports(data) {
    return ['monitor', 'plant', 'review'].map(key => {
        const image = images[key], alpha = bounds[key];
        const node = data.nodes.find(n => n.name === 'OfficeThemeArtwork' && n.parent === `${key === 'review' ? 'Zone' : 'Item'}-${key}`);
        // Bottommost visible strip, including the PNG's own shadow, defines
        // contact with the desk; tall rear artwork need not fit below its back edge.
        let left = image.width, right = 0;
        for (let y = Math.max(alpha.top, alpha.bottom - 8); y < alpha.bottom; y++) {
            for (let x = alpha.left; x < alpha.right; x++) if (image.pixels[(y * image.width + x) * 4 + 3] > 0) {
                left = Math.min(left, x); right = Math.max(right, x + 1);
            }
        }
        const foot = rect(node, { ...alpha, left, right, top: alpha.bottom, bottom: alpha.bottom });
        const surface = woodUnder(data, foot);
        return { key, footprint: foot, gapToFront: foot.bottom - surface.front, gapToBack: surface.back - foot.top };
    });
}
function measure(data, record = true) {
    const check = (value, message) => { if (record && !value) failures.push(message); };
    const name = `${data.width}x${data.height}`;
    const origin = data.nodes.find(n => n.name === 'WorkspaceContent');
    const bg = data.nodes.find(n => n.name === 'FullBleedArtwork');
    const bgRect = rect(bg, { left: 0, top: 0, right: background.width, bottom: background.height, width: background.width, height: background.height });
    check(bgRect.left <= 0.01 && bgRect.right >= 749.99 && bgRect.bottom <= 0.01 && bgRect.top >= data.height * 750 / data.width - 0.01,
        `${name}: background framing exposes an uncovered screen edge`);
    const findArtwork = (parent) => data.nodes.find(n => n.name === 'OfficeThemeArtwork' && n.parent === parent);
    const rear = ['monitor', 'plant', 'review'].map(key => ({ name: key, bounds: rect(findArtwork(`${key === 'review' ? 'Zone' : 'Item'}-${key}`), bounds[key]) }));
    for (const n of data.nodes) {
        if (n.name === 'MonitorNoteArtwork') rear.push({ name: n.name, bounds: rect(n, bounds.note) });
        if (n.text && n.glyph && ['Item-monitor', 'Item-plant', 'Zone-review', 'MonitorNoteArtwork'].includes(n.parent)) rear.push({ name: n.name, bounds: rect(n, n.glyph) });
        if (n.plate && n.parent === 'Zone-review') rear.push({ name: n.name, bounds: rect(n, { width: 1, height: 1, left: 0, right: 1, top: 0, bottom: 1 }) });
    }
    const supports = rearSupports(data);
    supports.forEach(s => {
        check(s.gapToFront >= 0, `${name}/${s.key}: rear support crosses desk front by ${(-s.gapToFront).toFixed(2)} design px`);
        check(s.gapToBack >= 0, `${name}/${s.key}: rear support is above desk back by ${(-s.gapToBack).toFixed(2)} design px`);
    });
    const front = FRONT.map(key => {
        const n = data.nodes.find(n => n.name === `Item-${key}`), sprite = findArtwork(n.name);
        const art = rect(sprite, bounds[key]); let visual = art;
        for (const l of data.nodes.filter(l => l.parent === n.name)) {
            if (l.text && l.glyph) visual = union(visual, rect(l, l.glyph));
            if (l.plate) visual = union(visual, rect(l, { width: 1, height: 1, left: 0, right: 1, top: 0, bottom: 1 }));
        }
        check(sprite.local.x === 0 && sprite.local.y === 0, `${name}/${key}: Sprite not at (0,0)`);
        check(n.local.x === n.home.x && n.local.y === n.home.y, `${name}/${key}: home differs from initial`);
        check(Math.abs(n.world.x - sprite.world.x) < 0.01 && Math.abs(n.world.y - sprite.world.y) < 0.01, `${name}/${key}: input and Sprite centers differ`);
        const { topLeft, bottomRight, frontPixel, backPixel, front: edge, back } = woodUnder(data, visual);
        // Same world-space transform as the rendered Sprite, including cover/crop.
        check(topLeft.x >= 0 && bottomRight.x <= background.width, `${name}/${key}: outside desk side`);
        check(topLeft.y >= backPixel, `${name}/${key}: outside back/side of wooden surface`);
        check(bottomRight.y <= frontPixel, `${name}/${key}: crosses actual wooden front edge`);
        const blockers = rear.filter(r => visual.left < r.bounds.right && visual.right > r.bounds.left);
        blockers.forEach(r => check(!overlap(visual, r.bounds), `${name}/${key}: overlaps ${r.name}`));
        const ceiling = Math.min(back, ...blockers.map(r => r.bounds.bottom));
        const localTop = visual.top - n.world.y, localBottom = visual.bottom - n.world.y;
        // Zero-gap feasibility is a lower bound; a negative interval cannot be fixed
        // by translating the parent, even before requesting a visible gap.
        const minY = edge - origin.world.y - localBottom;
        const maxY = ceiling - origin.world.y - localTop;
        const feasible = minY < maxY;
        check(feasible, `${name}/${key}: insufficient depth, short by ${(minY - maxY).toFixed(2)} design px even at zero gap`);
        return { key, initial: n.local, artwork: art, visual, blockers: blockers.map(r => r.name),
            gapToRear: Math.min(...blockers.map(r => r.bounds.bottom - visual.top)), gapToFront: visual.bottom - edge,
            feasibleY: { min: minY, max: maxY }, spareDepth: maxY - minY, feasible };
    });
    for (let i = 0; i < front.length; i++) for (let j = i + 1; j < front.length; j++) check(!overlap(front[i].visual, front[j].visual), `${name}: ${front[i].key} overlaps ${front[j].key}`);
    return { name, status: failures.some(f => f.startsWith(name)) ? 'FAIL' : 'PASS', pixelsPerDesignPixel: data.width / 750, rear, supports, front };
}

function planCandidate(data) {
    const copy = structuredClone(data), initial = measure(copy, false);
    const bg = copy.nodes.find(n => n.name === 'FullBleedArtwork');
    const coverTravel = Math.max(0, (bg.size.height * bg.matrix.m05 - copy.viewport.height) / 2);
    const depthDeficit = Math.max(0, ...initial.front.map(f => -f.spareDepth));
    // The available travel is also bounded by ALL rear support footprints.
    // Moving the texture never changes the desk's depth.
    const maximumDown = Math.min(coverTravel, ...initial.supports.map(s => s.gapToBack));
    let down = 0;
    if (depthDeficit > 0) {
        assert(maximumDown > depthDeficit, `${initial.name}: short-screen hypothesis has no space for gaps`);
        down = (depthDeficit + maximumDown) / 2;
    }
    bg.matrix.m13 -= down;
    bg.world.y -= down;
    bg.local.y -= down;
    const moved = measure(copy, false);
    assert(moved.front.every(f => f.feasible), `${initial.name}: at least one complete front-row interval is empty`);
    return { backgroundDown: down, coverTravel, maximumDown, depthDeficit,
        rearSupports: moved.supports,
        positions: Object.fromEntries(moved.front.map(f => [f.key, { x: f.initial.x, y: (f.feasibleY.min + f.feasibleY.max) / 2 }])),
        intervals: moved.front.map(f => ({ key: f.key, ...f.feasibleY })) };
}

async function capture(page) {
    return page.evaluate(() => {
        const scene = cc.director.getScene(), gv = scene.getComponentsInChildren('GameView')[0];
        function glyph(label) {
            if (!label?.string) return null;
            const canvas = label.assemblerData?.canvas;
            if (!canvas) throw Error(`Cannot measure actual label canvas: ${label.node.name}`);
            const { width, height } = canvas, pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
            let left = width, right = 0, top = height, bottom = 0;
            // Cocos text-processing fills the entire canvas with alpha=1/255
            // to avoid dark fringes. Exclude that guard fill, not glyph pixels.
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3] > 1) {
                left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
            }
            return right > left ? { width, height, left, right, top, bottom } : null;
        }
        const transforms = scene.getComponentsInChildren(cc.UITransform).filter(t => t.node.activeInHierarchy && (
            /^(Item-|Zone-|WorkspaceContent|OfficeLabelBackdrop-)/.test(t.node.name) || ['OfficeThemeArtwork', 'FullBleedArtwork', 'MonitorHint', 'ItemLabel', 'ZoneLabel', 'VisualBadge', 'VisualCode', 'MonitorNoteArtwork', 'MonitorNoteLabel'].includes(t.node.name)));
        return { width: innerWidth, height: innerHeight, viewport: gv._viewport,
            resolvedLayout: gv._officeDeskLayout, layoutGeometry: gv._officeDeskGeometry,
            taskCount: scene.getComponentsInChildren(cc.Label).find(l => l.node.activeInHierarchy && l.node.name === 'TaskCount').string,
            nodes: transforms.map(t => { const n = t.node, label = n.getComponent(cc.Label);
                let owner = n; while (owner.parent && !/^(Item-|Zone-)/.test(owner.name)) owner = owner.parent;
                return {
                name: n.name, parent: n.parent.name, local: { ...n.position }, world: { ...n.worldPosition }, matrix: { ...n.worldMatrix },
                size: { ...t.contentSize }, anchor: { ...t.anchorPoint }, text: label?.string, glyph: glyph(label), home: n.getComponent('WorkItem')?._homePosition,
                sibling: n.getSiblingIndex(),
                owner: owner.name, sprite: n.getComponent(cc.Sprite)?.spriteFrame?.name,
                plate: n.name.startsWith('OfficeLabelBackdrop-'),
                fill: n.name.startsWith('OfficeLabelBackdrop-') ? { r: n.getComponent(cc.Graphics).fillColor.r, g: n.getComponent(cc.Graphics).fillColor.g, b: n.getComponent(cc.Graphics).fillColor.b, a: n.getComponent(cc.Graphics).fillColor.a } : null,
                fontSize: label?.fontSize, actualFontSize: label?.actualFontSize, color: label ? { r: label.color.r, g: label.color.g, b: label.color.b, a: label.color.a } : null,
                interactive: [cc.Node.EventType.TOUCH_START, cc.Node.EventType.TOUCH_MOVE, cc.Node.EventType.TOUCH_END, cc.Node.EventType.TOUCH_CANCEL].some(type => n.hasEventListener(type)),
            }; }) };
    });
}
async function clickText(page, text) {
    const p = await page.evaluate(text => {
        const l = cc.director.getScene().getComponentsInChildren(cc.Label).find(l => l.node.activeInHierarchy && l.string === text);
        if (!l) throw Error(`Missing visible text: ${text}`);
        return { x: l.node.worldPosition.x * innerWidth / 750, y: innerHeight - l.node.worldPosition.y * innerWidth / 750 };
    }, text);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(160);
}
async function nodeState(page, name) {
    return page.evaluate(name => {
        const n = cc.director.getScene().getComponentsInChildren(cc.UITransform).find(t => t.node.activeInHierarchy && t.node.name === name)?.node;
        if (!n) throw Error(`Missing node: ${name}`);
        const w = n.getComponent('WorkItem');
        return { x: n.worldPosition.x * innerWidth / 750, y: innerHeight - n.worldPosition.y * innerWidth / 750,
            position: { ...n.position }, world: { ...n.worldPosition }, home: w && { ...w._homePosition }, completed: w?._completed, pressed: w?._pressed, tweens: cc.Tween.getRunningCount(n),
            sibling: n.getSiblingIndex(), lastSibling: n.parent.children.length - 1, dragSibling: w?._dragSiblingIndex,
            spriteLocal: { ...n.getChildByName('OfficeThemeArtwork')?.position } };
    }, name);
}
async function setup(page, level = '突击检查', first = true) {
    await page.goto(URL);
    await page.evaluate(async () => { globalThis.cc = await System.import('cc'); });
    await page.waitForFunction(() => cc.director.getScene()?.getComponentsInChildren('GameView')[0]?._officeThemeAssets);
    await clickText(page, '开始挑战'); await clickText(page, level); await clickText(page, '马上整理');
    if (first) await clickText(page, '我知道了');
    await page.waitForTimeout(220);
}
async function taskCount(page) { return page.evaluate(() => cc.director.getScene().getComponentsInChildren(cc.Label).find(l => l.node.name === 'TaskCount' && l.node.activeInHierarchy).string); }
async function verifyInput(page) {
    const initial = Object.fromEntries(await Promise.all(FRONT.map(async key => [key, await nodeState(page, `Item-${key}`)])));
    for (const key of FRONT) {
        const n = `Item-${key}`, before = await nodeState(page, n);
        await page.mouse.move(before.x, before.y); await page.mouse.down();
        const down = await nodeState(page, n); assert.deepEqual(down.position, before.position, `${key}: jumps on touch start`);
        assert.equal(down.sibling, before.sibling, `${key}: raises before actual movement`);
        await page.mouse.move(before.x + 12, before.y + 130, { steps: 8 });
        const moved = await nodeState(page, n);
        assert.equal(moved.sibling, moved.lastSibling); assert.equal(moved.dragSibling, before.sibling);
        assert(Math.abs(moved.x - before.x - 12) < 1.1 && Math.abs(moved.y - before.y - 130) < 1.1, `${key}: finger offset`);
        await page.mouse.up(); await page.waitForTimeout(450);
        const home = await nodeState(page, n); assert.deepEqual(home.position, before.position); assert.equal(home.tweens, 0); assert.equal(await taskCount(page), '整理清单 0/4');
        assert.equal(home.sibling, before.sibling); assert.equal(home.dragSibling, null);
        inputResults.push(`${key}: touch center/start/move/wrong release/home/Tween PASS`);
    }
    const monitor = await nodeState(page, 'Item-monitor'); await page.mouse.click(monitor.x, monitor.y);
    await page.waitForTimeout(220); assert.equal(await taskCount(page), '整理清单 1/4');
    assert.equal((await nodeState(page, 'Item-monitor')).sibling, monitor.sibling);
    inputResults.push('monitor click without raising rear node PASS');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    for (const key of FRONT) {
        const n = `Item-${key}`, before = await nodeState(page, n);
        await touch('touchStart', before.x, before.y);
        const down = await nodeState(page, n);
        assert(down.pressed, `${key}: center touch intercepted after monitor click`);
        assert.deepEqual(down.position, before.position); assert.equal(down.sibling, before.sibling);
        await touch('touchMove', before.x + 12, before.y + 130);
        const moved = await nodeState(page, n);
        assert(Math.abs(moved.x - before.x - 12) < 1.1 && Math.abs(moved.y - before.y - 130) < 1.1, `${key}: touch/image offset`);
        assert.equal(moved.sibling, moved.lastSibling);
        await touch('touchEnd'); await page.waitForTimeout(450);
        const home = await nodeState(page, n);
        assert.deepEqual(home.position, before.position); assert.equal(home.sibling, before.sibling); assert.equal(home.tweens, 0);
        await touch('touchStart', before.x, before.y); await touch('touchMove', before.x, before.y + 30);
        await touch('touchCancel'); await page.waitForTimeout(450);
        const canceled = await nodeState(page, n);
        assert.deepEqual(canceled.position, before.position); assert.equal(canceled.sibling, before.sibling); assert.equal(canceled.dragSibling, null); assert.equal(canceled.tweens, 0);
        inputResults.push(`${key}: post-monitor real browser touch center/move/wrong release/cancel/order restore PASS`);
    }
    let count = 1;
    for (const [key, zone] of [['console', 'drawer'], ['snack', 'trash'], ['contract', 'review']]) {
        const item = await nodeState(page, `Item-${key}`), target = await nodeState(page, `Zone-${zone}`);
        await touch('touchStart', item.x, item.y);
        const picked = await nodeState(page, `Item-${key}`);
        assert(picked.pressed, `${key}: center pickup failed`);
        for (let step = 1; step <= 12; step++) await touch('touchMove', item.x + (target.x - item.x) * step / 12, item.y + (target.y - item.y) * step / 12);
        await touch('touchEnd');
        assert.equal((await nodeState(page, `Item-${key}`)).sibling, item.sibling, `${key}: drop must restore drag order`);
        await page.waitForTimeout(400);
        const snapped = await nodeState(page, `Item-${key}`);
        assert(snapped.completed, `${key}: center touch did not reach original target`);
        assert.equal(snapped.spriteLocal.x, 0); assert.equal(snapped.spriteLocal.y, 0); assert.equal(snapped.dragSibling, null);
        assert(Math.abs(snapped.world.x - target.world.x) < 0.01 && Math.abs(snapped.world.y - target.world.y) < 0.01);
        assert.equal(await taskCount(page), `整理清单 ${++count}/4`); inputResults.push(`${key} -> original ${zone} snap PASS`);
    }
    await page.waitForFunction(() => cc.director.getScene().getComponentsInChildren(cc.Label).some(l => l.node.activeInHierarchy && l.node.name === 'ResultTitle' && l.string.includes('成功')), null, { timeout: 20000 });
    inputResults.push('success path PASS');
    await clickText(page, '重新挑战'); await clickText(page, '马上整理');
    assert.equal(await taskCount(page), '整理清单 0/4');
    for (const key of FRONT) assert.deepEqual((await nodeState(page, `Item-${key}`)).position, initial[key].position);
    await page.screenshot({ path: path.join(OUTPUT, 'retry-0of4-393x873.png') });
    inputResults.push('retry to initial 0/4 PASS');
    const before = await nodeState(page, 'Item-snack');
    await page.mouse.move(before.x, before.y); await page.mouse.down(); await page.mouse.move(before.x, before.y + 30);
    await page.evaluate(() => { cc.game.emit(cc.Game.EVENT_HIDE); cc.game.emit(cc.Game.EVENT_SHOW); });
    await page.mouse.up(); await clickText(page, '继续整理');
    const restored = await nodeState(page, 'Item-snack'); assert.deepEqual(restored.position, before.position); assert.equal(restored.tweens, 0);
    assert.equal(restored.sibling, before.sibling); assert.equal(restored.dragSibling, null);
    inputResults.push('simulated engine hide/show/continue PASS (not physical device)');
    await page.evaluate(() => { globalThis.oldOfficeItems = cc.director.getScene().getComponentsInChildren('WorkItem').map(w => w.node); });
    const back = await nodeState(page, 'GameBackButton'); await page.mouse.click(back.x, back.y); await page.waitForTimeout(150);
    assert(await page.evaluate(() => oldOfficeItems.every(n => !n.activeInHierarchy && cc.Tween.getRunningCount(n) === 0)), 'exit leaves active items/Tweens');
    await clickText(page, '突击检查'); await clickText(page, '马上整理'); assert.equal(await taskCount(page), '整理清单 0/4');
    for (const key of FRONT) assert.deepEqual((await nodeState(page, `Item-${key}`)).position, initial[key].position);
    assert(await page.evaluate(() => oldOfficeItems.every(n => !cc.isValid(n, true) && cc.Tween.getRunningCount(n) === 0)), 'reentry leaves destroyed-level nodes/Tweens');
    inputResults.push('exit/reenter PASS');
    // Real countdown; no time acceleration or direct task-completion calls.
    await page.waitForFunction(() => cc.director.getScene().getComponentsInChildren(cc.Label).some(l => l.node.activeInHierarchy && l.node.name === 'ResultTitle' && l.string.includes('失败')), null, { timeout: 47000 });
    inputResults.push('natural timeout failure PASS');
    await cdp.detach();
}

async function verifySwitching(browser) {
    const page = await browser.newPage({ viewport: { width: 393, height: 873 }, deviceScaleFactor: 1, hasTouch: true });
    page.on('pageerror', error => failures.push(`switching: browser ${error.message}`));
    // Isolated test profile only. Exercise actual level-select/exit UI without
    // pretending that fixture-unlocked levels were continuously completed.
    await page.addInitScript(() => localStorage.setItem('boss-is-coming.progress', JSON.stringify({ version: 1, highestUnlockedLevel: 5, tutorialSeen: true })));
    await setup(page, '突击检查', false);
    let firstLayout;
    for (const number of [1, 2, 3, 4, 5, 1]) {
        const level = JSON.parse(fs.readFileSync(path.join(ROOT, `assets/resources/levels/level-00${number}.json`)));
        if (firstLayout !== undefined) { await clickText(page, level.name); await clickText(page, '马上整理'); }
        const state = await page.evaluate(level => {
            const gv = cc.director.getScene().getComponentsInChildren('GameView')[0];
            const bg = cc.director.getScene().getComponentsInChildren(cc.UITransform).find(t => t.node.activeInHierarchy && t.node.name === 'FullBleedArtwork').node;
            return { layout: gv._officeDeskLayout, background: { position: { ...bg.position }, scale: { ...bg.scale } },
                items: Array.from(gv._workItems.values()).map(w => ({ id: w.itemId, home: { ...w._homePosition }, policy: w._temporaryDragOrder, size: { ...w.node.getComponent(cc.UITransform).contentSize } })),
                zones: Array.from(gv._dropZones.values()).map(z => ({ id: z.zoneId, position: { ...z.node.position }, size: { ...z.node.getComponent(cc.UITransform).contentSize } })),
                oldDestroyed: !globalThis.switchOldNodes || switchOldNodes.every(n => !cc.isValid(n, true) && cc.Tween.getRunningCount(n) === 0),
            };
        }, level);
        assert(state.oldDestroyed, 'switching left stale level nodes/Tweens');
        for (const zone of level.zones) {
            const actual = state.zones.find(z => z.id === zone.id);
            assert.deepEqual(actual.position, { ...zone.position, z: 0 }); assert.deepEqual(actual.size, zone.size);
        }
        if (number === 1) {
            assert(state.layout.ok);
            if (firstLayout === undefined) firstLayout = state.layout;
            else assert.deepEqual(state.layout, firstLayout, 'return to level one must reproduce the same layout');
        }
        assert(state.layout.ok, `${level.id}: missing template layout`);
        for (const config of level.items) {
            const item = state.items.find(i => i.id === config.id);
            const position = config.interaction === 'drag' ? state.layout.positions[config.id] : config.initialPosition;
            assert.deepEqual(item.home, { ...position, z: 0 }); assert.deepEqual(item.size, config.size); assert.equal(item.policy, true);
        }
        await page.screenshot({ path: path.join(OUTPUT, `switch-${level.id}.png`) });
        await page.evaluate(() => { globalThis.switchOldNodes = cc.director.getScene().getComponentsInChildren('WorkItem').map(w => w.node); });
        const back = await nodeState(page, 'GameBackButton'); await page.mouse.click(back.x, back.y); await page.waitForTimeout(160);
    }
    inputResults.push('fixture-unlocked real UI switching 1→2→3→4→5→1; template homes and unchanged sizes/targets; cleanup PASS');
    await page.close();
}
async function main() {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    try {
        for (const [width, height] of SIZES) {
            const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
            page.on('pageerror', error => failures.push(`${width}x${height}: browser ${error.message}`));
            await setup(page);
            let candidate;
            if (CANDIDATE) {
                candidate = planCandidate(await capture(page));
                await page.evaluate(plan => {
                    const transforms = cc.director.getScene().getComponentsInChildren(cc.UITransform);
                    const bg = transforms.find(t => t.node.name === 'FullBleedArtwork').node;
                    bg.setPosition(0, -plan.backgroundDown, 0);
                    for (const [key, p] of Object.entries(plan.positions)) {
                        const n = transforms.find(t => t.node.name === `Item-${key}`).node;
                        n.setPosition(p.x, p.y, 0);
                        n.getComponent('WorkItem')._homePosition.set(n.position);
                    }
                }, candidate);
                await page.waitForTimeout(80);
            }
            const data = await capture(page); assert.equal(data.taskCount, '整理清单 0/4');
            if (candidate) data.candidate = candidate;
            fs.writeFileSync(path.join(OUTPUT, `initial-${width}x${height}.json`), JSON.stringify(data, null, 2));
            await page.screenshot({ path: path.join(OUTPUT, `initial-0of4-${width}x${height}.png`) });
            const report = measure(data); if (candidate) report.candidate = candidate; reports.push(report);
            console.log(`${report.name}: ${report.status}; zero-gap spare depth: ${report.front.map(f => `${f.key}=${f.spareDepth.toFixed(2)}`).join(', ')}`);
            if (width === 393 && height === 873 && !CANDIDATE && !GEOMETRY_ONLY && failures.length === 0) { await verifyInput(page); console.log(inputResults.join('\n')); }
            await page.close();
        }
        if (!CANDIDATE && !GEOMETRY_ONLY && failures.length === 0) await verifySwitching(browser);
        if (CANDIDATE) inputResults.push('NOT RUN: candidate geometry only; production coordinates and input layering unchanged');
        else if (GEOMETRY_ONLY) inputResults.push('NOT RUN: geometry-only gate before visual review');
        else if (failures.length) inputResults.push('NOT RUN or incomplete: six-size geometry/input gate failed; inspect failures');
    } finally { await browser.close(); }
}
module.exports = { readPng, alphaBounds, point, rect, union, overlap, woodUnder, capture, background };
if (require.main === module) main().catch(error => { failures.push(error.stack); }).finally(() => {
    fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify({ candidateHypothesis: CANDIDATE, backgroundHash: background.sha256, alphaBounds: bounds, reports, inputResults, failures, physicalDevice: 'UNVERIFIED' }, null, 2));
    console.log(`Report: ${path.join(OUTPUT, 'report.json')}`);
    if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
});
