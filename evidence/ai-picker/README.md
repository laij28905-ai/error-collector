# AI 选择式配置 · 2026-10-30

截图中接口地址为官方 DeepSeek 地址，但型号填写为产品展示名称 `Deepseek-V4.1-Flash`。官方 API 文档要求使用 `deepseek-flash`。旧代码将所有 HTTP 400 都显示为“请求不被支持”，无法确认该次真实响应的具体错误；本轮没有用户 Key，也没有重放其付费请求。

## 修改

- “模型服务 → 识图模型”使用下拉选择。OpenAI、DeepSeek、Gemini 的地址和模型标识自动填写，常规使用只需填写对应服务的 Key。
- 百炼提供型号选择，地址含用户业务空间，仍需从控制台复制；其他兼容服务保留自定义入口。
- 原有自填型号保留，改选预设后保存即可；同服务换型号保留 Key，切换服务或修改地址清空表单旧 Key。
- 按 HTTP 状态和已知错误字段区分模型不存在、Key 无效、余额/配额不足。未知 400 明确保留不确定性，不把服务的原始错误内容（可能含敏感信息）回显。
- `sw.js` 更新壳缓存版本，已有错题与独立 OCR 缓存不清除。

## 证据与边界

- `unit.txt`：现有单元检查通过，覆盖地址识别、错误分类和不回显服务原始内容。
- `ai-targeted.txt` / `results.json`：现有 Playwright 验收的 AI 流程通过；四家预设、旧配置保留及修正、Key 保留/清除、保存恢复、自定义入口、带图请求、低质量探针拒绝、HTTP 400 模型提示、401 和失败降级均用本地模拟服务验证。
- `settings-375x812.png` / `save-375x812.png`：桌面 Edge 的手机尺寸截图，测试 Key 已清空。检查表单可滚动且保存按钮位于底部导航上方；不是物理手机键盘测试。
- `full-attempt.txt`：本轮全套验收在等待 OCR 包下载就绪时达到 90 秒超时，后续项未执行。此前的图片断网保存/刷新找回已通过。不能将本轮全套验收宣称为通过。
- 未验证真实付费账号的余额、授权、CORS、手机网络和模型回答质量。没有新增依赖或测试平台。

复现：

```powershell
node tests/unit.cjs
$env:PLAYWRIGHT_MODULE='C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:BROWSER_EXE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tests/acceptance.cjs --ai-only
```

手机验收：联网更新 → 我的 → AI 接口 → 服务选 DeepSeek → 识图模型选 DeepSeek Flash → 填自己的 DeepSeek API Key → 测试连接与识图 → 保存设置。已有 Key 且服务未变时，只需改选型号，Key 会保留。测试会产生一次少量 API 用量；不要将 Key 发到聊天或截图里。

官方依据：[DeepSeek 首次调用](https://api-docs.deepseek.com/en/)、[DeepSeek 图片输入](https://api-docs.deepseek.com/guides/vision/)、[Gemini 兼容接口](https://ai.google.dev/gemini-api/docs/openai)、[百炼图片理解](https://help.aliyun.com/zh/model-studio/vision)。
