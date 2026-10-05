import type { LevelConfig } from '../data/LevelTypes';
import { OfficeDeskItem, OfficeThemeLevelLayout, OfficeTabletopConfig, unionOfficeBounds } from './OfficeTheme';

export const OFFICE_LAYOUT_RESOURCE = 'office/intern-office-layouts';

export interface OfficeLayoutCatalog {
    readonly version: 1;
    /** Stable content identity, also emitted by package acceptance checks. */
    readonly fingerprint: string;
    readonly levels: Readonly<Record<string, OfficeThemeLevelLayout>>;
}

type RecordData = Record<string, unknown>;
function entries<T>(value: Record<string, T>): [string, T][] { return Object.keys(value).map(k => [k, value[k]]); }
function record(value: unknown, path: string): RecordData {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new Error(`${path}: expected object`); }
    return value as RecordData;
}
function keys(value: RecordData, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(value)) {
        if (allowed.indexOf(key) < 0) { throw new Error(`${path}.${key}: unknown field`); }
    }
}
function number(value: unknown, path: string, min = -Infinity, max = Infinity): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) { throw new Error(`${path}: invalid number`); }
    return value;
}
function name(value: unknown, path: string): string {
    if (typeof value !== 'string' || !/^[a-zA-Z][\w-]*$/.test(value) || ['__proto__', 'constructor', 'prototype'].indexOf(value) >= 0) {
        throw new Error(`${path}: invalid identifier`);
    }
    return value;
}
function fingerprint(raw: unknown): string {
    const stable = (v: unknown): unknown => {
        if (Array.isArray(v)) { return v.map(stable); }
        if (v === null || typeof v !== 'object') { return v; }
        const result: RecordData = {};
        for (const k of Object.keys(v).sort()) { result[k] = stable((v as RecordData)[k]); }
        return result;
    };
    const text = JSON.stringify(stable(raw));
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) { hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); }
    return `layout-v1-${('00000000' + (hash >>> 0).toString(16)).slice(-8)}`;
}

/** Parse one resource table; no per-level branching, Node APIs or gameplay mutation. */
export function parseOfficeLayoutCatalog(raw: unknown): OfficeLayoutCatalog {
    const root = record(raw, 'officeLayout');
    keys(root, ['version', 'templates', 'levels'], 'officeLayout');
    if (root.version !== 1) { throw new Error('officeLayout.version: expected 1'); }
    const templates = record(root.templates, 'templates');
    const resolved = new Map<string, { surface: Omit<OfficeTabletopConfig, 'columns'>; arrangements: Record<string, Record<string, number>> }>();
    for (const [id, rawTemplate] of entries(templates)) {
        name(id, 'template');
        const t = record(rawTemplate, id);
        keys(t, ['surface', 'arrangements'], id);
        const s = record(t.surface, `${id}.surface`);
        keys(s, ['sourceWidth', 'sourceHeight', 'backProfile', 'frontPixel', 'gap', 'supportGap', 'maximumBackgroundZoom'], `${id}.surface`);
        const width = number(s.sourceWidth, 'sourceWidth', 1);
        const height = number(s.sourceHeight, 'sourceHeight', 1);
        const frontPixel = number(s.frontPixel, 'frontPixel', 1, height);
        if (!Array.isArray(s.backProfile) || s.backProfile.length < 2) { throw new Error(`${id}.backProfile: missing wood boundary`); }
        const backProfile = s.backProfile.map((p: unknown, i: number) => {
            const point = record(p, `${id}.backProfile[${i}]`);
            keys(point, ['x', 'y'], 'backProfile');
            return { x: number(point.x, 'x', 0, width), y: number(point.y, 'y', 0, frontPixel) };
        });
        if (backProfile[0].x !== 0 || backProfile[backProfile.length - 1].x !== width
            || backProfile.some((p, i) => i > 0 && p.x <= backProfile[i - 1].x)) { throw new Error(`${id}.backProfile: must span the image in ascending X order`); }
        const arrangements: Record<string, Record<string, number>> = {};
        for (const [arrangement, slotsRaw] of entries(record(t.arrangements, `${id}.arrangements`))) {
            name(arrangement, 'arrangement');
            const slots: Record<string, number> = {};
            for (const [slot, x] of entries(record(slotsRaw, arrangement))) {
                slots[name(slot, 'slot')] = number(x, `${arrangement}.${slot}`);
            }
            if (!Object.keys(slots).length || new Set(Object.keys(slots).map(k => slots[k])).size !== Object.keys(slots).length) { throw new Error(`${arrangement}: empty or duplicate columns`); }
            arrangements[arrangement] = slots;
        }
        resolved.set(id, { surface: { sourceWidth: width, sourceHeight: height, backProfile, frontPixel,
            gap: number(s.gap, 'gap', 1), supportGap: number(s.supportGap, 'supportGap', 1),
            maximumBackgroundZoom: number(s.maximumBackgroundZoom, 'maximumBackgroundZoom', 1, 1.15) }, arrangements });
    }
    const levels: Record<string, OfficeThemeLevelLayout> = {};
    for (const [id, rawLevel] of entries(record(root.levels, 'levels'))) {
        name(id, 'level');
        const l = record(rawLevel, id);
        keys(l, ['template', 'arrangement', 'items', 'replaces'], id);
        const templateId = name(l.template, `${id}.template`);
        const arrangementId = name(l.arrangement, `${id}.arrangement`);
        const template = resolved.get(templateId);
        const slots = template?.arrangements[arrangementId];
        if (!template || !slots) { throw new Error(`${id}: unknown template/arrangement ${templateId}/${arrangementId}`); }
        const slotNames = Object.keys(slots).sort((a, b) => slots[a] - slots[b]);
        const itemColumns: Record<string, number> = {};
        for (const [itemId, slot] of entries(record(l.items, `${id}.items`))) {
            const column = slotNames.indexOf(name(slot, `${id}.${itemId}`));
            if (column < 0) { throw new Error(`${id}/${itemId}: unknown slot ${String(slot)}`); }
            itemColumns[name(itemId, 'item')] = column;
        }
        const replaces: Record<string, string> = {};
        for (const [next, previous] of entries(record(l.replaces ?? {}, `${id}.replaces`))) {
            replaces[name(next, 'replacement')] = name(previous, 'previous occupant');
        }
        for (const next of Object.keys(replaces)) {
            const previous = replaces[next];
            if (next === previous || replaces[previous] !== undefined || itemColumns[next] === undefined
                || itemColumns[previous] === undefined || itemColumns[next] !== itemColumns[previous]) {
                throw new Error(`${id}/${next}: replacement must share one existing non-replacement slot`);
            }
        }
        const occupants = Object.keys(itemColumns).filter(k => replaces[k] === undefined);
        if (new Set(occupants.map(k => itemColumns[k])).size !== occupants.length
            || new Set(Object.keys(replaces).map(k => replaces[k])).size !== Object.keys(replaces).length) {
            throw new Error(`${id}: reserved slots cannot be shared without a validated replacement`);
        }
        levels[id] = { templateId, arrangementId, itemColumns, replaces,
            tabletop: { ...template.surface, columns: slotNames.map(slot => slots[slot]) } };
    }
    return { version: 1, fingerprint: fingerprint(raw), levels };
}

/** Missing/extra bindings are errors, never a silent fallback to old JSON coordinates. */
export function validateOfficeLevelLayout(level: LevelConfig, layout: OfficeThemeLevelLayout | undefined): asserts layout is OfficeThemeLevelLayout {
    if (!layout) { throw new Error(`${level.id}: missing office layout table entry`); }
    const expected = level.items.filter(i => i.interaction === 'drag').map(i => i.id).sort();
    if (JSON.stringify(expected) !== JSON.stringify(Object.keys(layout.itemColumns).sort())) {
        throw new Error(`${level.id}: layout bindings must include every drag item, including hidden/unlocked/event items: ${expected.join(', ')}`);
    }
    for (const nextId of Object.keys(layout.replaces)) {
        const next = level.items.find(i => i.id === nextId)!;
        const previous = level.items.find(i => i.id === layout.replaces[nextId])!;
        if (next.initiallyVisible || !previous.initiallyVisible || previous.completeZoneOnDrop
            || !previous.actionId || next.unlockWhenActionIds.indexOf(previous.actionId) < 0
            || level.events.some(e => e.activateItemIds.indexOf(nextId) >= 0)) {
            throw new Error(`${level.id}/${nextId}: slot reuse requires a hidden action-unlocked item and a collected, hidden predecessor; timed events must reserve their own slots`);
        }
    }
}

/** Reserve the maximum geometry of mutually exclusive occupants, not two simultaneous objects. */
export function reserveOfficeSlots(layout: OfficeThemeLevelLayout, items: readonly OfficeDeskItem[]): OfficeDeskItem[] {
    return items.filter(item => layout.replaces[item.id] === undefined).map(item => {
        const next = items.find(candidate => layout.replaces[candidate.id] === item.id);
        return next ? { ...item, bounds: unionOfficeBounds(item.bounds, next.bounds), touch: unionOfficeBounds(item.touch, next.touch) } : item;
    });
}
