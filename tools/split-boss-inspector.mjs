#!/usr/bin/env node

import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'assets/resources/characters/boss-inspector.png');
const HEAD = resolve(ROOT, 'assets/resources/characters/boss-inspector-head.png');
const BODY = resolve(ROOT, 'assets/resources/characters/boss-inspector-body.png');
const HEAD_META = `${HEAD}.meta`;
const BODY_META = `${BODY}.meta`;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SOURCE_WIDTH = 1024;
const SOURCE_HEIGHT = 1536;
const JAW_CLEARANCE_PIXELS = 10;
const HEAD_NECK_PIVOT = { x: 512, y: 792 };

const crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
});

function crc32(data) {
    let crc = 0xffffffff;
    for (const value of data) {
        crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const name = Buffer.from(type);
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length, 0);
    name.copy(output, 4);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
    return output;
}

function decode(path) {
    const png = readFileSync(path);
    assert(png.subarray(0, 8).equals(PNG_SIGNATURE), `${path} 不是 PNG`);
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
            assert.equal(data[8], 8, '仅支持 8-bit PNG');
            assert.equal(data[9], 6, '仅支持 RGBA PNG');
            assert.equal(data[12], 0, '不支持交错 PNG');
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }

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
                assert.equal(filter, 0, `未知 PNG 过滤器 ${filter}`);
            }
            pixels[y * stride + x] = value & 255;
        }
    }
    return { width, height, pixels };
}

function encode(path, image) {
    const stride = image.width * 4;
    const scanlines = Buffer.alloc((stride + 1) * image.height);
    for (let y = 0; y < image.height; y += 1) {
        image.pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(image.width, 0);
    ihdr.writeUInt32BE(image.height, 4);
    ihdr.set([8, 6, 0, 0, 0], 8);
    writeFileSync(path, Buffer.concat([
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(scanlines, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]));
}

/**
 * 沿原图下巴外轮廓下缘划分。两侧与身体分离的轮廓额外归入10像素安全带，
 * 中央连接区停在领口和西装上方，避免服装跟随头部旋转。
 * 坐标来自固定的 1024×1536 正式 PNG，不依赖图像识别或生成式处理。
 */
const HEAD_BOUNDARY_POINTS = [
    [0, 600],
    [77, 650],
    [150, 700],
    [250, 740],
    [300, 754],
    [350, 765],
    [400, 780],
    [425, 777],
    [450, 780],
    [475, 783],
    [500, 787],
    [512, 791],
    [525, 797],
    [550, 799],
    [553, 796],
    [575, 795],
    [600, 789],
    [625, 788],
    [650, 776],
    [700, 761],
    [750, 745],
    [850, 690],
    [1023, 600],
];

function headBoundaryY(x) {
    for (let index = 1; index < HEAD_BOUNDARY_POINTS.length; index += 1) {
        const left = HEAD_BOUNDARY_POINTS[index - 1];
        const right = HEAD_BOUNDARY_POINTS[index];
        if (x <= right[0]) {
            const ratio = (x - left[0]) / (right[0] - left[0]);
            return Math.floor(left[1] + (right[1] - left[1]) * ratio);
        }
    }
    return HEAD_BOUNDARY_POINTS[HEAD_BOUNDARY_POINTS.length - 1][1];
}

function jawClearanceDepth(x) {
    // 中央 361..659 是衣领和西装肩部，保持原始归属；两侧才是与身体分离的下巴轮廓。
    return x <= 360 || x >= 660 ? JAW_CLEARANCE_PIXELS : 0;
}

function isJawClearance(x, y) {
    const boundary = headBoundaryY(x);
    return y > boundary && y <= boundary + jawClearanceDepth(x);
}

function belongsToHead(x, y) {
    return y <= headBoundaryY(x) || isJawClearance(x, y);
}

function pixelOffset(image, x, y) {
    return (y * image.width + x) * 4;
}

function alphaAt(image, x, y) {
    return image.pixels[pixelOffset(image, x, y) + 3];
}

function rgbaAt(image, x, y) {
    const offset = pixelOffset(image, x, y);
    return image.pixels.subarray(offset, offset + 4);
}

function alphaBounds(image) {
    let minX = image.width;
    let minY = image.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
            if (alphaAt(image, x, y) === 0) {
                continue;
            }
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }
    assert(maxX >= minX && maxY >= minY, '图层不得为空');
    return { minX, minY, maxX, maxY };
}

function addHiddenNeckUnderlay(original, headPixels, bodyPixels) {
    // 取原图脸部现有肤色；补片只写在完全不透明的头部像素后方，中立合成不会改变。
    const skin = rgbaAt(original, 512, 748);
    assert.equal(skin[3], 255, '颈部补片采样点必须是不透明的原图肤色');
    for (let y = 758; y <= 796; y += 1) {
        for (let x = 468; x <= 556; x += 1) {
            const normalizedX = (x - 512) / 44;
            const normalizedY = (y - 777) / 19;
            if (normalizedX * normalizedX + normalizedY * normalizedY > 1) {
                continue;
            }
            const offset = (y * original.width + x) * 4;
            if (headPixels[offset + 3] !== 255) {
                continue;
            }
            skin.copy(bodyPixels, offset);
        }
    }
}

function updateSpriteFrameMeta(path, image) {
    const metadata = JSON.parse(readFileSync(path, 'utf8'));
    const frame = metadata.subMetas?.f9941?.userData;
    assert(frame, `${path} 缺少 spriteFrame 元数据`);
    const bounds = alphaBounds(image);
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const left = bounds.minX - image.width / 2;
    const right = left + width;
    const bottomUv = image.height - bounds.minY - height;
    const topUv = image.height - bounds.minY;
    Object.assign(frame, {
        trimX: bounds.minX,
        trimY: bounds.minY,
        width,
        height,
        rawWidth: image.width,
        rawHeight: image.height,
        offsetX: bounds.minX + width / 2 - image.width / 2,
        offsetY: image.height / 2 - bounds.minY - height / 2,
        packable: false,
        rotated: false,
        pivotX: 0.5,
        pivotY: 0.5,
        meshType: 0,
        trimType: 'auto',
        vertices: {
            rawPosition: [left, -height / 2, 0, right, -height / 2, 0, left, height / 2, 0, right, height / 2, 0],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [bounds.minX, topUv, bounds.maxX + 1, topUv, bounds.minX, bottomUv, bounds.maxX + 1, bottomUv],
            nuv: [
                bounds.minX / image.width,
                bottomUv / image.height,
                (bounds.maxX + 1) / image.width,
                bottomUv / image.height,
                bounds.minX / image.width,
                topUv / image.height,
                (bounds.maxX + 1) / image.width,
                topUv / image.height,
            ],
            minPos: [left, -height / 2, 0],
            maxPos: [right, height / 2, 0],
        },
    });
    writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

function expectedFrameData(image) {
    const bounds = alphaBounds(image);
    return {
        trimX: bounds.minX,
        trimY: bounds.minY,
        width: bounds.maxX - bounds.minX + 1,
        height: bounds.maxY - bounds.minY + 1,
    };
}

function split() {
    const original = decode(SOURCE);
    assert.equal(original.width, SOURCE_WIDTH);
    assert.equal(original.height, SOURCE_HEIGHT);
    const headPixels = Buffer.alloc(original.pixels.length);
    const bodyPixels = Buffer.alloc(original.pixels.length);
    for (let y = 0; y < original.height; y += 1) {
        for (let x = 0; x < original.width; x += 1) {
            const offset = pixelOffset(original, x, y);
            if (original.pixels[offset + 3] === 0) {
                // 透明像素 RGB 归零，避免头部旋转时线性采样出隐藏底色。
                continue;
            }
            original.pixels.copy(belongsToHead(x, y) ? headPixels : bodyPixels, offset, offset, offset + 4);
        }
    }
    addHiddenNeckUnderlay(original, headPixels, bodyPixels);
    const head = { ...original, pixels: headPixels };
    const body = { ...original, pixels: bodyPixels };
    encode(HEAD, head);
    encode(BODY, body);
    updateSpriteFrameMeta(HEAD_META, head);
    updateSpriteFrameMeta(BODY_META, body);
}

function verifyMetadata(path, image) {
    const metadata = JSON.parse(readFileSync(path, 'utf8'));
    const frame = metadata.subMetas?.f9941?.userData;
    const texture = metadata.subMetas?.['6c48a']?.userData;
    assert.equal(metadata.importer, 'image');
    assert.equal(metadata.userData?.type, 'sprite-frame');
    assert.equal(metadata.userData?.hasAlpha, true);
    assert.equal(typeof metadata.uuid, 'string');
    assert(metadata.uuid.length > 0, `${path} 必须保留稳定 UUID`);
    assert(frame, `${path} 缺少 spriteFrame 元数据`);
    assert(texture, `${path} 缺少 texture 元数据`);
    const expected = expectedFrameData(image);
    assert.deepEqual(
        { trimX: frame.trimX, trimY: frame.trimY, width: frame.width, height: frame.height },
        expected,
        `${path} 的裁边数据必须匹配 PNG alpha 边界`,
    );
    assert.equal(frame.rawWidth, SOURCE_WIDTH);
    assert.equal(frame.rawHeight, SOURCE_HEIGHT);
    assert.equal(frame.packable, false, '分层角色禁止动态图集打包，避免独立层采样接缝');
    assert.equal(frame.rotated, false);
    assert.equal(frame.pivotX, 0.5);
    assert.equal(frame.pivotY, 0.5);
    assert.equal(texture.imageUuidOrDatabaseUri, metadata.uuid);
    assert.equal(frame.imageUuidOrDatabaseUri, `${metadata.uuid}@6c48a`);
    return metadata.uuid;
}

function verify() {
    const original = decode(SOURCE);
    const head = decode(HEAD);
    const body = decode(BODY);
    assert.equal(head.width, original.width);
    assert.equal(head.height, original.height);
    assert.equal(body.width, original.width);
    assert.equal(body.height, original.height);

    let mismatches = 0;
    let opaqueUnderlayPixels = 0;
    let whiteBodyPixelsInHead = 0;
    let bodyPixelsInJawClearance = 0;
    let sourcePixelsMissingFromHeadClearance = 0;
    let transparentRgbPixels = 0;
    const whiteBodyPixelCoordinates = [];
    const underlaySkin = rgbaAt(original, HEAD_NECK_PIVOT.x, 748);
    for (let offset = 0; offset < original.pixels.length; offset += 4) {
        const headAlpha = head.pixels[offset + 3] / 255;
        const outputAlpha = head.pixels[offset + 3] + body.pixels[offset + 3] * (1 - headAlpha);
        for (let channel = 0; channel < 3 && original.pixels[offset + 3] > 0; channel += 1) {
            const output = outputAlpha === 0 ? 0 : (
                head.pixels[offset + channel] * head.pixels[offset + 3]
                + body.pixels[offset + channel] * body.pixels[offset + 3] * (1 - headAlpha)
            ) / outputAlpha;
            if (Math.round(output) !== original.pixels[offset + channel]) {
                mismatches += 1;
            }
        }
        if (Math.round(outputAlpha) !== original.pixels[offset + 3]) {
            mismatches += 1;
        }
        if (head.pixels[offset + 3] === 255 && body.pixels[offset + 3] === 255) {
            opaqueUnderlayPixels += 1;
        }
        const pixelIndex = offset / 4;
        const x = pixelIndex % original.width;
        const y = Math.floor(pixelIndex / original.width);
        if (isJawClearance(x, y)) {
            const isHiddenNeckUnderlay = head.pixels[offset + 3] === 255
                && body.pixels[offset + 3] === 255
                && body.pixels[offset] === underlaySkin[0]
                && body.pixels[offset + 1] === underlaySkin[1]
                && body.pixels[offset + 2] === underlaySkin[2];
            if (body.pixels[offset + 3] > 0 && !isHiddenNeckUnderlay) {
                bodyPixelsInJawClearance += 1;
            }
            if (original.pixels[offset + 3] > 0) {
                for (let channel = 0; channel < 4; channel += 1) {
                    if (head.pixels[offset + channel] !== original.pixels[offset + channel]) {
                        sourcePixelsMissingFromHeadClearance += 1;
                        break;
                    }
                }
            }
        }
        if (
            (head.pixels[offset + 3] === 0 && (head.pixels[offset] !== 0 || head.pixels[offset + 1] !== 0 || head.pixels[offset + 2] !== 0))
            || (body.pixels[offset + 3] === 0 && (body.pixels[offset] !== 0 || body.pixels[offset + 1] !== 0 || body.pixels[offset + 2] !== 0))
        ) {
            transparentRgbPixels += 1;
        }
        if (
            y >= 730
            && head.pixels[offset + 3] > 0
            && head.pixels[offset] > 235
            && head.pixels[offset + 1] > 235
            && head.pixels[offset + 2] > 235
        ) {
            whiteBodyPixelsInHead += 1;
            if (whiteBodyPixelCoordinates.length < 20) {
                whiteBodyPixelCoordinates.push(`${pixelIndex % original.width},${Math.floor(pixelIndex / original.width)}`);
            }
        }
    }
    assert.equal(mismatches, 0, '中立态分层合成必须逐通道等于原图');
    assert.equal(bodyPixelsInJawClearance, 0, '身体层不得保留下巴外扩10像素安全带内的任何可见像素');
    assert.equal(sourcePixelsMissingFromHeadClearance, 0, '下巴安全带内的原图像素必须完整归入头层');
    assert.equal(transparentRgbPixels, 0, '分层透明像素隐藏RGB必须归零，避免旋转采样出现白边或灰边');
    assert(opaqueUnderlayPixels > 1_500, '身体层必须包含被头部完全遮住的颈部连接区域');
    assert.equal(whiteBodyPixelsInHead, 0, `白衬衫和领口不得进入头层：${whiteBodyPixelCoordinates.join(' ')}`);
    assert(alphaAt(head, 150, 450) > 0, '左耳必须位于头层');
    assert(alphaAt(head, 512, 790) > 0, '下巴外轮廓必须位于头层');
    assert.equal(alphaAt(head, 512, 810), 0, '领带和衬衫不得进入头层');
    assert(alphaAt(body, 512, 810) > 0, '领带和衬衫必须位于身体层');
    assert(alphaAt(body, 387, 850) > 0, '检查板和双手必须位于身体层');
    assert(alphaAt(body, 400, 1400) > 0, '双腿和鞋子必须位于身体层');
    const headUuid = verifyMetadata(HEAD_META, head);
    const bodyUuid = verifyMetadata(BODY_META, body);
    assert.notEqual(headUuid, bodyUuid, '头部和身体资源必须使用不同 UUID');
    console.log('PASS: boss layers are semantic, metadata-safe, and pixel-identical at neutral');
}

function reportJawClearance() {
    const original = decode(SOURCE);
    const body = decode(BODY);
    const coordinates = [];
    const transferredCoordinates = [];
    for (let y = 0; y < body.height; y += 1) {
        for (let x = 0; x < body.width; x += 1) {
            if (!isJawClearance(x, y)) {
                continue;
            }
            if (alphaAt(body, x, y) > 0) {
                coordinates.push([x, y, alphaAt(body, x, y)]);
            }
            if (alphaAt(original, x, y) > 0) {
                transferredCoordinates.push([x, y, alphaAt(original, x, y)]);
            }
        }
    }
    const left = coordinates.filter(([x]) => x <= 390);
    const right = coordinates.filter(([x]) => x >= 650);
    const bounds = (values) => values.length === 0 ? 'none' : [
        Math.min(...values.map(([x]) => x)),
        Math.min(...values.map(([, y]) => y)),
        Math.max(...values.map(([x]) => x)),
        Math.max(...values.map(([, y]) => y)),
    ].join(',');
    console.log(`jaw-clearance: left=${left.length} (${bounds(left)}), right=${right.length} (${bounds(right)})`);
    console.log(
        `jaw-transferred-from-source: left=${transferredCoordinates.filter(([x]) => x <= 360).length}, `
        + `right=${transferredCoordinates.filter(([x]) => x >= 660).length}`,
    );
}

function samplePremultiplied(image, sourceX, sourceY) {
    const x0 = Math.floor(sourceX);
    const y0 = Math.floor(sourceY);
    const xRatio = sourceX - x0;
    const yRatio = sourceY - y0;
    const output = [0, 0, 0, 0];
    for (const [x, y, weight] of [
        [x0, y0, (1 - xRatio) * (1 - yRatio)],
        [x0 + 1, y0, xRatio * (1 - yRatio)],
        [x0, y0 + 1, (1 - xRatio) * yRatio],
        [x0 + 1, y0 + 1, xRatio * yRatio],
    ]) {
        if (weight === 0 || x < 0 || x >= image.width || y < 0 || y >= image.height) {
            continue;
        }
        const offset = pixelOffset(image, x, y);
        const alpha = image.pixels[offset + 3] / 255;
        output[0] += image.pixels[offset] * alpha * weight;
        output[1] += image.pixels[offset + 1] * alpha * weight;
        output[2] += image.pixels[offset + 2] * alpha * weight;
        output[3] += alpha * weight;
    }
    return output;
}

function posePixel(head, body, x, y, angle) {
    const radians = angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const deltaX = x - HEAD_NECK_PIVOT.x;
    const deltaY = y - HEAD_NECK_PIVOT.y;
    const sourceX = HEAD_NECK_PIVOT.x + cosine * deltaX + sine * deltaY;
    const sourceY = HEAD_NECK_PIVOT.y - sine * deltaX + cosine * deltaY;
    const top = samplePremultiplied(head, sourceX, sourceY);
    const bodyOffset = pixelOffset(body, x, y);
    const bodyAlpha = body.pixels[bodyOffset + 3] / 255;
    const inverseTopAlpha = 1 - top[3];
    const outputAlpha = top[3] + bodyAlpha * inverseTopAlpha;
    const premultiplied = [
        top[0] + body.pixels[bodyOffset] * bodyAlpha * inverseTopAlpha,
        top[1] + body.pixels[bodyOffset + 1] * bodyAlpha * inverseTopAlpha,
        top[2] + body.pixels[bodyOffset + 2] * bodyAlpha * inverseTopAlpha,
    ];
    return [
        outputAlpha === 0 ? 0 : Math.round(premultiplied[0] / outputAlpha),
        outputAlpha === 0 ? 0 : Math.round(premultiplied[1] / outputAlpha),
        outputAlpha === 0 ? 0 : Math.round(premultiplied[2] / outputAlpha),
        Math.round(outputAlpha * 255),
    ];
}

function renderPose(head, body, angle) {
    const pixels = Buffer.alloc(head.pixels.length);
    for (let y = 0; y < head.height; y += 1) {
        for (let x = 0; x < head.width; x += 1) {
            const offset = pixelOffset(head, x, y);
            const value = posePixel(head, body, x, y, angle);
            pixels.set(value, offset);
        }
    }
    return { width: head.width, height: head.height, pixels };
}

function flattenPose(pose, background) {
    const pixels = Buffer.alloc(pose.pixels.length);
    for (let offset = 0; offset < pose.pixels.length; offset += 4) {
        const alpha = pose.pixels[offset + 3] / 255;
        for (let channel = 0; channel < 3; channel += 1) {
            pixels[offset + channel] = Math.round(
                pose.pixels[offset + channel] * alpha + background[channel] * (1 - alpha),
            );
        }
        pixels[offset + 3] = 255;
    }
    return { ...pose, pixels };
}

function copyCrop(source, destination, crop, destinationX, destinationY) {
    for (let y = 0; y < crop.height; y += 1) {
        const sourceOffset = pixelOffset(source, crop.x, crop.y + y);
        const destinationOffset = pixelOffset(destination, destinationX, destinationY + y);
        source.pixels.copy(
            destination.pixels,
            destinationOffset,
            sourceOffset,
            sourceOffset + crop.width * 4,
        );
    }
}

function generateAcceptancePreviews(outputDirectory) {
    const head = decode(HEAD);
    const body = decode(BODY);
    const angles = [-8, 0, 8];
    const backgrounds = [
        { name: 'white', color: [255, 255, 255] },
        { name: 'dark', color: [24, 30, 38] },
        { name: 'bright', color: [0, 224, 255] },
    ];
    const crop = { x: 240, y: 660, width: 544, height: 180 };
    const contactSheet = {
        width: crop.width * backgrounds.length,
        height: crop.height * angles.length,
        pixels: Buffer.alloc(crop.width * backgrounds.length * crop.height * angles.length * 4),
    };
    mkdirSync(outputDirectory, { recursive: true });
    for (let angleIndex = 0; angleIndex < angles.length; angleIndex += 1) {
        const angle = angles[angleIndex];
        const pose = renderPose(head, body, angle);
        for (let backgroundIndex = 0; backgroundIndex < backgrounds.length; backgroundIndex += 1) {
            const background = backgrounds[backgroundIndex];
            const flattened = flattenPose(pose, background.color);
            const angleName = angle < 0 ? `minus-${Math.abs(angle)}` : angle > 0 ? `plus-${angle}` : 'zero';
            encode(join(outputDirectory, `boss-${angleName}-${background.name}.png`), flattened);
            copyCrop(
                flattened,
                contactSheet,
                crop,
                backgroundIndex * crop.width,
                angleIndex * crop.height,
            );
        }
    }
    encode(join(outputDirectory, 'boss-angle-contact-sheet.png'), contactSheet);
    console.log(`PASS: acceptance previews written to ${outputDirectory}`);
}

function verifyExtremeAngles() {
    const head = decode(HEAD);
    const body = decode(BODY);
    for (const angle of [-8, 8]) {
        let minimumConnectorAlpha = 255;
        for (let y = 774; y <= 790; y += 1) {
            for (let x = 500; x <= 524; x += 1) {
                minimumConnectorAlpha = Math.min(
                    minimumConnectorAlpha,
                    posePixel(head, body, x, y, angle)[3],
                );
            }
        }
        assert.equal(minimumConnectorAlpha, 255, `${angle}°极限姿态的颈部连接区不得出现透明缺口`);
    }
    console.log('PASS: -8°/+8° poses have a covered neck seam and no duplicated body-layer jaw contour');
}

if (!process.argv.includes('--check')) {
    split();
}
if (process.argv.includes('--diagnose')) {
    reportJawClearance();
}
verify();
verifyExtremeAngles();
const previewArgumentIndex = process.argv.indexOf('--preview-dir');
if (previewArgumentIndex >= 0) {
    const outputDirectory = process.argv[previewArgumentIndex + 1];
    assert(outputDirectory, '--preview-dir 必须提供输出目录');
    generateAcceptancePreviews(resolve(outputDirectory));
}
