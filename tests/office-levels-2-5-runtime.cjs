/* Real browser template/resource/state acceptance for levels 2–5.
 * PLAYWRIGHT_MODULE=/path/to/playwright-core node tests/office-levels-2-5-runtime.cjs
 * Build Web Mobile and serve the repo on 8765 first. No direct task completion calls.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { measureLevel } = require('./office-layout-geometry.cjs');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = process.env.OFFICE_TEST_OUTPUT || path.join(ROOT, 'temp/office-levels-2-5-v2');
const URL = process.env.OFFICE_TEST_URL || 'http://127.0.0.1:8765/build/web-mobile/';
const SIZES = [[750, 1334], [360, 640], [360, 780], [360, 800], [393, 852], [393, 873]];
const INPUT_ONLY = process.argv.includes('--input-only');
const LEVELS = [2, 3, 4, 5].map(n => JSON.parse(fs.readFileSync(path.join(ROOT, `assets/resources/levels/level-00${n}.json`))));
const reports = [], failures = [];
const { parseOfficeLayoutCatalog } = require('../temp/core-regressions/assets/scripts/ui/OfficeLayoutCatalog.js');
const expectedFingerprint = parseOfficeLayoutCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/resources/office/intern-office-layouts.json')))).fingerprint;
const baseline = process.env.OFFICE_LAYOUT_BASELINE ? JSON.parse(fs.readFileSync(process.env.OFFICE_LAYOUT_BASELINE)) : null;
fs.mkdirSync(OUTPUT, { recursive: true });

function expectedAsset(config) {
    if (config.visual === 'report-page') return `intern-${config.visualVariant}`;
    return {
        monitor: 'intern-monitor-play', console: 'intern-game-console', snack: 'intern-snack-bag',
        plant: 'intern-plant', contract: 'intern-blue-contract', 'contract-red': 'intern-red-contract',
        'contract-yellow': 'intern-yellow-contract', 'bound-report': 'intern-bound-report',
        coffee: 'intern-coffee', 'visitor-badge': 'intern-visitor-badge',
    }[config.visual];
}

async function clickText(page, text) {
    const p = await page.evaluate(text => {
        const label = cc.director.getScene().getComponentsInChildren(cc.Label).find(l => l.node.activeInHierarchy && l.string === text);
        if (!label) throw Error(`Missing UI: ${text}`);
        return { x: label.node.worldPosition.x * innerWidth / 750, y: innerHeight - label.node.worldPosition.y * innerWidth / 750 };
    }, text);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(180);
}
async function enter(browser, size, level) {
    const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: true });
    page.on('pageerror', e => failures.push(e.message));
    await page.addInitScript(() => localStorage.setItem('boss-is-coming.progress', JSON.stringify({ version: 1, highestUnlockedLevel: 5, tutorialSeen: true })));
    await page.goto(URL);
    await page.evaluate(async () => { globalThis.cc = await System.import('cc'); });
    await page.waitForFunction(() => cc.director.getScene()?.getComponentsInChildren('GameView')[0]?._officeThemeAssets);
    await clickText(page, '开始挑战'); await clickText(page, level.name); await clickText(page, '马上整理');
    return page;
}
async function state(page) {
    return page.evaluate(() => {
        const gv = cc.director.getScene().getComponentsInChildren('GameView')[0];
        const labels = n => n.getComponentsInChildren(cc.Label).filter(l => l.node.activeInHierarchy).map(l => ({ name: l.node.name, text: l.string, color: { r: l.color.r, g: l.color.g, b: l.color.b }, fontSize: l.actualFontSize }));
        const plates = n => n.children.filter(c => c.name.startsWith('OfficeLabelBackdrop-') && c.activeInHierarchy).map(c => ({ name: c.name, position: { ...c.position } }));
        const geometry = n => ({ position: { ...n.position }, size: { ...n.getComponent(cc.UITransform).contentSize },
            x: n.worldPosition.x * innerWidth / 750, y: innerHeight - n.worldPosition.y * innerWidth / 750 });
        return {
            deskLayout: gv._officeDeskLayout,
            levelId: gv._officeDeskContext.level.id, fingerprint: gv._officeThemeAssets.layoutCatalog.fingerprint,
            items: Array.from(gv._workItems.values()).map(w => ({ id: w.itemId, ...geometry(w.node), home: { ...w._homePosition },
                sibling: w.node.getSiblingIndex(), lastSibling: w.node.parent.children.length - 1, dragSibling: w._dragSiblingIndex,
                completed: w._completed, pressed: w._pressed, active: w.node.activeInHierarchy, clicks: w._clickProgress,
                artwork: w.node.getChildByName('OfficeThemeArtwork')?.active ?? false,
                sprite: w.node.getChildByName('OfficeThemeArtwork')?.getComponent(cc.Sprite)?.spriteFrame?.name,
                spriteLocal: { ...w.node.getChildByName('OfficeThemeArtwork')?.position },
                spriteSize: { ...w.node.getChildByName('OfficeThemeArtwork')?.getComponent(cc.UITransform)?.contentSize },
                labels: labels(w.node), plates: plates(w.node), tweens: cc.Tween.getRunningCount(w.node) })),
            zones: Array.from(gv._dropZones.values()).map(z => ({ id: z.zoneId, ...geometry(z.node), artwork: z.node.getChildByName('OfficeThemeArtwork')?.active ?? false,
                sprite: z.node.getChildByName('OfficeThemeArtwork')?.getComponent(cc.Sprite)?.spriteFrame?.name,
                labels: labels(z.node), plates: plates(z.node) })),
        };
    });
}
async function item(page, id) { return (await state(page)).items.find(i => i.id === id); }
async function clickMonitor(page) {
    const n = await item(page, 'monitor'); await page.mouse.click(n.x, n.y); await page.waitForTimeout(180);
}
async function screenshot(page, name) { await page.screenshot({ path: path.join(OUTPUT, `${name}.png`) }); }
async function drag(page, id, zoneId) {
    const before = await item(page, id);
    assert(before.active, `${id}: must appear through normal activation`);
    const target = zoneId ? (await state(page)).zones.find(z => z.id === zoneId) : { x: before.x + 8, y: before.y + 95 };
    const cdp = await page.context().newCDPSession(page);
    const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
    try {
        await send('touchStart', before.x, before.y);
        assert((await item(page, id)).pressed, `${id}: center touch intercepted`);
        assert.deepEqual((await item(page, id)).position, before.position, `${id}: jumps on touch start`);
        assert.equal((await item(page, id)).sibling, before.sibling, `${id}: raises before movement`);
        for (let step = 1; step <= 8; step++) await send('touchMove', before.x + (target.x - before.x) * step / 8, before.y + (target.y - before.y) * step / 8);
        const moved = await item(page, id);
        assert(Math.abs(moved.x - target.x) < 1 && Math.abs(moved.y - target.y) < 1, `${id}: image does not follow finger`);
        assert.equal(moved.sibling, moved.lastSibling, `${id}: dragging must be temporarily foreground`);
        assert.deepEqual(moved.labels.map(l => [l.name, l.color]), before.labels.map(l => [l.name, l.color]), `${id}: selection changes readable text color`);
        if (zoneId === 'review') {
            const hover = (await state(page)).zones.find(z => z.id === zoneId);
            assert.deepEqual(hover.labels, target.labels, 'target highlight must keep readable title color/size');
        }
        await send('touchEnd'); await page.waitForTimeout(420);
    } finally { await cdp.detach(); }
    const after = await item(page, id);
    const levelId = (await state(page)).levelId;
    const level = LEVELS.find(l => l.id === levelId);
    if (!zoneId || !level.items.some(i => i.id === id && i.targetZoneId === zoneId)) {
        assert(!after.completed, `${id}: decoy/wrong release incorrectly completed`);
        for (const axis of ['x', 'y', 'z']) assert(Math.abs(after.position[axis] - before.home[axis]) < 0.0001,
            `${id}: wrong release did not return home (${axis})`);
    } else {
        assert(after.completed, `${id}: original target rejected`);
        assert(Math.abs(after.x - target.x) < 1 && Math.abs(after.y - target.y) < 1, `${id}: wrong snap position`);
        if (level.items.find(i => i.id === id).completeZoneOnDrop === false) assert.equal(after.plates.length, 0, `${id}: collected label plate leaked`);
        if (zoneId === 'review') {
            const done = (await state(page)).zones.find(z => z.id === zoneId);
            assert.deepEqual(done.labels, target.labels, 'completed target must retain readable title');
        }
    }
    assert.equal(after.tweens, 0, `${id}: lingering feedback tween`);
    assert.equal(after.dragSibling, null, `${id}: temporary drag order not released`);
    if (!after.completed) assert.equal(after.sibling, before.sibling, `${id}: wrong drop did not restore order`);
}
async function waitActive(page, id) {
    await page.waitForFunction(id => cc.director.getScene().getComponentsInChildren('WorkItem').some(w => w.itemId === id && w.node.activeInHierarchy), id, { timeout: 17000 });
    await page.waitForFunction(id => {
        const w = cc.director.getScene().getComponentsInChildren('WorkItem').find(w => w.itemId === id);
        return w && cc.Tween.getRunningCount(w.node) === 0 && Math.abs(w.node.scale.x - 1) < 0.00001;
    }, id, { timeout: 2000 });
}
async function verifyFlow(browser, level) {
    const page = await enter(browser, [393, 873], level);
    try {
        await drag(page, 'console');
        if (level.order === 2) {
            await drag(page, 'red-contract', 'review'); await drag(page, 'yellow-contract', 'review');
        }
        if (level.order === 5) await drag(page, 'old-contract', 'review');
        const monitorBefore = await item(page, 'monitor');
        await clickMonitor(page);
        if (level.order === 5) {
            const middle = await item(page, 'monitor');
            assert.equal(middle.clicks, 1); assert(!middle.completed); assert(middle.artwork);
            assert.match(middle.sprite, /intern-monitor-mail/);
            assert.deepEqual(middle.position, monitorBefore.position);
            assert.deepEqual(middle.spriteLocal, monitorBefore.spriteLocal);
            assert.deepEqual(middle.spriteSize, monitorBefore.spriteSize);
            assert(middle.labels.some(l => l.text === '再点一次打开报表'));
            await screenshot(page, 'level-005-mail-intermediate-393x873');
            await clickMonitor(page);
            const final = await item(page, 'monitor'); assert.equal(final.clicks, 2); assert(final.completed && final.artwork);
            assert.match(final.sprite, /intern-monitor-work/);
            assert.deepEqual(final.position, monitorBefore.position);
            assert.deepEqual(final.spriteLocal, monitorBefore.spriteLocal);
            assert.deepEqual(final.spriteSize, monitorBefore.spriteSize);
            await screenshot(page, 'level-005-work-final-393x873');
        }
        await drag(page, 'console', 'drawer');
        if (level.order === 2) {
            await drag(page, 'snack', 'trash'); await drag(page, 'blue-contract', 'review');
        } else if (level.order === 3) {
            for (const [index, id] of ['report-page-1', 'report-page-2', 'report-page-3'].entries()) {
                await drag(page, id, 'folder');
                assert(!(await item(page, id)).artwork, 'collected page sprite must stay hidden');
                const folder = (await state(page)).zones.find(z => z.id === 'folder');
                assert(folder.labels.some(l => l.text.includes(index < 2 ? `${index + 1}/3` : '已装订')));
            }
            await waitActive(page, 'bound-report'); await screenshot(page, 'level-003-bound-report-unlocked');
            await drag(page, 'bound-report', 'review');
        } else if (level.order === 4) {
            await drag(page, 'contract', 'review'); await waitActive(page, 'coffee');
            await screenshot(page, 'level-004-coffee-event'); await drag(page, 'coffee'); await drag(page, 'coffee', 'trash');
        } else {
            await drag(page, 'current-contract', 'review'); await waitActive(page, 'visitor-badge');
            await screenshot(page, 'level-005-badge-event'); await drag(page, 'visitor-badge'); await drag(page, 'visitor-badge', 'visitor-spot');
        }
        await page.waitForFunction(() => cc.director.getScene().getComponentsInChildren(cc.Label).some(l => l.node.activeInHierarchy && l.node.name === 'ResultTitle' && l.string.includes('成功')), null, { timeout: 20000 });
        await clickText(page, level.order === 5 ? '再次挑战' : '重新挑战'); await clickText(page, '马上整理');
        const reset = await state(page);
        for (const config of level.items) {
            const actual = reset.items.find(i => i.id === config.id);
            assert(!actual.completed && actual.clicks === 0);
            if (config.interaction === 'drag') {
                const expected = reset.deskLayout.positions[config.id];
                assert(expected, `${config.id}: retry layout position missing`);
                for (const axis of ['x', 'y']) assert(Math.abs(actual.position[axis] - expected[axis]) < 0.0001,
                    `${config.id}: retry did not return to solved home`);
            } else {
                assert.deepEqual(actual.position, { ...config.initialPosition, z: 0 });
            }
            assert.equal(actual.active, config.initiallyVisible !== false);
        }
        await screenshot(page, `${level.id}-retry-393x873`);
        reports.push({ level: level.id, input: 'PASS: center touch, wrong release, targets, prerequisites/events, success, retry' });
        console.log(`${level.id}: input/state flow PASS`);
    } finally { await page.close(); }
}
async function main() {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
    try {
        for (let first = 0; !INPUT_ONLY && first < SIZES.length; first += 2) {
          await Promise.all(SIZES.slice(first, first + 2).map(async size => {
           for (const level of LEVELS) {
            const page = await enter(browser, size, level);
            try {
                const current = await state(page);
                assert(current.deskLayout?.ok, `${level.id}: missing template solver layout`);
                assert.equal(current.fingerprint, expectedFingerprint, 'browser build uses stale layout catalog');
                for (const config of level.items) {
                    const actual = current.items.find(i => i.id === config.id);
                    if (config.interaction === 'drag') {
                        const expected = current.deskLayout?.positions?.[config.id];
                        assert(expected, `${config.id}: level 2 solver position missing`);
                        assert(Math.abs(actual.position.x - expected.x) < 0.0001 && Math.abs(actual.position.y - expected.y) < 0.0001,
                            `${config.id}: parent position is not the solved tabletop position`);
                        assert.deepEqual(actual.home, { ...expected, z: 0 }, `${config.id}: home is not synchronized with tabletop position`);
                    }
                    if (config.interaction !== 'drag') assert.deepEqual(actual.home, { ...config.initialPosition, z: 0 });
                    assert.deepEqual(actual.size, config.size);
                    assert(actual.artwork, `${level.id}/${config.id}: PNG binding, including hidden items`);
                    assert.equal(actual.sprite, expectedAsset(config), `${level.id}/${config.id}: wrong asset/variant`);
                    if (config.interaction === 'drag') assert.deepEqual(actual.spriteLocal, { x: 0, y: 0, z: 0 });
                    if (['contract', 'contract-red', 'contract-yellow'].includes(config.visual) && config.visualVariant) {
                        assert(actual.labels.some(l => l.name === 'VisualBadge' && l.text === config.visualBadge && l.color.r < 100));
                        assert(actual.labels.some(l => l.name === 'VisualCode' && l.text === config.visualCode));
                        assert(!actual.labels.some(l => l.name === 'ItemLabel' && l.text), 'generic label covers variant identity');
                    }
                    if (config.visual === 'report-page') assert(actual.labels.some(l => l.name === 'VisualBadge' && l.text === config.visualBadge), 'report page number must be visible');
                }
                for (const config of level.zones) {
                    const actual = current.zones.find(z => z.id === config.id);
                    assert.deepEqual(actual.position, { ...config.position, z: 0 }); assert.deepEqual(actual.size, config.size);
                    assert(actual.artwork);
                    assert.equal(actual.sprite, { drawer: 'intern-personal-drawer', trash: 'intern-wastebasket',
                        'review-tray': 'intern-inspection-tray', 'report-folder': 'intern-report-folder', 'badge-stand': 'intern-badge-stand' }[config.visual]);
                }
                const name = `${level.id}-initial-${size.join('x')}`;
                if (baseline) {
                    const previous = baseline.reports.find(r => r.name === name);
                    assert(previous, `${name}: missing before-change baseline`);
                    assert.deepEqual(current.deskLayout, previous.state.deskLayout, `${name}: text styling moved items/background`);
                }
                const geometry = await measureLevel(page, level, current);
                await screenshot(page, name); reports.push({ name, status: 'PASS: PNG/label/wood geometry and reserved homes', state: current, geometry });
                console.log(`${name}: template geometry PASS`);
                // Worst-case delayed phases: do not clear the desk first.
                if (level.order === 3) {
                    for (const id of ['report-page-1', 'report-page-3', 'report-page-2']) await drag(page, id, 'folder');
                    await waitActive(page, 'bound-report');
                    const host = await item(page, 'report-page-2');
                    assert(!host.artwork && host.tweens === 0, 'replacement appears before old occupant is hidden');
                }
                if (level.order === 4) await waitActive(page, 'coffee');
                if (level.order === 5) await waitActive(page, 'visitor-badge');
                if (level.order >= 3) {
                    const phase = await state(page);
                    const phaseName = `${level.id}-delayed-${size.join('x')}`;
                    const phaseGeometry = await measureLevel(page, level, phase);
                    await screenshot(page, phaseName); reports.push({ name: phaseName, status: 'PASS: delayed maximum occupancy', geometry: phaseGeometry });
                    console.log(`${phaseName}: reserved/reused geometry PASS`);
                }
            } finally { await page.close(); }
           }
          }));
        }
        for (const level of LEVELS) await verifyFlow(browser, level);
    } finally { await browser.close(); }
}
main().catch(e => failures.push(e.stack)).finally(() => {
    fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify({ fingerprint: expectedFingerprint, reports, failures, physicalDevice: 'UNVERIFIED', tabletopLayout: failures.length ? 'FAIL / INCOMPLETE' : INPUT_ONLY ? 'NOT RUN: input-only' : 'PASS: all six sizes, initial and delayed phases, original targets' }, null, 2));
    const cards = reports.filter(r => r.geometry).map(r => `<article><h2>${r.name}</h2><img src="${r.name}.png" loading="lazy"><p>${r.geometry.taskCount}</p><ul>${r.geometry.front.map(f => `<li>${f.id}: (${f.position.x.toFixed(1)}, ${f.position.y.toFixed(1)}), 后排间隙 ${f.screenGapToRear.toFixed(1)}px / 桌沿 ${f.screenGapToFront.toFixed(1)}px</li>`).join('')}</ul></article>`).join('');
    fs.writeFileSync(path.join(OUTPUT, 'preview.html'), `<!doctype html><meta charset="utf-8"><title>办公室模板六尺寸验收</title><style>body{font:14px system-ui;background:#12232b;color:#eaf4f6;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:24px}article{background:#203741;padding:16px;border-radius:12px}h2{font-size:16px}img{width:100%;max-height:640px;object-fit:contain}li{margin:8px 0}</style><h1>办公室模板：初始与延迟物品</h1><p>${expectedFingerprint} · ${failures.length ? '失败/未完成，请检查 report.json' : '浏览器回归通过'} · 真机未验证</p><main>${cards}</main>`);
    console.log(`Report: ${path.join(OUTPUT, 'report.json')}`);
    if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
});
