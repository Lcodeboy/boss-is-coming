// 原创合成参数。无网络素材；固定种子、采样率与包络使每次生成逐字节一致。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const output = fileURLToPath(new URL('../assets/resources/audio/', import.meta.url));
const rate = 22050;
// 每个音符：[起始秒、时长秒、起始 Hz、结束 Hz、相对音量、噪声混合比例]。
export const cues = {
    button: [[0, .075, 620, 410, 1, .04]],
    'item-picked': [[0, .105, 340, 590, 1, 0]],
    'target-near': [[0, .115, 780, 850, 1, 0]],
    'item-correct': [[0, .13, 523, 523, .85, 0], [.105, .17, 784, 784, 1, 0]],
    'item-wrong': [[0, .17, 280, 170, 1, .06]],
    elevator: [[0, .22, 660, 660, 1, 0], [.14, .24, 880, 880, .7, 0]],
    message: [[0, .10, 587, 587, 1, 0], [.12, .13, 740, 740, .9, 0]],
    warning: [[0, .10, 540, 460, 1, .02]],
    knock: [[0, .075, 150, 85, 1, .35], [.13, .075, 150, 85, .9, .35]],
    door: [[0, .09, 250, 180, .8, .35], [.065, .32, 160, 105, 1, .18]],
    success: [[0, .17, 523, 523, .9, 0], [.14, .17, 659, 659, .9, 0], [.28, .25, 784, 784, 1, 0]],
    failure: [[0, .20, 392, 330, .9, 0], [.17, .27, 294, 220, 1, 0]],
};

function render(notes) {
    const duration = Math.max(...notes.map(([start, length]) => start + length));
    const samples = new Float64Array(Math.ceil(duration * rate));
    let seed = 0x18b055;
    let filteredNoise = 0;
    for (const [start, length, from, to, gain, noise] of notes) {
        for (let n = 0; n < Math.floor(length * rate); n++) {
            const t = n / rate;
            const phase = 2 * Math.PI * (from * t + (to - from) * t * t / (2 * length));
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            filteredNoise = .72 * filteredNoise + .28 * (seed / 0xffffffff * 2 - 1);
            // 两端至少 8ms 平滑包络，避免截断波形产生爆音。
            const envelope = Math.sin(Math.PI / 2 * Math.min(1, t / .008)) ** 2
                * Math.sin(Math.PI / 2 * Math.min(1, (length - t) / .025)) ** 2
                * Math.exp(-2 * t / length);
            const tone = .88 * Math.sin(phase) + .12 * Math.sin(phase * 2);
            const index = Math.floor(start * rate) + n;
            samples[index] += gain * envelope * (tone * (1 - noise) + filteredNoise * noise);
        }
    }
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const gain = Math.min(.34 / peak, .105 / rms);
    const wav = Buffer.alloc(44 + samples.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((value, index) => wav.writeInt16LE(Math.round(value * gain * 32767), 44 + index * 2));
    return wav;
}

function check(wav, name) {
    if (wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt16LE(34) !== 16 || wav.readUInt32LE(24) !== rate) {
        throw new Error(`${name}: PCM 格式错误`);
    }
    const count = (wav.length - 44) / 2;
    let peak = 0, sum = 0, longestSilence = 0, silence = 0, maxDelta = 0, previous = 0;
    for (let n = 0; n < count; n++) {
        const value = wav.readInt16LE(44 + n * 2) / 32768;
        peak = Math.max(peak, Math.abs(value)); sum += value * value;
        maxDelta = Math.max(maxDelta, Math.abs(value - previous)); previous = value;
        silence = Math.abs(value) < .0001 ? silence + 1 : 0;
        longestSilence = Math.max(longestSilence, silence);
    }
    if (peak >= .35 || count / rate > .8 || longestSilence / rate > .08 || maxDelta > .15 || Math.abs(previous) > .001) {
        throw new Error(`${name}: 峰值/时长/静音/相邻采样跳变检查失败`);
    }
    return { cue: name, seconds: +(count / rate).toFixed(3), peak: +peak.toFixed(4), rms: +Math.sqrt(sum / count).toFixed(4), silenceMs: +(longestSilence / rate * 1000).toFixed(1), maxDelta: +maxDelta.toFixed(4) };
}

function meta(file, importer, ver) {
    const path = `${file}.meta`;
    if (existsSync(path)) { return; }
    const hash = createHash('sha256').update(`boss-feedback-v1:${file.split('/').pop()}`).digest('hex');
    const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    writeFileSync(path, JSON.stringify({ ver, importer, imported: true, uuid, files: importer === 'audio-clip' ? ['.json', '.wav'] : [], subMetas: {}, userData: {} }, null, 2) + '\n');
}

const verify = process.argv.includes('--check');
if (!verify) { mkdirSync(output, { recursive: true }); meta(output.slice(0, -1), 'directory', '1.2.0'); }
const report = [];
for (const [name, notes] of Object.entries(cues)) {
    const expected = render(notes);
    const path = join(output, `${name}.wav`);
    if (verify) {
        if (!readFileSync(path).equals(expected)) { throw new Error(`${name}: 音频与确定性生成参数不一致`); }
    } else { writeFileSync(path, expected); meta(path, 'audio-clip', '1.0.0'); }
    report.push(check(expected, name));
}
console.table(report);
console.log(`PASS: ${report.length} original mono 16-bit PCM WAV / ${rate}Hz / deterministic bytes / no clipping`);
