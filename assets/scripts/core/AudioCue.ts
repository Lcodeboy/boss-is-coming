/** 音效资源名、限频与优先级集中维护；不含背景音乐。 */
export const AUDIO_CUES = {
    button: { interval: 0.08, priority: 1 },
    'item-picked': { interval: 0.09, priority: 1 },
    'target-near': { interval: 0.18, priority: 1 },
    'item-correct': { interval: 0.1, priority: 3 },
    'item-wrong': { interval: 0.15, priority: 3 },
    elevator: { interval: 0.2, priority: 2 },
    message: { interval: 0.2, priority: 3 },
    warning: { interval: 0.75, priority: 4 },
    knock: { interval: 0.3, priority: 5 },
    door: { interval: 0.3, priority: 6 },
    success: { interval: 0.5, priority: 7 },
    failure: { interval: 0.5, priority: 7 },
} as const;

export type AudioCue = keyof typeof AUDIO_CUES;
