# 老板上来了

竖屏单机限时解谜小游戏，当前完成第一阶段：可从启动页连续游玩、检查、结算并重新挑战的第一关“突击检查”。

## 开发环境

- Cocos Creator 3.8.8
- 2D 项目，设计分辨率 750 × 1334
- TypeScript 严格模式
- 无第三方运行时依赖

## 打开与运行

1. 使用 Cocos Creator 3.8.8 打开本目录。
2. 在资源管理器中打开 `assets/scenes/Main.scene`。
3. 点击编辑器顶部的预览按钮。

场景已经连接 `GameFlowController`，无需在编辑器中手工添加节点、组件或属性。界面使用运行时绘制的无版权占位图形，后续可在视图层替换为正式美术。

## 目录

```text
assets/
  scenes/Main.scene                  # 唯一启动场景
  resources/levels/level-001.json   # 第一关数据
  scripts/
    core/                            # 状态、计时、老板进度、任务、音效接口
    data/                            # 关卡类型与加载校验
    game/                            # 流程、工位物品、放置区域
    ui/                              # UI 构建和各独立界面
```

## 关卡扩展约定

新增关卡时优先新增 `assets/resources/levels/*.json`，并复用现有流程。关卡配置负责物品、初始位置、目标区域、任务话术与评价；`GameFlowController` 不包含第一关物品规则。

正式音频接入点为 `AudioFeedback.setPlayer`。当前没有音频资源，也没有空白占位文件。

## 检查

Creator 自带的 TypeScript 编译器可用于静态检查：

```bash
node "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc" --project tsconfig.json --pretty false
```

第一阶段核心回归（逐项检查、单次结算、三轮重试和竖屏比例）：

```bash
node "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc" --project tests/tsconfig.json --pretty false
node temp/core-regressions/tests/core-regressions.js
```

Web Mobile 构建示例：

```bash
"/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project "$PWD" \
  --build "platform=web-mobile;startScene=f23a029a-6115-4e32-b852-c1546586bcaa"
```

## 人工试玩验收

1. 启动后确认显示“老板上来了”、玩法说明和“开始挑战”。
2. 点击“开始挑战”，确认出现第一关说明及四项目标。
3. 点击“马上整理”，观察顶部从地下车库、电梯楼层上升到 18 楼、走廊、门口和开门检查。
4. 点击显示器，确认“娱乐直播”切换为“季度报表”。
5. 故意把游戏机拖到垃圾桶，确认平滑返回且时间不扣减；再拖进抽屉。
6. 把零食袋拖进垃圾桶，把蓝色合同拖进待检查区；确认物品固定且不能再次触发。
7. 在四项提前完成时确认出现“准备完毕”，老板快速完成剩余路程并逐项检查，最终成功。
8. 点击“重新挑战”，故意不处理至少一项并等满 30 秒，确认失败话术与遗漏项目一致。
9. 再重复两轮“重新挑战”，确认节点、倒计时、提示和结算都只出现一次。
10. 分别以 750 × 1334、常见 19.5:9 和 20:9 竖屏预览，确认文字与按钮没有裁切。
