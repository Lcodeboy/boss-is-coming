# 办公室桌面布局与新增物品

五关共用「背景木面模板 + 命名槽位配表 + 统一布局计算」。不用逐关硬编码物品 Y。现有 PNG、物品尺寸、目标节点/碰撞/吸附规则与关卡玩法 JSON 均不改动。

## 布局来源

布局数据分为两层：

- `assets/scripts/ui/OfficeTheme.ts`：资源几何。PNG 的真实 Alpha 边界（包含自带投影），电脑、绿植、桌面容器的底部接触带。新资源只登记一次。
- `assets/resources/office/intern-office-layouts.json`：共享木面轮廓、间隙、背景取景上限、三/四/五列命名槽位，以及每关物品到槽位的绑定。`OfficeLayoutCatalog.ts` 严格解析此表并与玩法物品交叉校验。

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
4. 在区间中间及端点进行有界回溯。配表指定的列是硬约束，不会自动把左列道具换到右列来凑出结果；计算器本身也支持仅指定列偏好的容量实验。
5. 所有物品都放得下才一次性返回整套背景变换和父节点位置。成功前不改变任何物品。

默认最小间隙是 12 个设计像素，后排落脚间隙为 8 个设计像素。最终屏幕间隙取决于视口，不再使用“距离桌沿 50～70 真机像素”的固定要求。

## home、拖拽与重置

`WorkItem.applyInitialLayout()` 同时设置逻辑父节点和 `_homePosition`。现有错误归位、重试/重新配置与生命周期逻辑复用这个 home，Sprite 局部保持 `(0,0)`，正确吸附仍调用原 DropZone 的位置换算。

主题未加载、布局未确定时不接受物品交互；加载成功后一次性同步父节点和 home。已发生交互后不能重新写入 home。资源加载失败会记录警告并沿用项目原有整体矢量降级，不应将降级画面当作主题布局验收成功。

五关统一启用临时拖拽层级：

- 点击电脑不置顶。
- 物品只在第一次非零拖拽移动时保存原层级并临时置顶，按下本身不置顶、不改位置。
- 释放、取消、后台反馈取消、禁用、重置和销毁都释放临时层级。
- 完成收纳后，沿用既有“隐藏已收纳视觉并退到背景”的清理行为；不保留拖拽置顶状态。

## 文件标签与容器标题

`OfficeTheme.ts` 的 `labelStyles` 集中维护两种文字底板样式，`itemLabels` / `zoneLabels` 按素材类型选择，不按关卡或物品 ID 分散配置。

- 文件：深色字 `#182C38`，不透明浅米白底 `#FFF8E8`，隔离 PNG 的线条和图表。报告页码 24、文件主标识/装订报告 22、次要编号 18 个设计像素；页眉和版本挂点保持原位。
- 待检查托盘：浅字配深色底。下方托盘只把标题移到容器上方，与私人物品标题同类排列；上方桌面托盘保留原有文字挂点。高亮/完成仍用既有边框与勾选反馈，标题不再随状态变成低对比度蓝/绿字。
- `OfficeLabelBackdrops` 复用被动 Graphics 兄弟节点，始终在文字后面；不注册触摸，不创建 Tween。图片、父节点、UITransform、DropZone 与 home 不变。收入文件夹、矢量回退时隐藏底板，并恢复原文字字号。
- 底板限制在原有 Label 的预留矩形内；布局测量仍显式纳入底板，避免未来改底板时漏检。当前五关六尺寸与修改前的整套父/home/背景求解结果逐项一致。

2026-10-05 可读性验收：`temp/office-labels-final/report.json` / `preview.html`（第2～5关六尺寸初始及延迟状态），`temp/office-labels-level1/report.json`（第1关及生命周期），`temp/office-labels-states/report.json`（额外高亮/完成颜色、底板隐藏回归）。真实文字 Alpha 必须落在底板内、实际字号不得缩水，且底板无触摸监听；半透明底板分别叠在纯黑/纯白上校验保守对比度。抖音工具重新编译后已实测第3关：可直接从页码底板处拖入文件夹，三页收齐后正常出现装订报告。物理真机仍未验证。

## 以后增加物品

对于同类视觉的额外实例，不再增加逐 ID 的 X/Y 偏移。玩法表照常定义物品和目标，布局表绑定命名槽位。例如：

```json
"level-004": {
  "template": "intern-desk",
  "arrangement": "three",
  "items": { "console": "left", "coffee": "center", "contract": "right" }
}
```

此处没有 Y，也不重复保存 home/reset。隐藏的 coffee 也必须绑定；漏项、多项、未知槽位、同槽重复占用都会报错。添加全新关卡仍需走现有关卡注册流程，这张表只负责视觉布局。

对于新 PNG 类型，需要按项目现有资源流程登记：

1. 在主题资源映射和现有视觉映射中增加素材、原始尺寸及真实 Alpha 几何；底部阴影也要计入。新后排/桌面目标必须提供接触带，缺失时会明确报错。
2. 设置正常的物品尺寸、标签和既有交互/目标配置，不要人为压缩触摸框。
3. 为新关卡增加布局表条目，优先复用已有命名列模板。只有桌面背景/布局形式不同才新增模板，而非复制一套逐物品坐标。
4. 运行资源几何校验、布局容量测试和实际浏览器截图/触摸回归。

本次没有新建第二套拖拽系统，也没有修改已有五关 JSON 或新增实际物品。

## 容量是有限的

多列、多排不等于任意数量都能放进当前桌面。回归包含六个小物品的多排例子，但这**不代表当前三种原尺寸物品可以无限复制**。

当前为关卡内所有可拖拽物品预留位置，包括稍后激活的物品；不能仅把 `initiallyVisible` 改为 false 绕过容量检查。第4关咖啡和第5关工牌各占独立保留槽位，即使玩家什么都没收走，事件出现后仍能放下。

第3关是一个经过校验的槽位复用例外：`replaces: { "bound-report": "report-page-2" }`。两者绑定同一列，求解时预留两者图像和触摸范围的并集。仅当旧物品收取后隐藏、旧动作属于新物品解锁条件、新物品初始隐藏且不由定时事件激活时才允许；不支持链式或一对多复用。三张散页收齐时，先结束旧散页的收纳动画并隐藏，再显示装订报告。游戏任务条件未改变。

求解失败分为：

- `invalid-geometry`：重复 ID、缺失/非法几何等输入问题。
- `capacity-or-framing`：在当前列、尺寸、间隙及背景取景策略中没有找到完整布局。
- `search-budget`：达到有界搜索预算；这不是“物理上绝无解”的证明。

错误包含本次参与排布的物品 ID。开发期会直接报出布局配置错误，不会丢掉物品、缩图、压碰撞框或把物品塞进椅子。新增内容必须先通过容量校验再发布。

如果确实需要很多正常尺寸物品同时出现，应由关卡设计选择增加可用区域或分批出现；模板不会凭空增加桌面容量。本版未增加分页、滚动或新的物品生成玩法。

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
PLAYWRIGHT_MODULE=/Users/zhuxiaofei/project-texas-server/texas-server-go-v2/scripts/web-game-bot/node_modules/playwright-core node tests/office-levels-2-5-runtime.cjs
```

不带 `--candidate` 才是生产布局验收。`--geometry-only` 可先生成六张初始 0/4 截图做目视检查，再运行完整触摸回归。

完整回归使用隔离浏览器：实际鼠标/触摸事件、原目标吸附、自然倒计时、重试和退出；五关切换使用单独的已解锁进度夹具，不能称为五关连续通关。引擎 hide/show 模拟也不等同于物理手机后台检查。

第2～5关回归还生成每关六尺寸初始截图，以及报告/咖啡/工牌出现后的最大占用截图。独立解码原始 PNG、真实文字画布，用实际渲染矩阵验证木面、后排及触摸矩形，不仅断言配置坐标。报告包含设计/屏幕间隙与布局指纹。

`--builds` 会对 Web Mobile、抖音两个包内 JsonAsset 与源布局表做内容比对；浏览器也校验相同布局指纹，避免验收旧包。Cocos 构建成功不等于抖音开发者工具已重新编译：打开 `build/bytedance-mini-game` 后仍需重新编译，再做真机预览。报告须分别写明，不能混称。
