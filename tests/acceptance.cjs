/* Optional browser tests. Uses an existing Playwright installation, never installs project dependencies.
 * PowerShell: $env:PLAYWRIGHT_MODULE='absolute/path/to/playwright'; node tests/acceptance.cjs
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {fork,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'), output=path.join(root,'test-results');
fs.mkdirSync(output,{recursive:true});
const results=[], errors=[];
let revision=false,apiMode='success',browser,server,serverChild,serverPort;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.gz':'application/gzip','.png':'image/png'};
server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/mock-ai/chat/completions'){
    if(apiMode==='fail'){res.writeHead(503);res.end('Unavailable');return;}
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({analysis:'检查配方法中的常数项。',solution:'f(x)=(x−1)²，最小值为 0。',similar:['求 g(x)=x²−4x+5 的最小值。'],advice:'明天再做一次。'})}}]}));return;
  }
  if(url.pathname==='/slow-body'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');return;}
  let name=decodeURIComponent(url.pathname).replace(/^\/sub\//,'/');
  if(name.endsWith('/'))name+='index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-cache');
  if(name==='/sw.js'&&revision){res.end(fs.readFileSync(file,'utf8').replace('personal-v1','acceptance-v3'));return;}
  fs.createReadStream(file).pipe(res);
});
async function startServer(port=0) {
  serverChild=fork(__filename,['--serve',String(port)],{cwd:root,stdio:['ignore','inherit','inherit','ipc']});
  const ready=await new Promise((resolve,reject)=>{serverChild.once('message',resolve);serverChild.once('error',reject)});
  serverPort=ready.port;
  console.log('HTTP_SERVER_READY',JSON.stringify(ready));
}
function killServer() {
  const pid=serverChild.pid;
  console.log('COMMAND: taskkill.exe /PID '+pid+' /T /F');
  const killed=spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{encoding:'utf8'});
  console.log('EXIT_CODE: '+killed.status);console.log(killed.stdout.trim());
  if(killed.stderr)console.log(killed.stderr.trim());
  assert.equal(killed.status,0);serverChild=null;
}
async function verifyServerStopped() {
  const failure=await new Promise(resolve=>{const request=http.get(base+'/app.html',response=>{response.resume();resolve('STILL_RUNNING')});request.on('error',error=>resolve(error.code));request.setTimeout(3000,()=>{request.destroy();resolve('TIMEOUT')})});
  console.log('HTTP_PROBE_AFTER_KILL: '+failure);assert.equal(failure,'ECONNREFUSED');
}
const launch={headless:true};
if(process.env.BROWSER_EXE)launch.executablePath=process.env.BROWSER_EXE;
const profile=path.join(root,'.work','browser-acceptance-'+Date.now());
const test=async(name,fn)=>{await fn();results.push({name,status:'passed'});fs.writeFileSync(path.join(output,'acceptance-progress.json'),JSON.stringify(results,null,2));console.log('PASS',name)};
let context,page,base;
const open=async()=>{
  context=await chromium.launchPersistentContext(profile,{...launch,viewport:{width:1360,height:960}});
  page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
};
const readState=()=>page.evaluate(()=>JSON.stringify(allErrors));
const inputFile=(id,data)=>page.locator(id).setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
async function fixture(lines,filename){
  const data=await page.evaluate(lines=>{
    const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=100+lines.length*130;
    const g=canvas.getContext('2d');g.fillStyle='white';g.fillRect(0,0,canvas.width,canvas.height);g.fillStyle='black';g.font='42px "Microsoft YaHei"';
    lines.forEach((x,i)=>g.fillText(x,60,100+i*130));return canvas.toDataURL('image/png');
  },lines);
  const file=path.join(output,filename);fs.writeFileSync(file,Buffer.from(data.split(',')[1],'base64'));return file;
}
async function recognize(file){
  await page.evaluate(()=>{closeModal();navigateTo('capture')});
  await page.locator('#fileInput').setInputFiles(file);
  await page.waitForFunction(()=>!!capturedImage);
  await page.locator('#btnOcr').click();
  await page.waitForFunction(()=>!ocrBusy,null,{timeout:75000});
  return page.evaluate(()=>({raw:lastOcrRaw,normalized:document.getElementById('formText')?.value||''}));
}
if(process.argv.includes('--serve')) {
  server.listen(Number(process.argv[3])||0,'127.0.0.1',()=>process.send({pid:process.pid,port:server.address().port}));
  process.on('message',message=>{if('revision' in message)revision=message.revision;if('apiMode' in message)apiMode=message.apiMode});
} else (async()=>{
  await startServer();base='http://127.0.0.1:'+serverPort;
  await open();
  await test('Fresh install verifies all 12 offline resources',async()=>{
    await page.goto(base+'/');
    await page.waitForURL(base+'/app.html');
    await page.waitForFunction(()=>offlineReady,null,{timeout:90000});
    assert.equal(await page.locator('#offlineStatus').textContent(),'离线识别已就绪');
    await page.screenshot({path:path.join(output,'home-desktop.png'),animations:'disabled'});
  });
  const plain=await fixture(['已知一辆汽车从静止开始做匀加速直线运动。','加速度为 2 米每秒平方，求 5 秒后的速度。'],'printed-question.png');
  const formula=await fixture(['已知函数 f(x) = x² - 2x + 1，求最小值。','当 x ≥ 0 时，求 √(x + 1) 的取值范围。','计算积分 ∫ x dx。'],'formula-input.png');
  await test('Cold browser restart offline, no OCR warm-up recognition',async()=>{
    await context.close();killServer();await verifyServerStopped();await open();
    const external=[];context.on('request',request=>{if(!request.url().startsWith(base)&&!request.url().startsWith('data:'))external.push(request.url())});
    await page.setViewportSize({width:375,height:812});
    await page.goto(base+'/app.html');await page.waitForFunction(()=>offlineReady);
    await page.screenshot({path:path.join(output,'home-375x812.png'),animations:'disabled'});
    const text=await recognize(plain);
    assert.equal(external.length,0,'Cold offline recognition must not request remote assets');
    console.log('COLD_START_REMOTE_REQUESTS: '+external.length);
    console.log('COLD_START_OCR_TEXT: '+JSON.stringify(text));
    await page.screenshot({path:path.join(output,'capture-375x812.png'),animations:'disabled'});
    assert(text.normalized.includes('汽车') && text.normalized.includes('加速度'));
    fs.writeFileSync(path.join(output,'printed-ocr.json'),JSON.stringify(text,null,2));
    await page.getByRole('button',{name:'保存错题',exact:true}).click();
    await page.waitForFunction(()=>!saveBusy);
    assert.equal(await page.evaluate(()=>allErrors.length),1);
    assert.equal(await page.evaluate(()=>Number.isInteger(allErrors[0].id)),true);
    assert(await page.evaluate(()=>allErrors[0].image.length<1200000));
    console.log('COLD_START_SAVED: '+JSON.stringify(await page.evaluate(()=>({count:allErrors.length,id:allErrors[0].id,imageBytes:allErrors[0].image.length}))));
    await page.locator('[data-page="review"]').click();
    await page.locator('#reviewActions').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'review-375x812.png'),animations:'disabled'});
    const geometry=await page.evaluate(()=>({actions:document.getElementById('reviewActions').getBoundingClientRect().bottom,nav:document.querySelector('.app-nav').getBoundingClientRect().top}));
    assert(geometry.actions<=geometry.nav+1,'Review actions are covered by navigation');
  });
  await test('Five pages, three rounds: no console errors',async()=>{
    for(let n=0;n<3;n++)for(const name of ['home','capture','book','review','profile'])await page.locator(`[data-page="${name}"]`).click();
    assert(!/班级|题库|学生进步榜/.test(await page.locator('#page-profile').textContent()));
    await page.evaluate(()=>{settings.bankGistId='legacy-bank';settings.classGistId='legacy-class';fillSettingsForm();saveSettings()});
    assert.equal(await page.evaluate(()=>settings.bankGistId),'legacy-bank');
    assert.equal(await page.evaluate(()=>settings.classGistId),'legacy-class');
    assert.deepEqual(errors,[]);
  });
  await test('Import cancel and replace confirmation cancel preserve exact data',async()=>{
    const before=await readState();const data=[{text:'导入的题目',subject:'数学'}];
    await inputFile('#importInput',data);await page.locator('#importDialog[open]').waitFor();
    await page.locator('#importDialog button[value="cancel"]').click();
    assert.equal(await readState(),before);
    await inputFile('#importInput',data);await page.locator('#importDialog[open]').waitFor();
    page.once('dialog',d=>d.dismiss());await page.locator('#importDialog button[value="replace"]').click();
    await page.waitForFunction(()=>document.getElementById('importInput').value==='');
    assert.equal(await readState(),before);
  });
  await test('Invalid backup subjects rejected before writing',async()=>{
    const before=await readState();await inputFile('#backupInput',{errors:[],settings:{subjects:'bad'}});
    await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('subjects'));
    assert.equal(await readState(),before);
  });
  await test('Replacement write failure rolls back clear and leaves all records',async()=>{
    const before=await readState();
    await page.evaluate(()=>{window.originalBulkPut=db.errors.bulkPut;db.errors.bulkPut=async()=>{throw new Error('injected write failure')}});
    await inputFile('#importInput',[{text:'替换题目'}]);await page.locator('#importDialog[open]').waitFor();
    page.once('dialog',d=>d.accept());await page.locator('#importDialog button[value="replace"]').click();
    await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('injected'));
    await page.evaluate(()=>{db.errors.bulkPut=window.originalBulkPut});
    assert.equal(await readState(),before);
    assert.equal(await page.evaluate(()=>db.errors.count()),1);
  });
  await test('Five analysis runs including two storage exceptions always release overlay',async()=>{
    for(let n=0;n<5;n++){
      await page.evaluate(async fail=>{
        const original=storeUpdate;
        if(fail)storeUpdate=async()=>{throw new Error('injected storage exception')};
        try{await generateAnalysis(allErrors[0].id,true)}finally{storeUpdate=original}
      },n===1||n===3);
      assert.equal(await page.locator('#processingOverlay').evaluate(el=>el.classList.contains('show')),false);
      assert.equal(await page.evaluate(()=>processingBusy),false);
    }
    assert(await page.locator('#modalContent').innerText().then(t=>t.includes('规则生成')));
    await page.evaluate(()=>closeModal());
  });
  await test('Repeated review click records one rating and does not skip next question',async()=>{
    await page.evaluate(async()=>{await storeAdd({text:'第二道复习题',subject:'数学',status:'new',createdAt:new Date().toISOString()});await loadErrors();navigateTo('review');await Promise.all([rateReview('good'),rateReview('easy'),rateReview('again')])});
    assert.equal(await page.evaluate(()=>allErrors.filter(x=>x.lastReviewedAt).length),1);
    assert.equal(await page.evaluate(()=>reviewIndex),1);
    await page.waitForFunction(()=>!reviewBusy);
  });
  await test('Automatic sync merges newer timestamps without deleting local-only records',async()=>{
    const result=await page.evaluate(async()=>{
      const original=gistApi;const target=allErrors[0];
      settings.syncToken='test-only';settings.syncGistId='test-only';
      gistApi=async()=>({files:{'error-collector-backup.json':{content:JSON.stringify({errors:[{...target,text:'过期内容',updatedAt:'2000-01-01'},{text:'云端新题',syncId:'new-cloud',updatedAt:'2026-10-27'}]})}}});
      try{await syncPull(true);await syncPull(true);return allErrors.map(x=>x.text)}finally{gistApi=original;settings.syncToken='';settings.syncGistId=''}
    });
    assert.equal(result.length,3);assert(!result.includes('过期内容'));assert(result.includes('云端新题'));
  });
  // Synthetic fixture is ONLY an engineering check; not the five-real-photo user timing acceptance.
  const math=await recognize(formula);const symbols=['²','≥','√','∫'];
  results.push({name:'Synthetic formula OCR output (not real-photo correction acceptance)',status:'recorded',correct:symbols.filter(s=>math.normalized.includes(s)),...math});
  fs.writeFileSync(path.join(output,'formula-ocr.json'),JSON.stringify(math,null,2));
  const correctionUi=await page.evaluate(()=>{
    const modal=document.querySelector('.modal-sheet');
    const before=modal.scrollTop;modal.scrollTop=modal.scrollHeight;
    const scrolled=modal.scrollTop>before;
    const marks=document.querySelectorAll('#ocrCorrected mark').length;
    const roiLines=ocrRoiCount, candidate=normalizeOcrText(ocrCandidate || lastOcrRaw);
    acceptOcrCandidate();
    return {roiLines,marks,modalScrollable:scrolled,accepted:document.getElementById('formText').value===candidate,rawPreserved:lastOcrRaw,visionDefaultHidden:!document.querySelector('[onclick="requestVisionReview()"]')};
  });
  assert(correctionUi.roiLines>0);assert(correctionUi.marks>0);assert(correctionUi.accepted);
  assert(correctionUi.modalScrollable);assert(correctionUi.visionDefaultHidden);
  assert.equal(correctionUi.rawPreserved,math.raw);
  console.log('FORMULA_CORRECTION_UI: '+JSON.stringify(correctionUi));
  fs.writeFileSync(path.join(output,'formula-correction-ui.json'),JSON.stringify(correctionUi,null,2));
  await page.screenshot({path:path.join(output,'ocr-desktop.png'),animations:'disabled'});
  await page.evaluate(()=>{closeModal();retakeCapture()});
  await test('Online AI response and failed-network template fallback',async()=>{
    await startServer(serverPort);
    await page.evaluate(endpoint=>{settings.aiEndpoint=endpoint;settings.aiKey=''},base+'/mock-ai');
    await page.evaluate(()=>generateAnalysis(allErrors[0].id,true));
    assert.equal(await page.evaluate(()=>allErrors[0].analysis.source),'ai');
    serverChild.send({apiMode:'fail'});await page.waitForTimeout(100);await page.evaluate(()=>generateAnalysis(allErrors[0].id,true));
    assert.equal(await page.evaluate(()=>allErrors[0].analysis.source),'template');
    await page.evaluate(()=>{closeModal();settings.aiEndpoint='';});
  });
  await test('Network timeout covers a stalled response body',async()=>{
    const elapsed=await page.evaluate(async url=>{const start=Date.now();try{await fetchWithTimeout(url)}catch(e){if(!e.message.includes('超时'))throw e;return Date.now()-start}throw new Error('timeout missing')},base+'/slow-body');
    assert(elapsed>=11500 && elapsed<16000);
  });
  await test('SW update waits for action and retains independent OCR cache',async()=>{
    const cacheBefore=await page.evaluate(()=>caches.keys());serverChild.send({revision:true});await page.waitForTimeout(100);
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
    await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting,null,{timeout:60000});
    assert(await page.evaluate(()=>!!navigator.serviceWorker.controller));
    await page.evaluate(()=>applyUpdate());await page.waitForTimeout(1500);
    await page.waitForFunction(()=>offlineReady);
    const cacheAfter=await page.evaluate(()=>caches.keys());
    assert(cacheAfter.includes(cacheBefore.find(x=>x.startsWith('tf-ocr:'))));
  });
  await test('Offline non-navigation request returns error, not HTML',async()=>{
    killServer();await verifyServerStopped();
    const response=await page.evaluate(async()=>{const r=await fetch('./missing.wasm');return {status:r.status,type:r.headers.get('content-type')}});
    assert.equal(response.status,503);assert(!response.type.includes('html'));
  });
  await page.evaluate(()=>navigateTo('home'));await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:path.join(output,'home-mobile.png'),animations:'disabled'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>navigateTo('capture'));await page.screenshot({path:path.join(output,'capture-mobile.png'),animations:'disabled'});
  await context.close();
  // IndexedDB unavailable: a separate browser context, no real data touched.
  await startServer(serverPort);
  browser=await chromium.launch(launch);context=await browser.newContext();page=await context.newPage();
  await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Disabled for test','SecurityError')}})});
  await test('IndexedDB unavailable: visible fallback and successful local save',async()=>{
    await page.goto(base+'/app.html');await page.waitForFunction(()=>useLocalFallback);
    await page.evaluate(()=>{navigateTo('capture');openSaveModal('本地存储降级测试','数学')});
    await page.getByRole('button',{name:'保存错题',exact:true}).click();await page.waitForFunction(()=>!saveBusy);
    assert.equal(await page.evaluate(()=>allErrors.length),1);assert(await page.locator('#storageNotice').isVisible());
  });
  await browser.close();browser=null;
  fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify({date:new Date().toISOString(),results,consoleErrors:errors,notes:'AI responses are local fixtures, not a live paid API. Physical camera not tested.'},null,2));
  console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(output,'acceptance-failure.txt'),String(e.stack));process.exitCode=1})
.finally(async()=>{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});if(serverChild)serverChild.kill();server.closeAllConnections();server.close()});
