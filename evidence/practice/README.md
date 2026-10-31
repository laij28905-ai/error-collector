# 举一反三作答与题卡名称验收

日期：2026-10-31。版本：practice-v1。测试环境：Windows / Edge 无头浏览器，375×812 视口；独立浏览器 profile。截图使用合成题图，不含用户照片或真实 API Key。

## 本次改动

- 题卡标题优先使用试卷与题号，例如“周测1 · 第 1 题”；备注单列，旧图片记录的备注兼容显示，编辑页可修改。
- 举一反三按钮进入独立作答页，打开题目不再自动标记完成。返回原题恢复详情滚动位置。
- 支持文字、拍照及相册作答；照片压缩后保存，先保存成功再发送给配置的 AI。请求失败保留作答，可在原记录上重试。
- 展示 AI 读到的作答、分析和参考答案；无法可靠识读时要求模型明确说明，不把模型判断当作已验证事实。
- 首页最近三次练习与完整练习列表保留题目快照、文字、照片及反馈；重新生成举一反三不会覆盖以前作答。完整备份包含这些记录。
- 练习随原错题保存；删除原题会删除对应练习，确认框明确提示。每道原题最多保留 200 次作答。

## 可复现命令

在仓库根目录执行（使用已有 Playwright，不新增依赖）：

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:BROWSER_EXE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tests/unit.cjs
node tests/acceptance.cjs --practice-only
node tests/acceptance.cjs --organize-only
node tests/acceptance.cjs --ai-only
```

## 实测结果及证据

- [practice-v1.log](practice-v1.log)：标题/备注、返回滚动位置、草稿恢复、存储失败不请求 AI、附图请求对应练习题、API 失败保留答案、重试不重复入库、不确定反馈、题目快照和备份校验均通过。
- 同一日志含真实 `taskkill.exe /PID 103388 /T /F` 原文输出及 `ECONNREFUSED` 探测。杀服务器后第三次练习保存成功，关闭并重新启动浏览器，三条作答仍在。这项验证的是练习保存与读取，不是手写 OCR 准确率。
- [practice-organize-regression.log](practice-organize-regression.log)：从真实 d7c0961 旧壳升级到 practice-v1，错题、图片、Key、独立 OCR 缓存标记保留；杀服务器后分类、来源、编辑、搜索和备份检查通过。
- [practice-ai-regression.log](practice-ai-regression.log)：模型下拉、请求附图、无效模型提示和失败降级回归通过。
- [unit.log](unit.log)：数据校验、备份字段、旧备注兼容与 AI 反馈解析等单元检查通过。
- 手机尺寸截图：[题卡名称](practice-title-375x812.png)、[作答页](practice-answer-375x812.png)、[反馈页](practice-feedback-375x812.png)、[首页练习记录](practice-home-375x812.png)。页面内容可滚动，截图仅截取当前视口。

## 手机操作复核

1. 联网打开更新入口，点击“更新应用，保留错题”；在“我的”确认“10.31 举一反三作答”。
2. 为错题填“周测1”“1”和备注，返回错题本检查标题与备注分别显示。
3. 在已有 AI 复盘的详情底部点一道举一反三，输入答案或选择手写作答照片。点“返回原题”，确认回到原先位置；重新打开时草稿应仍在。
4. 点击“保存作答”，在首页“举一反三记录”查看；或点击“提交 AI 分析”，核对识读内容与照片，再看分析和参考答案。
5. 断网后完成另一次作答并保存，重新打开应用查看历史；联网后可从该记录继续请求 AI 分析。

## 明确未验证/限制

- AI 验收使用模拟视觉接口，不证明任何真实模型的手写识读或解题准确率；未使用用户 Key 发起付费测试。
- 真机摄像头唤起、手机软键盘与实际手写照片效果尚待用户手机复核。
- 未保存草稿仅保留在本次打开页面的内存，刷新/关闭前需点保存；已保存记录在本地浏览器，换设备需完整备份迁移。
- 浏览器存储被清除会丢失本地记录；本次不增加账号或云端存储。
