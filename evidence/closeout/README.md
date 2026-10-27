# 2026-10-27 收口交付

唯一工作仓库：`C:\Users\Lenovo\Documents\ChatGPT\创客竞赛\error-collector`。

基线为远端 main 的 `2ab7fdb4124261e313fb5f4fcaf7eb912f048226`，源码提交为 `301adb2942378c92eda04750bb0bbaefab185fb9`，本轮在 `codex/offline-demo` 分支修改。旧副本 `../highschool-error-notebook-ARCHIVE-只读` 已在 README 首行标记“非工作副本”，文件设置为只读，不参与本轮开发或测试。当前环境没有 Git 作者配置，提交使用 Codex 身份，未修改用户全局 Git 配置。

## 三个事实

- OCR 共 12 个资源，61,253,597 字节，没有进入 Git；仅文本清单 `ocr-assets.js` 进入 Git。首次联网安装下载固定版本文件，逐个校验大小与 SHA-256 后存入独立缓存。
- 唯一被 Git 跟踪的 vendor 文件仍是原有 `vendor/dexie.min.js`；本轮未修改任何 vendor 二进制。
- 源码提交 hash、最终工作树状态见交付回复；测试使用的源码 SHA-256 见 `source-sha256.json`，可独立对照本次提交。

## 实测结果与边界

`acceptance.json` 记录 14 项通过、1 项公式识别原样记录。`closeout-full.log` 是完整终端输出，包含真实 `taskkill.exe` 命令、返回码、服务器连接拒绝、冷启动识别文本及保存结果。测试使用全新的 Edge 持久化 profile，首次安装后彻底关闭浏览器，杀掉脚本创建的静态服务器，再用同一 profile 冷启动；没有使用 CDP 模拟断网。识别阶段观测到的外部请求为 0。

离线识别使用**合成的印刷中文图片** `printed-question.png`，不是手机实拍。五页来回三轮时控制台无错误。后续主动注入 AI 503 和缺失 wasm 503，因此最终汇总中两条预期资源错误不代表“五页切换”失败，也不能宣称整段故障注入日志零错误。

导入两种取消均保留原数据；替换写入异常时事务回滚；连续五次复盘含两次存储异常，遮罩均关闭；评分连点只记一次；同步合并保留本地独有数据；新版本等待用户确认、保留 OCR 缓存；无 IndexedDB 时有提示且可降级保存。

`formula-ocr.json` 记录合成公式图的真实识别错误，不能用于五张真实题图的验收。测试图中 x²、≥、√、∫ 在默认校正文本里均未正确识别，不能声称公式准确率达标。`formula-correction-ui.json` 记录局部增强、可疑高亮、采纳建议后原文保留、弹窗可滚动、默认不出现 AI 视觉入口的检查结果。高亮只是启发式提示，仍会漏报，不能保证把所有错误标出来。

## 截图

以下均为桌面 Edge 的 375×812 视口，不是真机：

- [首页](home-375x812.png)
- [识别后核对弹窗](capture-375x812.png)
- [复习页](review-375x812.png)

复习按钮底边不越过底部导航上边；识别弹窗已实测可滚动。没有真实手机，也没有软键盘弹起实测，不能用这些截图替代真机验收。

## 演示步骤

1. 固定演示电脑、浏览器配置和地址，在仓库目录运行 `python -m http.server 8080`，打开 `http://localhost:8080/app.html`。
2. 联网等待“离线识别已就绪”，不要换成 127.0.0.1、其他端口或另一个浏览器。首次下载需要足够空间和稳定网络，失败会显示未就绪，不能进入正式演示。
3. 关闭浏览器，在服务器终端按 Ctrl+C 结束服务器；确认该地址网络请求已无法连接，然后重新启动同一浏览器并打开同一地址。
4. 从相册选择题图，点击识别；对照原图修改高亮位置，保存；进入错题本、复习页。默认流程不设置 AI Key，不使用 AI 视觉。
5. 联网 AI 演示单独进行：恢复服务，填写自己的接口与 Key，再生成复盘。当前自动验收使用本地模拟响应，没有调用真实付费服务。

全新 profile **尚未联网安装就断网**不可能取得网页或 OCR 包；正确验收顺序是全新 profile → 联网装好 → 关浏览器并真杀服务器 → 冷启动识别保存。

## 复现已有测试

不新增 npm 依赖，不新增测试类型。现有 Node 测试：

```powershell
node tests/unit.cjs
$env:PLAYWRIGHT_MODULE='C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:BROWSER_EXE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tests/acceptance.cjs 2>&1 | Tee-Object -FilePath test-results/closeout-full.log
```

其他电脑需把两个环境变量改为现有安装的绝对路径。脚本只结束自己创建并记录 PID 的服务器进程；每次随机分配端口、创建新 profile，因此 PID 和端口会不同。`taskkill.exe /PID <脚本记录的PID> /T /F` 的实际原文输出保存在完整日志。

## 改动范围与回滚

关键位置（行号对应源码提交）：`sw.js:23` 离线包校验与独立缓存，`js/offline.js:6` 启动自检，`js/app.js:1295` OCR 锁及快照，`js/app.js:1878` 复盘异常兜底，`js/app.js:2326` 自动同步合并，`js/app.js:2561` 导入取消/替换，`js/reliability.js:142` 按时间合并及 `:158` 原子写入，`js/ocr-review.js:12` 公式 ROI、`:60` 可疑标记、`:106` 并排核对，`styles.css:1554` 核对视图与移动弹窗。

- `sw.js`、`ocr-assets.js`、`js/offline.js`：首次下载与校验、自检、独立缓存、显式更新、非页面资源不返回 HTML。原 SW 结构无法隔离缓存生命周期，故重写此小文件；保留页面缓存和离线导航能力。
- `js/reliability.js`、`js/app.js`：导入取消与二次确认、原子写入、按更新时间合并、锁与 try/finally、超时、图片压缩与 URL 校验、规则生成标签。
- `js/ocr-review.js`：只针对本轮要求添加公式行局部增强、原文/校正 diff、可疑标记和采纳；AI 视觉入口默认隐藏。
- `app.html`、`styles.css`、增强脚本：收敛首页与录入操作，保留五页；修正裁剪比例与流关闭，弹窗可滚动。

未改 `index.html`、`manifest.json` 或 vendor 二进制。main 基线没有 `demo/` 或 `vendor/tesseract/`，因此“仓库已含全部 OCR 文件”的前提不成立。回滚使用本分支的提交记录进行 `git revert`，不恢复旧副本。

模板标签原先混在复盘、批改入口中；现在错题本卡片、详情复盘、自测反馈和打印页均按来源显示“规则生成”或“AI 复盘/AI 批改”。无 Key 的设置提示也改为“规则生成”。

## 未完成验收

- 五张真实题图未提供，手改处数和耗时均未测量，平均 ≤2 处、≤30 秒的目标不能判定通过。
- 真机三张截图、软键盘遮挡、真实摄像头拍摄均未验证。
- 在线 AI 只验证了模拟响应和失败降级，真实接口及 AI 视觉准确性未验证。
- 初次下载依赖外部资源可达性；正式比赛必须在同一设备、同一地址提前完成安装和彩排。

首次验收曾因中文 OCR 原样空格与断言不符失败；恢复安全文本规范化后重跑通过，保留 `closeout-attempt1.log`，不把第一次失败算作通过。
