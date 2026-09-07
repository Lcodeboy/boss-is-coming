// 无文件读写的原创按钮合成器；正式资源与候选试听共用同一参数和采样过程。
export const BUTTON_SAMPLE_RATE = 22050;
export const BUTTON_PEAK_LIMIT = .30;
const targetRms = .050;

export const SELECTED_BUTTON_VOICE = {
    id: 'c-rounded-electronic', label: 'C 圆润电子轻点', duration: .165,
    attack: .010, release: .050, cutoff: 1100,
    modes: [[415, 1, .065], [622.5, .09, .045], [830, .02, .030]],
    noise: 0, noiseDecay: .02, friction: 0, frictionDecay: .02,
};

export function renderButtonVoice(preset) {
    const rate = BUTTON_SAMPLE_RATE;
    const samples = new Float64Array(Math.round(preset.duration * rate));
    const alpha = 1 - Math.exp(-2 * Math.PI * preset.cutoff / rate);
    let seed = 0x18b055;
    let low = 0, smooth = 0, previousLow = 0;
    for (let index = 0; index < samples.length; index++) {
        const t = index / rate;
        const remaining = (samples.length - 1 - index) / rate;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        low += alpha * (seed / 0xffffffff * 2 - 1 - low);
        // 两级低通限制噪声的尖锐边缘，纸感来自宽带摩擦而非额外电子音。
        smooth += alpha * (low - smooth);
        const friction = smooth - previousLow;
        previousLow += .065 * (smooth - previousLow);
        let value = preset.noise * smooth * Math.exp(-t / preset.noiseDecay)
            + preset.friction * friction * Math.exp(-t / preset.frictionDecay);
        for (const [frequency, amplitude, decay] of preset.modes) {
            value += amplitude * Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay);
        }
        const envelope = Math.sin(Math.PI / 2 * Math.min(1, t / preset.attack)) ** 2
            * Math.sin(Math.PI / 2 * Math.min(1, remaining / preset.release)) ** 2;
        samples[index] = value * envelope;
    }
    const peak = samples.reduce((largest, sample) => Math.max(largest, Math.abs(sample)), 0);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    const gain = Math.min(BUTTON_PEAK_LIMIT / peak, targetRms / rms);
    return Int16Array.from(samples, (sample) => Math.round(sample * gain * 32767));
}

export function encodeButtonWav(samples) {
    const rate = BUTTON_SAMPLE_RATE;
    const wav = Buffer.alloc(44 + samples.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2));
    return wav;
}

export function renderSelectedButtonWav() {
    return encodeButtonWav(renderButtonVoice(SELECTED_BUTTON_VOICE));
}
