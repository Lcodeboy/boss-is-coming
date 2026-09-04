import { GameState, GameStateMachine } from '../assets/scripts/core/GameStateMachine';
import { InspectionSequence } from '../assets/scripts/core/InspectionSequence';
import { calculateFixedWidthViewport } from '../assets/scripts/core/ViewportLayout';

interface RoundResult {
    readonly inspectedIndexes: readonly number[];
    readonly settlementCount: number;
    readonly finalState: GameState;
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function runRound(
    machine: GameStateMachine,
    sequence: InspectionSequence,
    taskResults: readonly boolean[],
): RoundResult {
    assert(machine.transition(GameState.PLAYING), 'READY 应进入 PLAYING');
    const allCompleted = taskResults.every((passed) => passed);
    if (allCompleted) {
        assert(machine.transition(GameState.PREPARED), '全部任务完成后应进入 PREPARED');
    }
    assert(machine.transition(GameState.INSPECTING), 'PLAYING 应进入 INSPECTING');

    const inspectedIndexes: number[] = [];
    let settlementCount = 0;
    let event = sequence.start(taskResults.length);
    while (event.kind !== 'idle') {
        if (event.kind === 'step') {
            inspectedIndexes.push(event.index);
            assert(machine.state === GameState.INSPECTING, '检查项未完成前不得结算');
            event = sequence.advance();
        } else {
            settlementCount += 1;
            assert(machine.transition(allCompleted ? GameState.SUCCESS : GameState.FAILURE), '检查完成后应进入结算状态');
            event = sequence.advance();
        }
    }

    const finalState = machine.state;
    assert(machine.transition(GameState.READY), '结算后应能重新挑战');
    return { inspectedIndexes, settlementCount, finalState };
}

const requiredCases: readonly (readonly boolean[])[] = [
    [true, false, false, false],
    [false, true, true, true],
    [true, true, true, false],
    [true, true, true, true],
];

for (const taskResults of requiredCases) {
    const result = runRound(new GameStateMachine(), new InspectionSequence(), taskResults);
    assert(result.inspectedIndexes.join(',') === '0,1,2,3', '每轮必须依次检查四项');
    assert(result.settlementCount === 1, '每轮只能结算一次');
    assert(
        result.finalState === (taskResults.every(Boolean) ? GameState.SUCCESS : GameState.FAILURE),
        '结算状态必须匹配任务汇总',
    );
}

const retryMachine = new GameStateMachine();
const retrySequence = new InspectionSequence();
for (const taskResults of [
    [true, true, true, true],
    [true, false, false, false],
    [true, true, true, true],
] as const) {
    const result = runRound(retryMachine, retrySequence, taskResults);
    assert(result.inspectedIndexes.length === 4, '连续重试时每轮都必须检查四项');
    assert(result.settlementCount === 1, '连续重试时每轮只能结算一次');
}

const ratios = [
    { name: '750x1334', width: 750, height: 1334, expectedHeight: 1334 },
    { name: '9:16', width: 9, height: 16, expectedHeight: 1334 },
    { name: '19.5:9', width: 9, height: 19.5, expectedHeight: 1625 },
    { name: '20:9', width: 9, height: 20, expectedHeight: 5000 / 3 },
] as const;

for (const ratio of ratios) {
    const viewport = calculateFixedWidthViewport(ratio.width, ratio.height, 750, 1334);
    assert(Math.abs(viewport.height - ratio.expectedHeight) < 0.01, `${ratio.name} 可视高度不正确`);
    assert(viewport.height >= 1334, `${ratio.name} 背景必须覆盖安全设计区`);
}

console.log('PASS: inspection failure paths, single settlement, three retries, fixed-width portrait ratios');
