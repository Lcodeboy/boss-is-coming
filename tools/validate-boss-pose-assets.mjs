#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRECTORY = '/Users/zhuxiaofei/myapp/资源图/老板要来了';
const CHARACTER_DIRECTORY = resolve(ROOT, 'assets/resources/characters');
const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1536;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const BOSS_POSE_ASSETS = [
    {
        pose: 'check',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-check-a-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-check.png'),
    },
    {
        pose: 'magnifier',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-magnifier-no-board-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-magnifier.png'),
    },
    {
        pose: 'pass',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-pass-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-pass.png'),
    },
    {
        pose: 'fail',
        source: resolve(SOURCE_DIRECTORY, 'boss-inspector-fail-v1.png'),
        destination: resolve(CHARACTER_DIRECTORY, 'boss-inspector-fail.png'),
    },
];

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function decodeRgbaPng(path) {
    const png = readFileSync(path);
    assert(png.subarray(0, 8).equals(PNG_SIGNATURE), `${path} 不是有效 PNG`);
    let offset = 8;
    let width = 0;
    let height = 0;
    const idat = [];
    while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('ascii', offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length);
        offset += length + 12;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            assert.equal(data[8], 8, `${path} 必须为 8-bit PNG`);
            assert.equal(data[9], 6, `${path} 必须为 RGBA PNG`);
            assert.equal(data[12], 0, `${path} 不得使用交错 PNG`);
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }

    assert.equal(width, EXPECTED_WIDTH, `${path} 宽度必须为 ${EXPECTED_WIDTH}`);
    assert.equal(height, EXPECTED_HEIGHT, `${path} 高度必须为 ${EXPECTED_HEIGHT}`);
    const packed = inflateSync(Buffer.concat(idat));
    const stride = width * 4;
    const pixels = Buffer.alloc(stride * height);
    let sourceOffset = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = packed[sourceOffset];
        sourceOffset += 1;
        for (let x = 0; x < stride; x += 1) {
            const raw = packed[sourceOffset];
            sourceOffset += 1;
            const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
            const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
            const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
            let value = raw;
            if (filter === 1) {
                value += left;
            } else if (filter === 2) {
                value += up;
            } else if (filter === 3) {
                value += Math.floor((left + up) / 2);
            } else if (filter === 4) {
                const prediction = left + up - upperLeft;
                const leftDistance = Math.abs(prediction - left);
                const upDistance = Math.abs(prediction - up);
                const upperLeftDistance = Math.abs(prediction - upperLeft);
                value += leftDistance <= upDistance && leftDistance <= upperLeftDistance
                    ? left
                    : upDistance <= upperLeftDistance ? up : upperLeft;
            } else {
                assert.equal(filter, 0, `${path} 使用了未知 PNG 过滤器 ${filter}`);
            }
            pixels[y * stride + x] = value & 255;
        }
    }
    return { width, height, pixels };
}

function alphaAt(image, x, y) {
    return image.pixels[(y * image.width + x) * 4 + 3];
}

function validateImage(path) {
    const image = decodeRgbaPng(path);
    for (const [x, y] of [
        [0, 0],
        [image.width - 1, 0],
        [0, image.height - 1],
        [image.width - 1, image.height - 1],
    ]) {
        assert.equal(alphaAt(image, x, y), 0, `${path} 的四角必须透明`);
    }

    let transparentPixels = 0;
    let visiblePixels = 0;
    let minX = image.width;
    let minY = image.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
            if (alphaAt(image, x, y) === 0) {
                transparentPixels += 1;
                continue;
            }
            visiblePixels += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    assert(transparentPixels > image.width * image.height * 0.25, `${path} 必须包含真实透明背景`);
    assert(visiblePixels > 0, `${path} 不得为空图`);
    assert(minX > 0 && minY > 0 && maxX < image.width - 1 && maxY < image.height - 1, `${path} 中的人物不得触碰或裁出画布`);
    return { hash: sha256(path), bounds: { minX, minY, maxX, maxY }, transparentPixels };
}

const validateDestinations = process.argv.includes('--with-destinations');
for (const asset of BOSS_POSE_ASSETS) {
    const sourceResult = validateImage(asset.source);
    if (validateDestinations) {
        const destinationResult = validateImage(asset.destination);
        assert.equal(destinationResult.hash, sourceResult.hash, `${asset.pose} 正式资源必须与本地源文件逐字节一致`);
    }
    console.log(`${asset.pose}: ${asset.source}`);
    console.log(`  sha256=${sourceResult.hash}`);
    console.log(`  alphaBounds=${Object.values(sourceResult.bounds).join(',')} transparentPixels=${sourceResult.transparentPixels}`);
}
console.log(`PASS: four boss pose PNGs are ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} RGBA with transparent corners and uncropped silhouettes`);
