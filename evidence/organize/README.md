# 旧缓存更新、分类与试卷来源 · 2026-10-31

## 原因与改动

- 旧 `sw.js` 对应用壳采用缓存优先且 `ignoreSearch: true`，因此 `?release=…` 不能绕过旧页面。旧更新提示位于滚动内容顶部，配置页滚动后容易看不到。
- 新增独立 `update.html`，自身不加入应用壳缓存。用户点击后检查并激活新 SW，验证版本应答再打开应用。不清除 IndexedDB、localStorage 或独立 OCR 缓存。更新页必须联网；请求超时明确提示重试。
- 新版更新提示保持在滚动区域顶部可见，“我的”显示版本与检查更新入口。存在未保存的题图、弹窗、识别任务或 AI 配置时阻止应用内跳转更新。独立更新页提醒先保存其他窗口内容，不承诺跨窗口未保存草稿恢复。
- 保存与编辑页直接展示学科、知识点、试卷名称、题号，均不要求联网。连续从同页选题时沿用上次试卷名称，题号清空。试卷名称可输入，也可从已有名称建议中选择。
- 详情顶部有“修改分类 / 试卷来源”；卡片显示来源与题号；错题本常显试卷、知识点筛选，并可搜索来源和题号。
- 新字段 `paperName` / `questionNo` 为可选字段；旧数据默认为空，备份校验与合并保留它们并检查类型、长度。切换到仅保留图片时也保留已填来源。

设计参考：[margrop/wrong-notebook](https://github.com/margrop/wrong-notebook) README 的学科知识点、题目信息展示、多维筛选。只借鉴分类入口和信息组织，没有复制其全栈代码、知识库或宣传自动分类；试卷名称/题号是本项目此次按用户需求新增的手动元数据。

## 实测

- `acceptance.txt` / `results.json`：独立浏览器安装真实历史提交 `d7c0961`，确认旧页没有模型下拉框；服务器切换为新版，通过独立更新入口升级成功。前后记录、图片、模拟 Key 相同，独立 OCR 缓存中的测试标记保留。未下载完整 OCR 包，不能把标记验证等同于本轮重新验证完整 OCR。
- 真正执行 `taskkill.exe /PID 89504 /T /F`，退出码 0，HTTP 探测为 `ECONNREFUSED`；随后分类/来源保存、编辑、筛选、搜索、刷新找回和备份序列化保留均通过。控制台错误列表为空。
- `ai-regression.txt`：现有 AI 配置流程通过。请求仅为本地模拟，没有真实厂商调用。
- `unit.txt`：现有单元断言通过，补充来源字段类型、长度、旧数据默认值及合并保留检查。
- `save-375x812.png`、`book-375x812.png`、`picker-375x812.png` 均来自桌面 Edge 手机尺寸视口，内容为测试夹具，密钥输入框已清空。真机输入法、相机权限未验证。

## 复现与用户操作

```powershell
node tests/unit.cjs
$env:PLAYWRIGHT_MODULE='C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:BROWSER_EXE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tests/acceptance.cjs --organize-only
node tests/acceptance.cjs --ai-only
```

用户先保存当前内容，用原来存错题的同一浏览器联网打开 https://laij28905-ai.github.io/error-collector/update.html ，点“更新应用，保留错题”。新版“我的”显示“10.31 分类与来源”，AI 识图模型为下拉选择。

新题：保存图片时直接填写分类与来源；旧题：错题本 → 点题卡 → 修改分类 / 试卷来源。找题：错题本上方选择试卷或知识点，也可搜索题号。不需要重新录入旧题。
