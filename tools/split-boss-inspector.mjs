#!/usr/bin/env node
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'assets/resources/characters/boss-inspector.png');
const HEAD = resolve(ROOT, 'assets/resources/characters/boss-inspector-head.png');
const BODY = resolve(ROOT, 'assets/resources/characters/boss-inspector-body.png');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
});
function crc32(data) {
    let crc = 0xffffffff;
    for (const value of data) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const name = Buffer.from(type);
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length, 0); name.copy(output, 4); data.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
    return output;
}
function decode(path) {
    const png = readFileSync(path); assert(png.subarray(0, 8).equals(PNG_SIGNATURE), `${path} 不是PNG`);
    let offset = 8, width = 0, height = 0; const idat = [];
    while (offset < png.length) {
        const length = png.readUInt32BE(offset); const type = png.toString('ascii', offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length); offset += length + 12;
        if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 6); assert.equal(data[12], 0); }
        if (type === 'IDAT') idat.push(data);
        if (type === 'IEND') break;
    }
    const packed = inflateSync(Buffer.concat(idat)); const stride = width * 4; const pixels = Buffer.alloc(stride * height);
    let sourceOffset = 0;
    for (let y = 0; y < height; y++) {
        const filter = packed[sourceOffset++];
        for (let x = 0; x < stride; x++) {
            const raw = packed[sourceOffset++]; const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
            const up = y ? pixels[(y - 1) * stride + x] : 0; const upperLeft = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
            let value = raw;
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += Math.floor((left + up) / 2);
            else if (filter === 4) { const p = left + up - upperLeft; const pa = Math.abs(p-left), pb = Math.abs(p-up), pc = Math.abs(p-upperLeft); value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft; }
            else assert.equal(filter, 0, `未知PNG过滤器 ${filter}`);
            pixels[y * stride + x] = value & 255;
        }
    }
    return { width, height, pixels };
}
function encode(path, image) {
    const stride = image.width * 4; const scanlines = Buffer.alloc((stride + 1) * image.height);
    for (let y = 0; y < image.height; y++) image.pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(image.width, 0); ihdr.writeUInt32BE(image.height, 4); ihdr.set([8, 6, 0, 0, 0], 8);
    writeFileSync(path, Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
function belongsToHead(x, y) {
    // 下巴轮廓的确定性抛物线遮罩；完整保留脸、头发、耳朵及下巴黑色外轮廓。
    const jawY = 808 - 0.00068 * (x - 512) * (x - 512);
    return y <= jawY;
}
function split() {
    const original = decode(SOURCE); assert.equal(original.width, 1024); assert.equal(original.height, 1536);
    const headPixels = Buffer.alloc(original.pixels.length); const bodyPixels = Buffer.alloc(original.pixels.length);
    for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
        const index = (y * original.width + x) * 4;
        original.pixels.copy(belongsToHead(x, y) ? headPixels : bodyPixels, index, index, index + 4);
    }
    // 仅在中立头层完全遮住的位置补颈部，旋转时避免透明缺口；颜色取自原图既有肤色。
    for (let y = 770; y <= 820; y++) for (let x = 466; x <= 558; x++) {
        if (!belongsToHead(x, y)) continue;
        const dx = (x - 512) / 46, dy = (y - 795) / 25;
        if (dx * dx + dy * dy > 1) continue;
        const index = (y * original.width + x) * 4;
        if (headPixels[index + 3] !== 255) continue;
        bodyPixels.set([255, 196, 151, 255], index);
    }
    encode(HEAD, { ...original, pixels: headPixels }); encode(BODY, { ...original, pixels: bodyPixels });
}
function verify() {
    const original = decode(SOURCE), head = decode(HEAD), body = decode(BODY); let mismatches = 0;
    for (let i = 0; i < original.pixels.length; i += 4) {
        const alpha = head.pixels[i + 3] / 255; const outAlpha = head.pixels[i + 3] + body.pixels[i + 3] * (1 - alpha);
        for (let channel = 0; channel < 3 && original.pixels[i + 3] > 0; channel++) {
            const value = outAlpha ? (head.pixels[i + channel] * head.pixels[i + 3] + body.pixels[i + channel] * body.pixels[i + 3] * (1-alpha)) / outAlpha : 0;
            if (Math.round(value) !== original.pixels[i + channel]) mismatches++;
        }
        if (Math.round(outAlpha) !== original.pixels[i + 3]) mismatches++;
    }
    assert.equal(mismatches, 0, '中立态分层合成必须逐通道等于原图');
    console.log('PASS: boss head/body neutral composite is pixel-identical to source');
}
if (!process.argv.includes('--check')) split();
verify();
