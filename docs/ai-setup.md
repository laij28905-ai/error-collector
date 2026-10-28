# 应用内识图与解题

在“我的 → AI 接口”选择服务，填写 API Key，检查模型和接口地址，点“测试连接与识图”，再保存。录入页的“AI 识图（联网）”可以直接读取当前题图，不需要先跑本地 OCR。保存后生成复盘和批改作答也会附带这道题的图片；纯文字题仍可使用同一模型。

## 支持范围

采用 OpenAI Chat Completions 兼容协议，图片使用 `image_url` 内联 data URL。支持预设服务及符合该协议的自定义服务，不承诺任意厂家的任意模型都能调用。原生 Anthropic Messages、OpenAI Responses 等不同协议不在本次支持范围。

| 服务 | 预设模型 | 配置说明 |
| --- | --- | --- |
| OpenAI | gpt-4.1-mini | https://api.openai.com/v1 |
| DeepSeek | deepseek-flash | https://api.deepseek.com |
| Google Gemini | gemini-3.8-flash | https://generativelanguage.googleapis.com/v1beta/openai |
| 阿里云百炼 | qwen3-vl-plus | 从控制台复制对应地域和业务空间的兼容地址，不填通用猜测地址 |
| 自定义 | 用户填写 | 须支持 Chat Completions、图片输入与浏览器跨域调用 |

模型名称可修改，应以自己账号可用的识图型号为准。不能因为名称包含“vision”就认定支持识图。首次测试发送本机生成的四位数字图片，只有返回正确数字才显示通过；不发送用户题图，也不把测试通过当作解题准确率保证。测试会产生一次 API 用量，没有自动收费重试。

## 数据与失败处理

只在用户点击 AI 操作后发送相关题图、题目和作答，直接发送至所填服务；不上传整个错题本。Key 保存在当前浏览器设置中，不随完整备份导出，不写进仓库。更换服务或编辑接口地址会清空表单中旧 Key，避免误发给另一家服务。只接受 HTTPS 地址，本机 localhost 服务除外；拒绝带账号、密码、查询参数的接口地址，不跟随接口重定向。

请求超时为 15 秒。提示区区分 Key 无效、模型/地址错误、余额或限流、图片格式、连接或 CORS 问题。失败不会删掉原题图；复盘失败时仍可生成明确标记的本地规则笔记。纯前端不能绕过厂商的 CORS 限制；该服务不允许浏览器直连时，应选择允许直连的兼容服务，不能把其误标为可用。复杂题的回答也可能超过当前超时上限。

本次没有用户提供的真实 API Key，不调用付费服务。现有本地测试验证请求带图、切换服务清空 Key、错误识图测试不误报通过、401 提示、失败降级和页面流程；这些证据不等于四家真实服务均已实测通过。真实解题质量、费用、网络与真机表现仍需用户自己的账号验证。

## 官方参考（2026-10-28 核对）

- OpenAI 图片输入：https://developers.openai.com/api/docs/guides/images-vision
- DeepSeek 识图：https://api-docs.deepseek.com/guides/vision/
- Gemini 兼容格式：https://ai.google.dev/gemini-api/docs/openai
- 百炼图像理解：https://help.aliyun.com/zh/model-studio/vision

这些文档确认接口格式与识图能力，不能证明每个账号或手机网络都可直接调用。
