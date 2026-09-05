# 老板上来了

竖屏单机限时解谜小游戏。当前已完成第二阶段：五关连续游玩、关卡选择与本地进度、组合任务和定时事件。

## 开发环境

- Cocos Creator 3.8.8
- 2D 项目，设计分辨率 750 × 1334
- `FIXED_WIDTH` 竖屏适配，顶部、任务、工位和底部提示按实际安全区纵向重排
- TypeScript 严格模式
- 无第三方运行时依赖

## 打开与运行

1. 使用 Cocos Creator 3.8.8 打开本目录。
2. 在资源管理器中打开 `assets/scenes/Main.scene`。
3. 点击编辑器顶部的预览按钮。

场景已连接 `GameFlowController`，无需手工添加节点、组件或属性。界面使用程序绘制的无版权占位图形，后续可在视图层替换为正式美术。

## 五关内容

| 关卡 | 时长 | 核心变化 |
| --- | ---: | --- |
| 1. 突击检查 | 30 秒 | 点击电脑、拖放游戏机/零食/蓝色合同；首次进入有不计时教学 |
| 2. 文件别拿错 | 28 秒 | 从蓝、红、黄文件中选出配置指定的蓝色文件 |
| 3. 报告还没装订 | 32 秒 | 三张页面收集后生成装订报告，再提交到待检查区 |
| 4. 同事来添乱 | 30 秒 | 剩余 16 秒时一次性加入咖啡物品和处理任务 |
| 5. 临时加任务 | 26 秒 | 电脑需点击两次、相似合同判断，剩余 18 秒动态加入访客证任务 |

## 目录与扩展约定

```text
assets/
  scenes/Main.scene
  resources/levels/level-001.json ... level-005.json
  scripts/
    core/    # 状态、倒计时、关卡会话、任务、进度存储
    data/    # 关卡类型、JSON 解析、跨引用校验与加载
    game/    # 流程、工位物品、放置区域
    ui/      # UI 构建、关卡选择、教学、检查与结算
tests/      # 可重复执行的纯 TypeScript 回归
```

关卡 JSON 负责物品、动作、任务组合、前置动作、目标区域、定时事件、通知和检查话术；主流程不根据关卡 ID 分支。正式音频接入点为 `AudioFeedback.setPlayer`，当前没有空白音频文件。

## 进度存储

通过 Cocos `sys.localStorage` 注入 `ProgressService`，不依赖浏览器 DOM。键名为 `boss-is-coming.progress`，数据结构：

```json
{
  "version": 1,
  "highestUnlockedLevel": 1,
  "tutorialSeen": false
}
```

数据缺失时使用默认进度；JSON 损坏、版本不匹配或字段越界时，安全恢复为仅解锁第 1 关、未看教学。

## 静态检查与回归

```bash
node "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc" --project tsconfig.json --pretty false
node "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc" --project tests/tsconfig.json --pretty false
node temp/core-regressions/tests/core-regressions.js
node temp/core-regressions/tests/stage2-regressions.js
```

## 构建

Web Mobile：

```bash
"/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project "$PWD" \
  --build "platform=web-mobile;startScene=f23a029a-6115-4e32-b852-c1546586bcaa"
```

抖音小游戏：

```bash
"/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project "$PWD" \
  --build "platform=bytedance-mini-game;startScene=f23a029a-6115-4e32-b852-c1546586bcaa"
```

## Creator 人工验收

1. 首次启动点击“开始挑战”，确认关卡选择仅第 1 关可用。
2. 进入第 1 关，点击“马上整理”后确认先出现教学，倒计时未启动；点击“我知道了”才开始。
3. 通过第 1 关，确认结算显示“下一关/重新挑战/返回关卡”，且第 2 关解锁。
4. 第 2 关把红色或黄色文件拖到待检查区，确认返回原位并提示“老板要的不是这份”；蓝色文件可完成任务。
5. 第 3 关仅放入两页时确认不出现装订报告；放入第三页后再将装订报告拖入待检查区。
6. 第 4 关提前完成三项初始任务，确认不会提前结束；剩余 16 秒时咖啡及任务各出现一次。
7. 第 5 关确认电脑第一次点击只到“公司邮箱”，第二次到“工作报表”；旧版合同无效；剩余 18 秒时访客证及任务各出现一次。
8. 任意关失败后确认不解锁下一关；检查项逐一播放后才进入结算。
9. 从结算页连续执行成功、失败、成功三轮重试，确认任务、物品、倒计时、通知和结算每轮只有一份。
10. 分别以 750 × 1334、360 × 640、360 × 780 和 360 × 800 竖屏预览；重点确认工位标题紧随任务面板、桌面紧随标题、收纳目标靠近工位底部，额外高度显示为桌面纵深/办公室地面，底部提示处于安全区上方，文字与按钮不裁切。
11. 在 360 × 780 和 360 × 800 下进入第 1 关，确认右上角仅显示小型灰色“退出”按钮；依次拖放游戏机、零食袋和蓝色合同，确认跨顶部/底部内容层的命中与吸附位置正确，错误拖放仍返回原位。

## 抖音手机复测

1. Creator 构建面板选择“抖音小游戏”、竖屏，点击构建。
2. 用抖音开发者工具导入 `build/bytedance-mini-game`，确认 `game.js`、`game.json` 和 `project.config.json` 存在。
3. 填入项目自有 AppID，真机预览，按 Creator 人工验收的第 1–9 步复测。
4. 退出并重进，确认最高解锁关卡和首次教学状态保留；开发者工具与真机控制台无持续错误。
