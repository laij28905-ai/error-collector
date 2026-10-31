// node tests/unit.cjs — dependency-free data and OCR normalization checks.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({ console, URL, document:{addEventListener(){}}, window:{}, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync('js/reliability.js','utf8'),context);
vm.runInContext(fs.readFileSync('js/ai-client.js','utf8'),context);
vm.runInContext(fs.readFileSync('js/app.js','utf8'),context);
vm.runInContext(fs.readFileSync('js/ocr-review.js','utf8'),context);
const run=code=>JSON.parse(JSON.stringify(vm.runInContext(code,context)));
const samples = [
  ['f(x)=x^2; x >= 0', 'f(x)=x²; x ≥ 0'],
  ['x <= 2; sqrt(x+1); \\int x dx', 'x ≤ 2; √(x+1); ∫ x dx'],
  ['\\frac{1}{x+1}', '(1)/(x+1)'],
  ['已 知 函 数（x），求 值。','已知函数(x)，求值。'],
  ['x2 > V; 一; f(W)', 'x2 > V; 一；f(W)']
];
for(const [input,expected] of samples) assert.equal(run(`normalizeOcrText(${JSON.stringify(input)})`),expected);
assert.throws(()=>run('normalizeSettings({subjects:"数学"}, true)'),/subjects/);
assert.deepEqual(run('normalizeSettings({subjects:"数学"}).subjects'),['数学','物理','化学','生物','英语']);
assert.throws(()=>run('normalizeRecords([{text:5}])'),/无效/);
assert.throws(()=>run('normalizeRecords([{text:"题目",paperName:5}])'),/paperName/);
assert.throws(()=>run('normalizeRecords([{text:"题目",questionNo:[]}])'),/questionNo/);
assert.throws(()=>run('normalizeRecords([{text:"题目",paperName:"x".repeat(121)}])'),/过长/);
assert.equal(run('normalizeRecords([{text:"旧记录"}])[0].paperName'),'');
assert.equal(run('mergeRecords([] ,normalizeRecords([{text:"原题",paperName:"九月调考",questionNo:"16（2）"}]))[0].questionNo'),'16（2）');
assert.throws(()=>run('normalizeRecords([{id:"1);alert(1)",text:"题目"}])'),/ID/);
assert.throws(()=>run('normalizeRecords([{text:"题目",image:"javascript:alert(1)"}])'),/图片/);
assert.equal(run('safeImageUrl("data:image/svg+xml;base64,PHN2Zz4=")'),'');
assert.equal(run('safeImageUrl("https://example.com/tracker.png")'),'');
const local=[{id:1,syncId:'same',text:'本地较新',createdAt:'2026-01-01',updatedAt:'2026-10-27'},{id:2,syncId:'local',text:'本地独有',updatedAt:'2026-10-26'}];
const incoming=[{id:1,syncId:'same',text:'云端旧版',updatedAt:'2026-10-25'},{id:2,syncId:'remote',text:'另一设备新增',updatedAt:'2026-10-26'}];
const merged=run(`mergeRecords(${JSON.stringify(local)},normalizeRecords(${JSON.stringify(incoming)}))`);
assert.equal(merged.length,3);assert.equal(merged[0].text,'本地较新');assert.equal(merged[2].id,3);
assert.equal(run(`mergeRecords(${JSON.stringify(merged)},normalizeRecords(${JSON.stringify(incoming)})).length`),3);
assert.equal(run(`mergeRecords(${JSON.stringify(local)},normalizeRecords([{syncId:'same',text:'云端新版',updatedAt:'2026-10-28'}]))[0].text`),'云端新版');
console.log('PASS: 5 OCR normalization pairs; unsafe/invalid input rejected; newer-wins merge, ID collision and repeat-import checks.');
assert.equal(run('aiBaseUrl("https://api.example.com/v1/chat/completions/")'),'https://api.example.com/v1');
for(const address of ['http://api.example.com','https://user:secret@api.example.com','https://api.example.com?key=secret','https://{WorkspaceId}.example.com']) assert.throws(()=>run(`aiBaseUrl(${JSON.stringify(address)})`));
assert.throws(()=>run('aiConfig({aiEndpoint:"https://api.example.com",aiModel:"vision",aiKey:""})'),/Key/);
assert.equal(run('inferAiService("https://api.deepseek.com/v1/chat/completions")'),'deepseek');
assert.equal(run('inferAiService("https://api.deepseek.com.attacker.example")'),'custom');
assert.equal(run('inferAiService("https://space-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1")'),'qwen');
assert.match(run('aiFailureHint(400,{error:{message:"Model Not Exist"}})'),/模型名称不存在/);
assert.match(run('aiFailureHint(402,null)'),/余额/);
assert.match(run('aiFailureHint(429,{error:{code:"insufficient_quota"}})'),/余额或配额/);
assert.match(run('aiFailureHint(400,{error:{message:"unknown, echoed secret-key"}})'),/HTTP 400/);
assert(!run('aiFailureHint(400,{error:{message:"unknown, echoed secret-key"}})').includes('secret-key'));
assert.equal(run('aiUserContent("题目","data:image/png;base64,YQ==")[1].image_url.url'),'data:image/png;base64,YQ==');
assert.throws(()=>run('aiUserContent("题目","https://example.com/tracker.png")'),/题图/);
assert.equal(run('aiResponseText({choices:[{message:{content:[{type:"text",text:"答案"}]}}]})'),'答案');
assert.throws(()=>run('aiResponseText({choices:[{message:{content:""}}]})'),/有效内容/);
assert.throws(()=>run('aiResponseText({choices:[{message:{content:"未完成"},finish_reason:"length"}]})'),/截断/);
console.log('PASS: AI URL/key validation, image payload, multipart and invalid-response handling.');
assert.equal(run('assessOcrQuality({text:"清晰印刷内容",confidence:90}).low'),false);
assert.equal(run('assessOcrQuality({text:"乱码仍有输出",confidence:22}).low'),true);
assert.equal(run('assessOcrQuality({text:" ",confidence:90}).low'),true);
assert.equal(run('assessOcrQuality({text:"score unavailable"}).confidence'),null);
assert.equal(run('assessOcrQuality({text:"weak words",confidence:85,words:Array.from({length:6},()=>({text:"x",confidence:20}))}).low'),true);
console.log('PASS: OCR quality warning handles low scores, empty output and weak words; score is not accuracy.');
