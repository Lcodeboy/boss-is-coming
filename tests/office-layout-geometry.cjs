// Independent acceptance: decode source PNG alpha/wood pixels, use rendered
// world transforms and actual text canvases. No expected-coordinate assertions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readPng, alphaBounds, rect, union, overlap, woodUnder, capture, background } = require('./intern-office-layout-runtime.cjs');
const ROOT = path.resolve(__dirname, '..');
const images = new Map();
function source(name) {
    if (!images.has(name)) {
        const file = [1, 2].map(v => path.join(ROOT, `assets/resources/office/intern-office-v${v}/${name}.png`)).find(fs.existsSync);
        assert(file, `Unknown PNG ${name}`);
        const image = readPng(file); images.set(name, { image, alpha: alphaBounds(image) });
    }
    return images.get(name);
}
async function measureLevel(page, level, state) {
    const data = await capture(page);
    const bg = data.nodes.find(n => n.name === 'FullBleedArtwork');
    const bgRect = rect(bg, { ...background, left: 0, right: background.width, top: 0, bottom: background.height });
    assert(bgRect.left <= 0.01 && bgRect.right >= 749.99 && bgRect.bottom <= 0.01 && bgRect.top >= data.height * 750 / data.width - 0.01, 'background leaves viewport uncovered');
    const ownerVisuals = owner => data.nodes.filter(n => n.owner === owner).flatMap(n => {
        if (n.sprite) return [{ name: `${owner}/${n.name}`, bounds: rect(n, source(n.sprite).alpha) }];
        if (n.glyph) return [{ name: `${owner}/${n.name}`, bounds: rect(n, n.glyph) }];
        if (n.plate) return [{ name: `${owner}/${n.name}`, bounds: rect(n, { width: 1, height: 1, left: 0, right: 1, top: 0, bottom: 1 }) }];
        return [];
    });
    const rearOwners = [...level.items.filter(i => i.interaction !== 'drag').map(i => `Item-${i.id}`), ...level.zones.filter(z => z.position.y >= 0).map(z => `Zone-${z.id}`)];
    const rear = rearOwners.flatMap(ownerVisuals);
    assert(rear.length > 0, 'missing rear PNG/label bounds');
    const supports = rearOwners.map(owner => {
        const n = data.nodes.find(n => n.owner === owner && n.name === 'OfficeThemeArtwork');
        const { image, alpha } = source(n.sprite);
        let left = image.width, right = 0;
        for (let y = Math.max(alpha.top, alpha.bottom - 8); y < alpha.bottom; y++) for (let x = alpha.left; x < alpha.right; x++) {
            if (image.pixels[(y * image.width + x) * image.channels + 3] > 0) { left = Math.min(left, x); right = Math.max(right, x + 1); }
        }
        const foot = rect(n, { ...alpha, left, right, top: alpha.bottom, bottom: alpha.bottom });
        const surface = woodUnder(data, foot);
        assert(foot.bottom >= surface.front && foot.top <= surface.back, `${owner}: rear support not on wood`);
        return { owner, gapToFront: foot.bottom - surface.front, gapToBack: surface.back - foot.top };
    });
    const front = level.items.filter(i => i.interaction === 'drag' && state.items.some(s => s.id === i.id && s.active && !s.completed)).map(config => {
        const owner = `Item-${config.id}`, n = data.nodes.find(n => n.name === owner);
        const sprite = data.nodes.find(n => n.owner === owner && n.name === 'OfficeThemeArtwork');
        assert(sprite && sprite.local.x === 0 && sprite.local.y === 0, `${owner}: sprite baseline changed`);
        assert(Math.abs(n.world.x - sprite.world.x) < 0.01 && Math.abs(n.world.y - sprite.world.y) < 0.01, `${owner}: input/visual canvas centers differ`);
        const visual = ownerVisuals(owner).map(v => v.bounds).reduce(union);
        const touch = rect(n, { width: 1, height: 1, left: 0, right: 1, top: 0, bottom: 1 });
        const surface = woodUnder(data, visual);
        assert(surface.topLeft.x >= 0 && surface.bottomRight.x <= background.width, `${owner}: outside wood sides`);
        assert(surface.topLeft.y >= surface.backPixel && surface.bottomRight.y <= surface.frontPixel, `${owner}: outside actual wood depth`);
        const blockers = rear.filter(r => visual.left < r.bounds.right && visual.right > r.bounds.left);
        blockers.forEach(r => assert(!overlap(visual, r.bounds), `${owner}: overlaps ${r.name}`));
        const gapToRear = Math.min(surface.back - visual.top, ...blockers.map(r => r.bounds.bottom - visual.top));
        const gapToFront = visual.bottom - surface.front;
        assert(gapToRear > 0 && gapToFront > 0, `${owner}: no visible clearance`);
        return { id: config.id, position: n.local, visual, touch, gapToRear, gapToFront,
            screenGapToRear: gapToRear * data.width / 750, screenGapToFront: gapToFront * data.width / 750 };
    });
    for (let i = 0; i < front.length; i++) for (let j = i + 1; j < front.length; j++) {
        assert(!overlap(front[i].visual, front[j].visual), `${front[i].id}/${front[j].id}: visible overlap`);
        assert(!overlap(front[i].touch, front[j].touch), `${front[i].id}/${front[j].id}: touch overlap`);
    }
    assert(front.length > 0, 'cannot certify an empty completed desk');
    const readability = verifyLabelPlates(data);
    return { taskCount: data.taskCount, front, rear, supports, readability, background: { matrix: bg.matrix, size: bg.size }, pixelsPerDesignPixel: data.width / 750 };
}

function verifyLabelPlates(data) {
    const luminance = color => [color.r, color.g, color.b].map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const plates = data.nodes.filter(n => n.plate);
    assert.equal(new Set(plates.map(n => `${n.owner}/${n.name}`)).size, plates.length, 'rendering duplicates label plates');
    const result = plates.map(plate => {
        const name = plate.name.slice('OfficeLabelBackdrop-'.length);
        const label = data.nodes.find(n => n.parent === plate.parent && n.name === name);
        assert(label?.glyph, `${plate.owner}/${name}: missing visible glyphs`);
        assert(!plate.interactive && !label.interactive, `${plate.owner}/${name}: decorative label intercepts touch`);
        assert(plate.sibling < label.sibling, `${plate.owner}/${name}: plate obscures its text`);
        const box = rect(plate, { width: 1, height: 1, left: 0, right: 1, top: 0, bottom: 1 });
        const glyph = rect(label, label.glyph);
        assert(glyph.left >= box.left && glyph.right <= box.right && glyph.top <= box.top && glyph.bottom >= box.bottom,
            `${plate.owner}/${name}: glyphs overflow the plate`);
        // Test worst-case black AND white underlying pixels for translucent plates.
        const ratios = [0, 255].map(under => {
            const alpha = plate.fill.a / 255;
            const backdrop = { r: plate.fill.r * alpha + under * (1 - alpha), g: plate.fill.g * alpha + under * (1 - alpha), b: plate.fill.b * alpha + under * (1 - alpha) };
            const a = luminance(label.color), b = luminance(backdrop);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
        const contrast = Math.min(...ratios);
        assert(contrast >= 7, `${plate.owner}/${name}: insufficient label/backplate contrast`);
        const minimum = name === 'VisualCode' ? 18 : name === 'VisualBadge' && /report-page/.test(plate.owner) ? 24 : 22;
        assert(label.actualFontSize >= minimum - 0.1, `${plate.owner}/${name}: text silently shrunk`);
        if (name === 'ZoneLabel' && data.nodes.find(n => n.name === plate.parent).local.y < 0) {
            const art = data.nodes.find(n => n.parent === plate.parent && n.name === 'OfficeThemeArtwork');
            const body = rect(art, source(art.sprite).alpha);
            assert(box.bottom > body.top, 'bottom tray title must be separate from its rim');
        }
        return { owner: plate.owner, name, fontSize: label.actualFontSize, contrast, bounds: box };
    });
    return result;
}
module.exports = { measureLevel, verifyLabelPlates };
