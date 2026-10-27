// node tests/unit.cjs — dependency-free data and OCR normalization checks.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({ console, document:{addEventListener(){}}, window:{}, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync('js/reliability.js','utf8'),context);
vm.runInContext(fs.readFileSync('js/app.js','utf8'),context);
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
