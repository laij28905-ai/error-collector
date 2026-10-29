# 手机框选与连续记录验收 · 2026-10-29

本轮为独立实现，没有分析或移植扫描全能王的私有代码、模型。

旧 `.crop-frame` 样式的 `pointer-events: none` 阻止框体和手柄接收输入，`transform: translate(-50%, -50%)` 又使显示位置与裁剪坐标偏离。增强样式现已明确覆盖两项；触摸区域扩大到 44 × 44 CSS 像素。初始视图完整显示图片，移动框不再连带移动图片。四边和四角独立调整，旋转尚未完成时禁止裁剪，取消旋转弹窗不改原图。

上传或拍照后在内存保留整页，裁剪后只把选区用于保存。选择“保存并选下一题”会保存当前记录并返回整页框选；普通保存、重新选择会释放整页。刷新页面不会保留未保存的整页。整页不会随每条错题重复入库。

## 已实测

- `node tests/unit.cjs`：通过，输出见 unit.txt。
- 现有 `tests/acceptance.cjs`：15 项通过，1 项公式识别结果仅记录、不计通过，见 results.json 和完整 acceptance.txt。
- 375 × 812 桌面 Edge 视口，CDP 注入触摸输入：分别调整宽、高、移动框，核对图片不移动；从一张合成试卷连续保存 3 条记录；注入存储失败后草稿和整页保留。
- 裁剪截图：crop-375x812.png。图片为合成夹具，不能视为真实试卷识别结果。
- 离线测试没有用 CDP 模拟断网：新 profile 联网安装，关闭浏览器，实际 taskkill HTTP server，检查 ECONNREFUSED，冷启动 OCR 并保存；连续框选测试也在 HTTP server 已终止时运行。命令、PID、输出均在 acceptance.txt。
- 页面切换、导入取消、失败回滚、复盘遮罩、复习锁、同步合并、模拟 AI 请求、网络超时、SW 更新和存储降级原有用例通过。

## 复现

在仓库目录启动 `python -m http.server 8080`，浏览器打开 http://localhost:8080/app.html。上传整页图片，点“框选题目”，拖动边和四角调整大小、拖动框内移动位置，点“完成”→“先保存原图”→“保存并选下一题”。保存三次后检查错题本是否为三个独立选区。已有安装需先保存编辑内容并接受应用更新。

自动验收使用环境中已安装的 Playwright 和 Edge，不安装项目依赖：

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:BROWSER_EXE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tests/acceptance.cjs
```

## 未完成的范围

- 未用真实手机验证手感、系统相机与键盘遮挡。
- 未实现自动找纸张边缘、四角透视校正、去阴影或自动分题。
- 没有完成 5 张真实题图的公式校正数量与耗时验收。
- AI 服务仍只验证模拟协议，未使用付费 Key 做厂商实测。
