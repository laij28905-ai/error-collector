/* Optional browser tests. Uses an existing Playwright installation, never installs project dependencies.
 * PowerShell: $env:PLAYWRIGHT_MODULE='absolute/path/to/playwright'; node tests/acceptance.cjs
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {fork,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'), output=path.join(root,'test-results');
fs.mkdirSync(output,{recursive:true});
const results=[], errors=[];
let revision=false,apiMode='success',lastAiRequest=null,browser,server,serverChild,serverPort;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.gz':'application/gzip','.png':'image/png'};
server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/mock-ai/last-request'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(lastAiRequest));return;}
  if(url.pathname==='/mock-ai/chat/completions'){
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    lastAiRequest=JSON.parse(body);
    if(apiMode==='fail'){res.writeHead(503);res.end('Unavailable');return;}
    if(apiMode==='unauthorized'){res.writeHead(401);res.end('Unauthorized');return;}
    if(apiMode==='bad-model'){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Model Not Exist'}}));return;}
    res.setHeader('Content-Type','application/json');
    const prompt=JSON.stringify(lastAiRequest.messages);
    const content=prompt.includes('四位数字')?(apiMode==='vision-pass'?'1234':'无法读取'):prompt.includes('只返回题目文字')?'已知函数 f(x)=x²，求 f(2)。':JSON.stringify({analysis:'检查配方法中的常数项。',solution:'f(x)=(x−1)²，最小值为 0。',similar:['求 g(x)=x²−4x+5 的最小值。'],advice:'明天再做一次。'});
    res.end(JSON.stringify({choices:[{message:{content}}]}));});return;
  }
  if(url.pathname==='/slow-body'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');return;}
  let name=decodeURIComponent(url.pathname).replace(/^\/sub\//,'/');
  if(name.endsWith('/'))name+='index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-cache');
  if(name==='/sw.js'&&revision){res.end(fs.readFileSync(file,'utf8').replace('ai-picker-v1','acceptance-v7'));return;}
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
let context,page,base,plain;
const open=async()=>{
  context=await chromium.launchPersistentContext(profile,{...launch,viewport:{width:1360,height:960},hasTouch:true});
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
  await page.evaluate(()=>runOcr());
  await page.waitForFunction(()=>!ocrBusy,null,{timeout:75000});
  return page.evaluate(()=>({raw:lastOcrRaw,normalized:document.getElementById('formText')?.value||''}));
}
if(process.argv.includes('--serve')) {
  server.listen(Number(process.argv[3])||0,'127.0.0.1',()=>process.send({pid:process.pid,port:server.address().port}));
  process.on('message',message=>{if('revision' in message)revision=message.revision;if('apiMode' in message)apiMode=message.apiMode});
} else (async()=>{
  await startServer();base='http://127.0.0.1:'+serverPort;
  await open();
  if(process.argv.includes('--ai-only')) {
    await page.goto(base+'/app.html');await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.setViewportSize({width:375,height:812});
    plain=await fixture(['已知函数 f(x)=x²，求 f(2)。'],'ai-fixture.png');
    await page.evaluate(async image=>{await storeAdd({text:'AI 测试题',subject:'数学',image,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});await loadErrors()},'data:image/png;base64,'+fs.readFileSync(plain).toString('base64'));
    await test('Online AI response and failed-network template fallback',verifyAiWorkflow);
    fs.writeFileSync(path.join(output,'ai-acceptance.json'),JSON.stringify({date:new Date().toISOString(),results,notes:'Existing AI workflow only; local mock, no real paid API or OCR pack download.'},null,2));
    return;
  }
  await test('Fresh install verifies all 12 offline resources',async()=>{
    await page.goto(base+'/');
    await page.waitForURL(base+'/app.html');
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    assert.equal(await page.evaluate(()=>offlineReady),false);
    await page.evaluate(()=>navigateTo('book'));
    assert(await page.getByRole('button',{name:'记一道错题',exact:true}).isVisible());
    await page.evaluate(()=>navigateTo('review'));
    assert(await page.getByText('还没有要复习的题',{exact:true}).isVisible());
    const firstPhoto=await fixture(['第 3 题：用原图记录错题','无需文字识别，也不需要配置模型。'],'photo-first.png');
    await context.close();killServer();await verifyServerStopped();await open();
    await page.goto(base+'/app.html');await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.setViewportSize({width:375,height:812});
    await page.locator('#fileInput').setInputFiles(firstPhoto);await page.waitForFunction(()=>!!capturedImage);
    assert(await page.locator('#btnOcr').isHidden());assert(await page.locator('#btnAiCapture').isHidden());
    await page.locator('#saveImageOnly').click();
    assert.equal(await page.locator('#formText').inputValue(),'');
    await page.getByRole('button',{name:'保存错题',exact:true}).click();await page.waitForFunction(()=>!saveBusy);
    assert.equal(await page.evaluate(()=>allErrors.length),1);
    assert(await page.locator('#captureReceipt').isVisible());
    await page.screenshot({path:path.join(output,'photo-receipt-375x812.png'),animations:'disabled'});
    await page.getByRole('button',{name:'继续选下一题',exact:true}).click();
    assert(await page.locator('#cropStage').isVisible());await page.evaluate(()=>closeModal());
    await page.reload();await page.waitForFunction(()=>allErrors.length===1);
    assert(await page.evaluate(()=>!!allErrors[0].image && !allErrors[0].ocrRaw));
    await page.evaluate(()=>navigateTo('book'));
    assert(await page.locator('.question-thumb').isVisible());
    assert(!(await page.locator('.ec-topic').textContent()).includes('未分类'));
    await page.screenshot({path:path.join(output,'photo-book-375x812.png'),animations:'disabled'});
    await page.locator('#searchInput').fill('不存在的搜索词');
    await page.getByRole('button',{name:'显示全部错题',exact:true}).click();
    assert.equal(await page.locator('.question-thumb').count(),1);
    await page.evaluate(async()=>{await storeDelete(allErrors[0].id);await loadErrors();updateHome();navigateTo('home')});
    console.log('PHOTO_FIRST: server killed; no OCR pack/key; blank optional text saved image; receipt and next crop; reload preserved; thumbnail and empty-state actions verified');
    await startServer(serverPort);
    await page.locator('#prepareOffline').click();
    await page.waitForFunction(()=>offlineReady,null,{timeout:90000});
    assert.equal(await page.locator('#offlineStatus').textContent(),'离线识别已就绪');
    await page.screenshot({path:path.join(output,'home-desktop.png'),animations:'disabled'});
  });
  plain=await fixture(['已知一辆汽车从静止开始做匀加速直线运动。','加速度为 2 米每秒平方，求 5 秒后的速度。'],'printed-question.png');
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
    return {roiLines,low:ocrQuality?.low,marks,modalScrollable:scrolled,accepted:document.getElementById('formText').value===candidate,rawPreserved:lastOcrRaw,visionDefaultHidden:!document.querySelector('[onclick="requestVisionReview()"]')};
  });
  assert(correctionUi.low ? correctionUi.roiLines===0 : correctionUi.roiLines>0);assert(correctionUi.marks>0);assert(correctionUi.accepted);
  assert(correctionUi.modalScrollable);assert(correctionUi.visionDefaultHidden);
  assert.equal(correctionUi.rawPreserved,math.raw);
  console.log('FORMULA_CORRECTION_UI: '+JSON.stringify(correctionUi));
  fs.writeFileSync(path.join(output,'formula-correction-ui.json'),JSON.stringify(correctionUi,null,2));
  await page.screenshot({path:path.join(output,'ocr-desktop.png'),animations:'disabled'});
  await page.evaluate(()=>{closeModal();retakeCapture()});
  await test('Low-quality OCR stays a draft, image fallback saves, mobile editor precedes collapsed comparison',async()=>{
    await page.setViewportSize({width:375,height:812});
    await page.locator('#fileInput').setInputFiles(plain);await page.waitForFunction(()=>!!capturedImage);
    const before=await page.evaluate(()=>allErrors.length);
    const raw=('x2 > U 亦 mir[i]7 砂施小水 1 汁仁河\n').repeat(18);
    await page.evaluate(async raw=>{
      const original=ocrWorker;
      let calls=0;
      ocrWorker={setParameters:async()=>{},recognize:async()=>{if(++calls>1)throw new Error('Low quality must skip ROI retry');return {data:{text:raw,confidence:18,lines:[{text:raw,bbox:{x0:0,y0:0,x1:200,y1:40}}]}}}};
      try{await runOcr()}finally{ocrWorker=original}
    },raw);
    assert.equal(await page.evaluate(()=>ocrRoiCount),0);
    assert(await page.getByText('这次识别结果不可靠',{exact:true}).isVisible());
    assert.equal(await page.locator('.ocr-comparison').evaluate(e=>e.open),false);
    assert(await page.locator('#formText').evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('.ocr-comparison')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    assert.equal(await page.locator('.record-save-form .modal-actions').evaluate(e=>getComputedStyle(e).position),'static');
    await page.locator('#formText').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'ocr-quality-375x812.png'),animations:'disabled'});
    await page.getByRole('button',{name:'保存错题',exact:true}).click();await page.waitForFunction(()=>!saveBusy);
    assert.equal(await page.evaluate(()=>allErrors.length),before);
    await page.locator('.ocr-comparison summary').click();
    const columns=await page.locator('.ocr-diff-grid section').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().left));
    assert.equal(columns[0],columns[1]);
    await page.locator('#ocrTextConfirmed').check();
    await page.locator('#formText').fill('已人工修正');
    assert.equal(await page.locator('#ocrTextConfirmed').isChecked(),false);
    await page.getByRole('button',{name:'清除识别文字，仅保留图片',exact:true}).click();
    assert.equal(await page.evaluate(()=>lastOcrRaw),'');
    assert.equal(await page.locator('#formText').inputValue(),'');
    await page.getByRole('button',{name:'保存错题',exact:true}).click();await page.waitForFunction(()=>!saveBusy);
    assert.equal(await page.evaluate(()=>allErrors.length),before+1);
    assert(await page.evaluate(()=>allErrors.some(e=>e.text==='图片错题' && !!e.image && !e.ocrRaw)));
    await page.locator('#fileInput').setInputFiles(plain);await page.waitForFunction(()=>!!capturedImage);
    await page.evaluate(async()=>{
      const original=ocrWorker;
      ocrWorker={setParameters:async()=>{},recognize:async()=>({data:{text:'',confidence:0}})};
      try{await runOcr()}finally{ocrWorker=original}
    });
    assert.equal(await page.locator('#formText').inputValue(),'待补充题目文字');
    assert(await page.evaluate(()=>!!saveImageSnapshot && !ocrBusy && !processingBusy));
    console.log('OCR_QUALITY: injected confidence=18 warns; no ROI retry; unconfirmed save blocked; 375x812 single-column comparison collapsed; image-only saved without garbage; empty OCR preserves image');
    await page.evaluate(()=>{closeModal();retakeCapture()});
  });
  async function verifyAiWorkflow() {
    if(!serverChild)await startServer(serverPort);
    await page.evaluate(()=>{navigateTo('profile');document.getElementById('aiSettings').open=true;document.getElementById('aiKey').value='previous-provider-key';document.getElementById('aiProvider').value='deepseek';chooseAiService()});
    assert.equal(await page.locator('#aiKey').inputValue(),'');
    assert.equal(await page.locator('#aiModel').inputValue(),'deepseek-flash');
    assert.equal(await page.locator('#aiModelChoice').inputValue(),'deepseek-flash');
    assert(await page.locator('#aiModel').isHidden());
    assert(await page.locator('#aiEndpoint').isHidden());
    for(const [provider,model] of [['openai','gpt-4.1-mini'],['gemini','gemini-3.8-flash'],['qwen','qwen3-vl-plus']]) {
      await page.selectOption('#aiProvider',provider);
      assert.equal(await page.locator('#aiModelChoice').inputValue(),model);
      assert.equal(await page.locator('#aiModel').inputValue(),model);
    }
    assert(await page.locator('#aiEndpoint').isVisible()); // Workspace-specific address stays explicit.
    const beforeAiSettings=await page.evaluate(()=>({...settings}));
    await page.evaluate(()=>{settings.aiEndpoint='https://api.deepseek.com';settings.aiModel='Deepseek-V4.1-Flash';settings.aiKey='mock-existing-key';fillSettingsForm()});
    assert.equal(await page.locator('#aiModelChoice').inputValue(),'__custom');
    assert.equal(await page.locator('#aiModel').inputValue(),'Deepseek-V4.1-Flash');
    await page.selectOption('#aiModelChoice','deepseek-flash');
    assert.equal(await page.locator('#aiKey').inputValue(),'mock-existing-key');
    await page.evaluate(()=>{saveSettings();fillSettingsForm()});
    assert.equal(await page.evaluate(()=>settings.aiModel),'deepseek-flash');
    assert.equal(await page.locator('#aiModelChoice').inputValue(),'deepseek-flash');
    await page.locator('#aiKey').fill('');
    await page.evaluate(()=>document.activeElement.blur());
    await page.waitForFunction(()=>!document.getElementById('toast').classList.contains('show'));
    await page.locator('#aiProvider').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'ai-picker-375x812.png'),animations:'disabled'});
    await page.locator('#aiSettings .btn.primary').scrollIntoViewIfNeeded();
    const saveBox=await page.locator('#aiSettings .btn.primary').boundingBox(),navBox=await page.locator('.app-nav').boundingBox();
    assert(saveBox.y+saveBox.height<=navBox.y);
    await page.screenshot({path:path.join(output,'ai-picker-save-375x812.png'),animations:'disabled'});
    await page.evaluate(original=>{settings=original;persistSettings()},beforeAiSettings);
    await page.selectOption('#aiProvider','custom');
    assert(await page.locator('#aiModel').isVisible());
    assert(await page.locator('#aiEndpoint').isVisible());
    console.log('AI_PICKER: four presets; hidden automatic address/model; legacy model preserved then corrected by selection; same-service key retained; saved choice restored; custom fields available');
    await page.evaluate(endpoint=>{document.getElementById('aiEndpoint').value=endpoint;document.getElementById('aiModel').value='mock-vision';document.getElementById('aiKey').value='';},base+'/mock-ai');
    await page.evaluate(()=>testAiVision());
    assert((await page.locator('#aiTestStatus').textContent()).includes('未正确读出'));
    serverChild.send({apiMode:'vision-pass'});await page.waitForTimeout(100);
    await page.evaluate(async()=>{
      // Deterministic synthetic image for the local mock; never a real service call.
      const original=crypto.getRandomValues;
      crypto.getRandomValues=array=>{array.set([1,2,3,4]);return array};
      try{await testAiVision()}finally{crypto.getRandomValues=original}
    });
    assert((await page.locator('#aiTestStatus').textContent()).includes('识图测试通过'));
    await page.evaluate(()=>saveSettings());
    await page.locator('#aiSettings').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'ai-settings-375x812.png'),animations:'disabled'});
    await page.evaluate(()=>navigateTo('capture'));
    await page.locator('#fileInput').setInputFiles(plain);await page.waitForFunction(()=>!!capturedImage);
    await page.evaluate(()=>runAiCapture());await page.waitForFunction(()=>!ocrBusy);
    assert((await page.locator('#formText').inputValue()).includes('f(x)=x²'));
    await page.evaluate(()=>{closeModal();openDetail(allErrors.find(e=>e.image).id)});
    const savedBefore=await page.evaluate(()=>({id:allErrors.find(e=>e.image).id,image:allErrors.find(e=>e.image).image,count:allErrors.length}));
    await page.locator('.saved-text-tools summary').click();
    await page.getByRole('button',{name:'AI 识图（联网）',exact:true}).click();
    await page.waitForFunction(()=>!processingBusy);
    assert((await page.locator('#savedOcrText').inputValue()).includes('f(x)=x²'));
    assert.equal(await page.evaluate(()=>allErrors.length),savedBefore.count);
    await page.getByRole('button',{name:'确认并保存文字',exact:true}).click();await page.waitForFunction(()=>!saveBusy);
    assert.equal(await page.evaluate(id=>findError(id).image,savedBefore.id),savedBefore.image);
    assert.equal(await page.evaluate(()=>allErrors.length),savedBefore.count);
    assert((await page.evaluate(id=>findError(id).text,savedBefore.id)).includes('f(x)=x²'));
    await page.evaluate(()=>{closeModal();retakeCapture()});
    await page.evaluate(endpoint=>{settings.aiEndpoint=endpoint;settings.aiKey=''},base+'/mock-ai');
    await page.evaluate(()=>generateAnalysis(allErrors.find(e=>e.image).id,true));
    assert.equal(await page.evaluate(()=>allErrors.find(e=>e.image).analysis.source),'ai');
    const sent=await page.evaluate(async()=>{const r=await fetch('./mock-ai/last-request');return r.json()});
    assert(sent.messages[1].content.some(x=>x.type==='image_url'&&x.image_url.url.startsWith('data:image/')));
    console.log('AI_VISION_PAYLOAD: image attached; provider key cleared on switch; incorrect vision probe rejected; capture OCR opened editor');
    serverChild.send({apiMode:'bad-model'});await page.waitForTimeout(100);
    await page.evaluate(()=>testAiVision());assert((await page.locator('#aiTestStatus').textContent()).includes('模型名称不存在'));
    console.log('AI_MODEL_ERROR: HTTP 400 Model Not Exist gives actionable model-selection message');
    serverChild.send({apiMode:'unauthorized'});await page.waitForTimeout(100);
    await page.evaluate(()=>testAiVision());assert((await page.locator('#aiTestStatus').textContent()).includes('Key 无效'));
    serverChild.send({apiMode:'fail'});await page.waitForTimeout(100);await page.evaluate(()=>generateAnalysis(allErrors.find(e=>e.image).id,true));
    assert.equal(await page.evaluate(()=>allErrors.find(e=>e.image).analysis.source),'template');
    await page.evaluate(()=>{closeModal();settings.aiEndpoint='';});
  }
  await test('Online AI response and failed-network template fallback',verifyAiWorkflow);
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
  await test('Mobile touch crop resizes independently and saves three questions from one page offline',async()=>{
    const before=await page.evaluate(()=>allErrors.length);
    const sheet=await fixture(['第 3 题：等比数列','月产量构成等比数列，求总产量。','A. 170  B. 178  C. 182  D. 188','第 6 题：排列计数','五名员工值班，连续两天不能重复。','A. 60  B. 70  C. 80  D. 100','第 16 题：立体几何','已知四棱锥，求直线与平面所成角。','保留几何图和完整条件。'],'crop-sheet.png');
    await page.locator('#fileInput').setInputFiles(sheet);
    await page.waitForFunction(()=>!!capturedPageImage);
    const original=await page.evaluate(()=>capturedPageImage);
    await page.locator('#btnCrop').click();
    const session=await context.newCDPSession(page);
    const touchDrag=async(x,y,dx,dy)=>{
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let n=1;n<=6;n++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/6,y:y+dy*n/6}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    const shape=()=>page.locator('#cropFrame').boundingBox();
    for(let n=0;n<3;n++){
      await page.waitForFunction(()=>document.getElementById('cropImg')?.naturalWidth>0);
      await page.locator('#cropStage').scrollIntoViewIfNeeded();
      const img=await page.locator('#cropImg').boundingBox();
      const stage=await page.locator('#cropStage').boundingBox();
      assert(img.x>=stage.x && img.y>=stage.y && img.y+img.height<=stage.y+stage.height+1,'Full page must fit initially');
      assert.equal(await page.locator('#cropFrame').evaluate(e=>getComputedStyle(e).transform),'none');
      assert.equal(await page.locator('.cf-e').evaluate(e=>e.getBoundingClientRect().width),44);
      let a=await shape();const handle=await page.locator('.cf-e').boundingBox();
      await touchDrag(handle.x+22,handle.y+22,-20,0);
      let b=await shape();assert(b.width<a.width-15);assert(Math.abs(b.height-a.height)<2);
      const south=await page.locator('.cf-s').boundingBox();
      await touchDrag(south.x+22,south.y+22,0,-25);
      let c=await shape();assert(c.height<b.height-20);assert(Math.abs(c.width-b.width)<2);
      await touchDrag(c.x+c.width/2,c.y+c.height/2,0,(n-1)*65);
      const moved=await shape();assert(Math.abs(moved.y-c.y-(n-1)*65)<3);
      assert.deepEqual(await page.locator('#cropImg').boundingBox(),img,'Moving selection must not drag the image');
      if(n===0)await page.screenshot({path:path.join(output,'crop-touch-375x812.png'),animations:'disabled'});
      await page.getByRole('button',{name:'完成',exact:true}).click();
      assert.equal(await page.evaluate(()=>capturedPageImage),original);
      assert.notEqual(await page.evaluate(()=>capturedImage),original);
      await page.locator('#saveImageOnly').click();
      await page.locator('#formText').fill('第 '+[3,6,16][n]+' 题');
      if(n===0){
        await page.evaluate(()=>{window.cropOriginalStoreAdd=storeAdd;storeAdd=async()=>{throw new Error('crop save failure fixture')}});
        await page.getByRole('button',{name:'保存并选下一题',exact:true}).click();
        await page.waitForFunction(()=>!saveBusy);
        assert.equal(await page.evaluate(()=>allErrors.length),before);
        assert.equal(await page.evaluate(()=>capturedPageImage),original);
        assert(await page.locator('#formText').isVisible());
        await page.evaluate(()=>{storeAdd=window.cropOriginalStoreAdd});
      }
      await page.getByRole('button',{name:n<2?'保存并选下一题':'保存错题',exact:true}).click();
      await page.waitForFunction(()=>!saveBusy);
      assert.equal(await page.evaluate(()=>allErrors.length),before+n+1);
      if(n<2)assert(await page.locator('#cropStage').isVisible());
    }
    assert.equal(await page.evaluate(()=>capturedPageImage),null);
    console.log('TOUCH_CROP: 375x812, touch events; width/height independent; full page retained; 3 saves; failed save preserved draft; server stopped');
    await session.detach();
  });
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
