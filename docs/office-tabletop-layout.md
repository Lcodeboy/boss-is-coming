# 办公室桌面布局与新增物品

本次只为第1关启用统一桌面布局。第2～5关继续使用原坐标、背景 cover 和原交互层级策略。PNG、.meta、物品尺寸、目标节点/碰撞/吸附规则均未调整。

## 布局来源

`OfficeTheme.ts` 集中保存两类数据：

- 资源几何：PNG 的真实 Alpha 边界，使用右/下边界不包含端点的像素坐标；电脑、绿植、托盘还配置底部接触带的横向范围。
- 关卡布局策略：背景源尺寸、木面后沿/侧边轮廓和前沿、列中心、最小间隙、后排落脚间隙、背景相对 cover 的最大等比放大比例。

轮廓是从现有背景图实测后向木面内部取整的，不是根据预期物品位置反推桌沿。资源回归会解码真实 PNG，逐像素确认轮廓在木面内，检查所有已登记 Alpha 和后排接触范围。

`GameView.applyOfficeDeskLayout()` 在主题视觉已建立后读取实际节点变换，统一转换到 WorkspaceContent 坐标系：

- PNG 使用上述 Alpha 边界，包含图片自带投影。
- Label 使用公开 UITransform 的保守占位范围，兼容没有 DOM 的小游戏环境；运行回归另测实际文字 Alpha，不能只用坐标相等作为验收。
- 现有矢量物品至少保留原本逻辑尺寸及已登记的顶部溢出，不能只拿标签大小当物品大小。
- 后排 PNG/文字构成不可遮挡区；电脑等可交互后排还约束前排触摸中心。
- 所有前排物品之间同时预留图像和完整触摸矩形，不缩小碰撞框来增加容量。

## 背景取景和物品位置一起求解

`solveOfficeDeskLayout()` 是纯函数，没有 Node、Tween 或任务判定依赖。

1. 从保持比例的 cover 缩放开始，优先使用最小背景放大幅度。当前策略以 0.5% 为步长，最多到 cover 的 115%；这只限制背景取景，不缩放物品。
2. 根据“不露屏幕边缘”和“所有后排落脚点都在木面内”求背景中心的合法区间。背景平移时，前沿、后沿与椅子一起移动，木面深度不会被误计为增加。
3. 在合法取景内，根据各物品图像/标签、后排障碍、木面斜边、已放置物品及触摸区域求每一列的可用 Y 区间。
4. 在区间中间及端点进行有界回溯，允许多个物品分为多列、多排。优先列只是排布偏好，不依赖物品 ID；当前三件物品稳定占用左、中、右三列。
5. 所有物品都放得下才一次性返回整套背景变换和父节点位置。成功前不改变任何物品。

默认最小间隙是 12 个设计像素，后排落脚间隙为 8 个设计像素。最终屏幕间隙取决于视口，不再使用“距离桌沿 50～70 真机像素”的固定要求。

## home、拖拽与重置

`WorkItem.applyInitialLayout()` 同时设置逻辑父节点和 `_homePosition`。现有错误归位、重试/重新配置与生命周期逻辑复用这个 home，Sprite 局部保持 `(0,0)`，正确吸附仍调用原 DropZone 的位置换算。

已发生交互后不能重新写入 home；过晚到达的主题回调也不能把物品或手指下的节点移走。下一次进入/重试会使用已缓存主题重新计算。

第1关启用临时拖拽层级：

- 点击电脑不置顶。
- 物品只在第一次非零拖拽移动时保存原层级并临时置顶，按下本身不置顶、不改位置。
- 释放、取消、后台反馈取消、禁用、重置和销毁都释放临时层级。
- 完成收纳后，沿用既有“隐藏已收纳视觉并退到背景”的清理行为；不保留拖拽置顶状态。
- 第2～5关没有启用该策略，保持原行为。

## 以后增加物品

对于同类视觉的额外实例，不再增加逐 ID 的 X/Y 偏移：新关卡物品会按 `interaction: drag` 收集到求解输入，自动获取父/home 位置。

对于新 PNG 类型，需要按项目现有资源流程登记：

1. 在主题资源映射和现有视觉映射中增加素材、原始尺寸及真实 Alpha 几何；底部阴影也要计入。新后排/桌面目标必须提供接触带，缺失时会明确报错。
2. 设置正常的物品尺寸、标签和既有交互/目标配置，不要人为压缩触摸框。
3. 为需要启用该机制的新关卡增加 `levelLayouts[levelId].tabletop` 配置。可调整列数/列中心与间隙策略，但需要重新验证屏幕尺寸和后排落点。
4. 运行资源几何校验、布局容量测试和实际浏览器截图/触摸回归。

本次没有新建第二套拖拽系统，也没有修改已有五关 JSON 或新增实际物品。

## 容量是有限的

多列、多排不等于任意数量都能放进当前桌面。回归包含六个小物品的多排例子，但这**不代表当前三种原尺寸物品可以无限复制**。

当前为关卡内所有可拖拽物品预留位置，包括稍后激活的物品；不能仅把 `initiallyVisible` 改为 false 绕过容量检查。真正的分批复用槽位还需要定义物品入场/完成顺序和对应验收。

求解失败分为：

- `invalid-geometry`：重复 ID、缺失/非法几何等输入问题。
- `capacity-or-framing`：在当前列、尺寸、间隙及背景取景策略中没有找到完整布局。
- `search-budget`：达到有界搜索预算；这不是“物理上绝无解”的证明。

错误包含本次参与排布的物品 ID。开发期会直接报出布局配置错误，不会丢掉物品、缩图、压碰撞框或把物品塞进椅子。新增内容必须先通过容量校验再发布。

如果确实需要很多正常尺寸物品同时出现，应由关卡设计选择增加可用收纳台/桌面区域，或利用现有解锁/激活机制分批出现。它们是后续内容与玩法决策，本次没有擅自改成分页、滚动或分批生成。

## 验证命令

```sh
node /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc -p tests/tsconfig.json
node temp/core-regressions/tests/stage2-regressions.js
node tests/intern-office-assets-regressions.mjs --builds
```

实际浏览器回归需先构建 Web Mobile、启动项目静态服务，并提供已安装的 Playwright：

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory /Users/zhuxiaofei/myapp/boss-is-coming
```

```sh
PLAYWRIGHT_MODULE=/Users/zhuxiaofei/project-texas-server/texas-server-go-v2/scripts/web-game-bot/node_modules/playwright-core OFFICE_TEST_OUTPUT=temp/office-layout-final node tests/intern-office-layout-runtime.cjs
```

不带 `--candidate` 才是生产布局验收。`--geometry-only` 可先生成六张初始 0/4 截图做目视检查，再运行完整触摸回归。

完整回归使用隔离浏览器：实际鼠标/触摸事件、原目标吸附、自然倒计时、重试和退出；五关切换使用单独的已解锁进度夹具，不能称为五关连续通关。引擎 hide/show 模拟也不等同于物理手机后台检查。
