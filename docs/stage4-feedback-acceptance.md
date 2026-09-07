# 第四阶段第一部分：反馈与生命周期验收

Cocos Creator 3.8.8。五关 JSON、时间长度、任务判定、进度存档与解锁规则保持不变；没有新增关卡、音乐或平台 SDK。本轮不提交 Git。

## 架构与变更文件

新增逻辑层（均有 Cocos `.meta`）：

- `assets/scripts/core/AudioCue.ts`：12 个音效 ID、限频、优先级。
- `assets/scripts/core/AudioFeedbackService.ts`：加载状态、手势解锁、音量、静音、单通道限流及停止。
- `assets/scripts/core/FeedbackDirector.ts`：消息、阶段、节拍、敲门、开门与结算去重。
- `assets/scripts/core/HapticFeedbackService.ts`：独立振动开关、短反馈模式、可注入 Provider。
- `assets/scripts/core/SettingsService.ts`：独立版本化设置存储及损坏恢复。
- `assets/scripts/core/GameLifecycleService.ts`：正交暂停状态、显式继续及订阅清理。
- `assets/scripts/core/CountdownClock.ts`：从原倒计时提取的可测试时钟，保留原更新节奏与快速收尾速度。
- `assets/scripts/game/CocosFeedbackProviders.ts`：单个 AudioSource、Cocos hide/show、Web 失焦/可见性和能力检测振动。
- `assets/scripts/ui/SettingsView.ts`：仅包含音效、振动与关闭的设置弹窗。

修改：

- `AudioFeedback.ts` 成为唯一反馈组件入口；`CountdownTimer.ts` 仅负责驱动时钟。
- `GameFlowController.ts` 连接生命周期和语义反馈，不包含音频资源、绘制或平台 API。
- `WorkItem.ts`：每次拿起一次反馈、每次拖拽最多一次接近提示、后台取消动画并落实已接受的吸附状态。
- `ActionButton.ts`：统一点击音、按压状态清理、继续按钮的暂停输入权限。
- `GameView.ts`：首页小设置入口、全屏继续遮罩、最后三秒边缘脉冲、暂停清理。
- `BossApproachView.ts`：阶段节点亮起与 Tween 清理。
- `EventMessageView.ts`：遵循系统减少动态效果偏好。
- `InspectionView.ts`：暂停调度器，保留当前项剩余展示时间；取消/销毁仍清理唯一检查回调。
- `tests/tsconfig.json`：纳入第四阶段严格类型回归。
- `.gitignore`：仅豁免本轮验收说明，避免被本机全局 `docs` 忽略规则排除。

新增工具与资源：

- `tools/generate-feedback-audio.mjs`：确定性原创音效生成与格式/峰值检查。
- `assets/resources/audio/`：12 个 WAV 与对应 `.meta`，目录 `.meta`。
- `tests/stage4-regressions.ts`：反馈、设置、生命周期及三轮回归。
- `tests/feedback-runtime-regressions.mjs`：用可控引擎替身运行实际 InspectionView 和 CocosAudioProvider，覆盖检查暂停、取消清理以及成功加载回调的 null/undefined 兼容。
- `tools/feedback-probe.html`：独立 Web 验收观察页，不进入游戏资源包。
- 本文与 README 更新。

## 音效映射与音频检查

所有声音由仓库脚本从正弦波与固定种子噪声生成，无采样录音或网络素材。单声道、16-bit PCM WAV、22,050 Hz。脚本保留了每个音符的时间、频率、噪声比例和包络参数；两端平滑淡入淡出。资源随本项目使用与修改。

| ID | 触发场景 | 时长（秒） | 峰值（满幅=1） | RMS |
| --- | --- | ---: | ---: | ---: |
| button | 所有有效按钮；首次开始由同一次用户手势解锁音频 | 0.075 | 0.2853 | 0.1050 |
| item-picked | 物品触摸开始，仅一次 | 0.105 | 0.2934 | 0.1050 |
| target-near | 靠近正确目标，每次拖拽最多一次 | 0.115 | 0.2946 | 0.1050 |
| item-correct | 正确点击完成或正确吸附 | 0.275 | 0.3400 | 0.1036 |
| item-wrong | 错误释放，配合原抖动归位 | 0.170 | 0.3058 | 0.1050 |
| elevator | 电梯上升、到达楼层、进入走廊的阶段变化 | 0.380 | 0.3181 | 0.1050 |
| message | 第4关咖啡、第5关访客证消息；按事件 ID 去重 | 0.250 | 0.3174 | 0.1050 |
| warning | 剩余5、4、3、2、1秒；最后3次轻微增益 | 0.100 | 0.2953 | 0.1050 |
| knock | 自然倒计时约最后0.6秒；提前完成时进入门口阶段 | 0.205 | 0.3400 | 0.0841 |
| door | 检查遮罩出现后开门，一轮一次 | 0.385 | 0.3400 | 0.1024 |
| success | 成功结算，一轮一次 | 0.530 | 0.3400 | 0.1030 |
| failure | 失败结算，一轮一次 | 0.440 | 0.3089 | 0.1050 |

资源波形峰值不超过 0.34，最长静音段约 55.9ms（两次敲门之间），相邻采样最大跳变不超过 0.0901；没有削波或超过0.8秒的资源。播放主音量0.65，最后3秒增益1.12。单通道防止叠音，低优先级交互音在高优先级警示/结算播放时可以被忽略。资源没加载完也直接忽略，不补播。

敲门与开门通常由原倒计时自然分隔；极端丢帧或快速收尾时确保敲门后至少0.23秒才播放开门声音，只调度声音、不延迟或跳过检查项。暂停、重试、切关会取消这次声音调度。

```bash
node tools/generate-feedback-audio.mjs
node tools/generate-feedback-audio.mjs --check
```

第二条会验证现有 WAV 与确定性生成结果逐字节一致，并打印格式、时长、峰值、RMS、最长静音和采样跳变。

实际构建运行还修复了一个适配问题：Creator 的资源成功回调可能传入 `undefined`，不能以 `error !== null` 判断失败，否则资源虽已加载却不会进入可播放集合。适配层现在兼容 null/undefined，实际 AudioSource STARTED/ENDED 事件已记录到，另有实际适配器回归防止复发。

## 设置与振动

设置独立使用 Cocos `sys.localStorage`，键 `boss-is-coming.settings`：

```json
{"version":1,"soundEnabled":true,"vibrationEnabled":true}
```

缺失时使用默认值；损坏或版本不符时恢复默认，不访问或覆盖 `boss-is-coming.progress`。存储被系统拒绝时保留内存设置。关闭音效/振动会同步停止当前反馈。

Web 检测 `navigator.vibrate`；不支持或被系统拒绝时安全无操作。小游戏当前使用无操作 Provider，后续通过 `AudioFeedback.setHapticProvider` 注入平台实现，不直接访问 `tt`。触觉模式：正确14ms、错误32ms、末3秒10ms、开门40ms；成功与失败使用不同的双段模式。

减少动态效果使用系统/浏览器 `prefers-reduced-motion: reduce`，取消非必要按压/拿起/生成缩放、目标错误抖动、阶段亮起和边缘脉冲；必要的归位和吸附位移保留。设置弹窗按要求只提供两个反馈开关。

## 生命周期状态

暂停是业务状态以外的独立标志，不更改 READY/PLAYING/PREPARED/INSPECTING/SUCCESS/FAILURE 转换。

| 原状态 | 进入后台或失焦 | 回前台 |
| --- | --- | --- |
| PLAYING | 冻结时钟和进度，禁用交互，停止声音/振动，取消反馈动画 | 显示“继续整理”，点击后恢复 |
| PREPARED | 冻结同一个快速收尾时钟 | 点击继续后完成原快速路程 |
| READY/教学 | 保留原教学/提示界面，不启动时钟 | 仍由原教学按钮开始 |
| INSPECTING | 冻结当前检查项的剩余展示时间，不产生结算 | 保持检查状态，继续原展示，不补播旧声音 |
| 首页/选关/结算 | 停止反馈，保持界面 | 不显示继续遮罩，不重复结算或播放结果音 |

恢复首帧丢弃可能包含后台时长的 delta。多种 hide/blur/visibility 通知经过归并，只订阅一次，销毁成对卸载。重试、切关、返回首页会清理声音与暂停状态。后台中断正在拖拽的物品会立即归位；已经判定完成但还在吸附动画中的物品会直接落实到容器，避免“已完成但停在半路”。

## 自动检查与构建

```bash
node "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc" --project tsconfig.json --pretty false
node "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc" --project tests/tsconfig.json --pretty false
node temp/core-regressions/tests/core-regressions.js
node temp/core-regressions/tests/stage2-regressions.js
node temp/core-regressions/tests/stage4-regressions.js
node tests/feedback-runtime-regressions.mjs
node tools/generate-feedback-audio.mjs --check
git diff --check
```

以上检查通过。既有五关配置、跨引用、组合生成、动态事件单次触发、存档恢复、解锁、六尺寸布局及单次结算回归均保留并通过。

2026-09-07 Creator 最终构建产物：

- Web Mobile：`/private/tmp/boss-stage4-web-final/web-mobile`
- 抖音小游戏：`/private/tmp/boss-stage4-douyin-final/bytedance-mini-game`
- 日志：`/private/tmp/boss-stage4-web-final.log`、`/private/tmp/boss-stage4-douyin-final.log`

两次日志均到达 `build Task ... Finished`，两份产物均包含12个WAV；抖音产物包含 `game.js`、`game.json`、`project.config.json`。Creator命令行启动器最终退出码36；日志另有性能计时标记缺失和构建脚本子进程回收SIGTERM信息，不能把“构建完成”描述成日志零警告。Web产物已实际启动验证；抖音开发者工具和手机尚需人工验收。

## 人工试听与试玩

1. Creator 3.8.8 打开 `assets/scenes/Main.scene`，直接预览，无需添加组件或填写资源属性。
2. 首页点“设置”，分别关闭音效、振动，关闭弹窗后刷新/重启，再进设置确认保留。重新开启两项，点“开始挑战”。
3. 可先在 Creator 资源面板逐个打开 `assets/resources/audio` 下12个WAV试听；用上表记录音色、音量与场景，重点听敲门、开门是否可辨认，手机小音量下提示是否清楚。机器峰值检查不能代替主观试听。
4. 第一关开始后，点击电脑，拿起游戏机靠近抽屉，再移远再靠近，确认每次拖拽只有一次接近音；错误释放后抖动归位，正确释放后吸附并有轻反馈。
5. 正在拖拽或倒计时中切换普通浏览器标签页/最小化，再回来：时间未减少，出现“继续整理”，底下物品不能操作；点击继续才恢复。重复三次，并测试最后3秒时切后台。
6. 不完成任务等待自然到达，核对5次警示节拍、最后3次轻振/边缘脉冲、敲门、开门、逐项检查与一次失败音；在检查第2项时切后台，回来仍继续原检查。
7. 重试并提前完成全部任务，确认没有余下警示，仍逐项检查，成功仅播放一次。再次失败再成功，复核没有叠音、重复结算或监听残留。
8. 第3关收集第3页生成报告时切后台，恢复后已收集页不挡住报告；第4关16秒咖啡、第5关18秒访客证的消息音只响一次，重试后仍正常。
9. 首次教学时切后台，回来仍处于教学，不开始计时。用新的测试浏览器/独立预览存储验证，不清除正式玩家进度。
10. 在系统启用“减少动态效果”后复测：按压/拿起缩放与边缘脉冲不播放，点击拖放仍正常。
11. 抖音开发者工具导入最终抖音目录，使用项目自己的AppID；测试资源加载、前后台、重试和五关流程，检查持续错误。振动本轮按无操作 Provider 处理。

辅助观察：把 `tools/feedback-probe.html` 复制到 Web 构建目录，以本地HTTP服务器打开同名页面。上方“失焦测试”按钮让嵌入游戏实际失焦；重新点击游戏后应显示继续遮罩。下方记录真实 blur/focus/visibility 与 AudioSource STARTED/ENDED 事件，不修改关卡或进度。该页面仅用于验收，发布时无需复制。

已完成的浏览器检查：393×852实际加载、设置重启保留、真实iframe失焦/恢复（失焦16秒后仍保留30秒倒计时）、电脑点击、错误归位、正确收纳、自然失败、重试提前成功，以及第4关咖啡消息。12种音效均记录到实际 AudioSource STARTED 事件；自然失败轮记录到恰好5次警示，随后敲门、开门、一次失败音，下一轮提前成功没有新增警示，始终仅创建1个AudioSource。没有发现运行错误。

自动化新建标签页未向原页送出visibility/blur事件，所以普通浏览器标签切换和抖音隐藏/显示仍明确列为人工复测，未将其冒充已验证。实际播放事件与波形检查不等同于人工听感认可，12种声音仍需使用手机逐一试听。
