// 固定用户已选定的C试听波形；正式生成不依赖未提交的artifacts目录。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderSelectedButtonWav } from '../tools/button-voice.mjs';

const expected = renderSelectedButtonWav();
const actual = readFileSync(new URL('../assets/resources/audio/button.wav', import.meta.url));
assert.equal(createHash('sha256').update(expected).digest('hex'),
    'b7817f1b55c451ed6780b70a02d869c442f4461067b8bb77f78414dff91a5c74', '必须保持用户选定的C音色');
assert(actual.equals(expected), '正式按钮资源与选定音色逐字节一致');
assert.equal(actual.readUInt16LE(20), 1, 'PCM格式');
assert.equal(actual.readUInt16LE(22), 1, '单声道');
assert.equal(actual.readUInt32LE(24), 22050, '采样率不变');
assert.equal(actual.readUInt16LE(34), 16, '16-bit');
assert(Math.abs((actual.length - 44) / 2 / 22050 - .165) <= 1 / 22050, '约165ms');
const meta = JSON.parse(readFileSync(new URL('../assets/resources/audio/button.wav.meta', import.meta.url), 'utf8'));
assert.equal(meta.uuid, '5c70de3a-985e-4f14-adb7-46cc16d3f229', '保留原资源UUID');
console.log('PASS: selected C audition fingerprint, production WAV equality, PCM format, duration, original UUID');
