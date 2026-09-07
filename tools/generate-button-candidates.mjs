// 原创按钮音色试制；仅写入 artifacts，不覆盖正式音效，不依赖网络或第三方库。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
    BUTTON_SAMPLE_RATE as rate, BUTTON_PEAK_LIMIT as peakLimit, SELECTED_BUTTON_VOICE,
    renderButtonVoice as render, encodeButtonWav as encodeWav,
} from './button-voice.mjs';

const output = fileURLToPath(new URL('../artifacts/button-audio/', import.meta.url));
const verify = process.argv.includes('--check');

// 模态：[频率Hz、幅度、衰减时间常数秒]。非整数频率比模拟小物件共鸣，不复制录音。
const candidates = [
    {
        id: 'a-soft-mechanical', label: 'A 柔和机械扣', duration: .160,
        attack: .0035, release: .035, cutoff: 1500,
        modes: [[325, .8, .048], [710, .34, .027], [1130, .12, .016]],
        noise: .65, noiseDecay: .011, friction: 0, frictionDecay: .02,
    },
    {
        id: 'b-paper-wood', label: 'B 纸木轻敲', duration: .170,
        attack: .005, release: .045, cutoff: 1250,
        modes: [[265, .7, .040], [585, .48, .030], [1025, .16, .022]],
        noise: .3, noiseDecay: .018, friction: .7, frictionDecay: .046,
    },
    SELECTED_BUTTON_VOICE,
];

function inspect(wav, label) {
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.equal(wav.readUInt32LE(16), 16);
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), rate);
    assert.equal(wav.readUInt32LE(28), rate * 2);
    assert.equal(wav.readUInt16LE(32), 2);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.toString('ascii', 36, 40), 'data');
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    const count = (wav.length - 44) / 2;
    let peak = 0, sum = 0, mean = 0, last = 0, maxDelta = 0, silence = 0, longestSilence = 0;
    for (let index = 0; index < count; index++) {
        const value = wav.readInt16LE(44 + index * 2) / 32768;
        peak = Math.max(peak, Math.abs(value));
        sum += value * value; mean += value;
        maxDelta = Math.max(maxDelta, Math.abs(value - last)); last = value;
        silence = Math.abs(value) < .0001 ? silence + 1 : 0;
        longestSilence = Math.max(longestSilence, silence);
    }
    assert(peak <= peakLimit && peak > .1, `${label}: 峰值过高或过低`);
    assert(maxDelta < .10 && Math.abs(mean / count) < .002, `${label}: 采样跳变/DC偏置异常`);
    assert.equal(wav.readInt16LE(44), 0, '起点平滑'); assert.equal(last, 0, '终点平滑');
    return { label, seconds: count / rate, peak, rms: Math.sqrt(sum / count), silenceMs: longestSilence / rate * 1000, maxDelta };
}

// 连播仅供比较：A三次→B三次→C三次。停顿是试听间隔，不是单个音效内的静音。
function comparison(clips) {
    const pieces = [];
    for (const [index, clip] of clips.entries()) {
        if (index > 0) { pieces.push(new Int16Array(Math.round(.85 * rate))); }
        for (let repeat = 0; repeat < 3; repeat++) {
            if (repeat > 0) { pieces.push(new Int16Array(Math.round(.4 * rate))); }
            pieces.push(clip);
        }
    }
    const samples = new Int16Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
    let offset = 0;
    for (const piece of pieces) { samples.set(piece, offset); offset += piece.length; }
    return samples;
}

function saveOrVerify(name, bytes) {
    const path = join(output, `${name}.wav`);
    if (verify) { assert(readFileSync(path).equals(bytes), `${name}: 资源与生成参数不一致`); }
    else { writeFileSync(path, bytes); }
}

if (!verify) { mkdirSync(output, { recursive: true }); }
const clips = candidates.map(render);
const signatures = new Set();
const reports = candidates.map((preset, index) => {
    const wav = encodeWav(clips[index]);
    assert(wav.equals(encodeWav(render(preset))), '相同参数必须逐字节复现');
    signatures.add(createHash('sha256').update(wav).digest('hex'));
    const report = inspect(wav, preset.label);
    assert(Math.abs(report.seconds - preset.duration) <= 1 / rate, '时长符合配置');
    assert(report.silenceMs < 35, '单个音效无长静音');
    saveOrVerify(preset.id, wav);
    return report;
});
assert.equal(signatures.size, 3, '三种候选必须不同');
const levels = reports.map((report) => report.rms);
assert(20 * Math.log10(Math.max(...levels) / Math.min(...levels)) < .5, '三种平均响度差不超过0.5dB');
const preview = encodeWav(comparison(clips));
inspect(preview, 'ABC 连播');
saveOrVerify('abc-comparison', preview);
console.table(reports.map((report) => Object.fromEntries(Object.entries(report)
    .map(([key, value]) => [key, typeof value === 'number' ? +value.toFixed(4) : value]))));
console.log('PASS: 3 original candidates, matched RMS, deterministic PCM, safe peaks/endpoints, ABC comparison');
