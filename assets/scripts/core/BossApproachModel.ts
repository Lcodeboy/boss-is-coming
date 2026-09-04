export enum BossStage {
    GARAGE = 'GARAGE',
    ELEVATOR = 'ELEVATOR',
    ARRIVED = 'ARRIVED',
    CORRIDOR = 'CORRIDOR',
    DOOR = 'DOOR',
    INSPECTION = 'INSPECTION',
}

export interface BossApproachSnapshot {
    stage: BossStage;
    stageLabel: string;
    currentFloor: number;
    progress: number;
    warningIntensity: number;
    showDoorShadow: boolean;
    doorHandleProgress: number;
}

/** 第一关采用固定时间轴；复用同一个快照对象，避免刷新时反复分配。 */
export class BossApproachModel {
    private readonly _snapshot: BossApproachSnapshot = {
        stage: BossStage.GARAGE,
        stageLabel: '地下车库 · 正在走向电梯',
        currentFloor: -2,
        progress: 0,
        warningIntensity: 0,
        showDoorShadow: false,
        doorHandleProgress: 0,
    };

    public calculate(totalSeconds: number, remainingSeconds: number, targetFloor: number): BossApproachSnapshot {
        const elapsed = Math.max(0, Math.min(totalSeconds, totalSeconds - remainingSeconds));
        const progress = totalSeconds <= 0 ? 1 : elapsed / totalSeconds;
        const elevatorEnd = totalSeconds - 10;
        const arrivedEnd = totalSeconds - 7.5;
        const corridorEnd = totalSeconds - 3;

        this._snapshot.progress = progress;
        this._snapshot.warningIntensity = remainingSeconds >= 5 ? 0 : 1 - remainingSeconds / 5;
        this._snapshot.showDoorShadow = remainingSeconds <= 3;
        this._snapshot.doorHandleProgress = remainingSeconds >= 3 ? 0 : 1 - remainingSeconds / 3;

        if (elapsed >= totalSeconds) {
            this.setStage(BossStage.INSPECTION, '开门检查', targetFloor);
        } else if (elapsed >= corridorEnd) {
            this.setStage(BossStage.DOOR, '老板已到办公室门口', targetFloor);
        } else if (elapsed >= arrivedEnd) {
            this.setStage(BossStage.CORRIDOR, '老板正在穿过走廊', targetFloor);
        } else if (elapsed >= elevatorEnd) {
            this.setStage(BossStage.ARRIVED, `电梯到达${targetFloor}楼`, targetFloor);
        } else if (elapsed >= 1.5) {
            const elevatorProgress = Math.min(1, (elapsed - 1.5) / Math.max(0.1, elevatorEnd - 1.5));
            const floor = Math.min(targetFloor - 1, Math.floor(-2 + elevatorProgress * (targetFloor + 2)));
            this.setStage(BossStage.ELEVATOR, '电梯上升中', floor);
        } else {
            this.setStage(BossStage.GARAGE, '地下车库 · 正在走向电梯', -2);
        }

        return this._snapshot;
    }

    private setStage(stage: BossStage, label: string, currentFloor: number): void {
        this._snapshot.stage = stage;
        this._snapshot.stageLabel = label;
        this._snapshot.currentFloor = currentFloor;
    }
}
