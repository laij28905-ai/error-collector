/* Practice records belong to their source question; images and feedback stay in backups. */
let practiceBusy = false, practiceSession = null;
const practiceDrafts = new Map();

function practiceQuestionKey(item, index) {
  return JSON.stringify([item.analysis?.generatedAt || '', index, item.analysis?.similar?.[index] || '']);
}
function practiceReturnLocation() {
  return { page: currentPage, scroll: document.getElementById('appContent').scrollTop,
    detailId: currentDetailId, modalScroll: document.querySelector('.modal-sheet').scrollTop };
}
function stashPracticeDraft() {
  if (!practiceSession || practiceSession.viewOnly) return;
  const field = document.getElementById('practiceAnswer');
  if (field) practiceSession.answerText = field.value;
  const key = practiceSession.parentId + ':' + practiceSession.questionKey;
  if (practiceSession.answerText.trim() || practiceSession.answerImage) practiceDrafts.set(key, {...practiceSession});
  else practiceDrafts.delete(key);
}
function hasPracticeDraft() {
  if (currentPage === 'practice') stashPracticeDraft();
  return practiceDrafts.size > 0;
}
function openSimilarPractice(id, index) {
  if (practiceBusy || processingBusy || saveBusy) return;
  const item = findError(id), question = item?.analysis?.similar?.[index];
  if (typeof question !== 'string' || !question.trim()) return;
  const back = practiceReturnLocation(), key = practiceQuestionKey(item,index);
  const draft = practiceDrafts.get(id + ':' + key);
  const previous = (item.practiceAttempts || []).filter(a => a.questionKey === key).at(-1);
  closeModal(); navigateTo('practice');
  practiceSession = draft ? {...draft, back} : previous ? {...previous, parentId:id, attemptId:previous.id, viewOnly:true, back}
    : {parentId:id, questionKey:key, question, originSource:item.analysis.source === 'ai' ? 'ai' : 'template', answerText:'', answerImage:'', attemptId:null, viewOnly:false, back};
  renderPractice();
}
function practiceRecords() {
  return allErrors.flatMap(item => (item.practiceAttempts || []).map(attempt => ({item,attempt})))
    .sort((a,b)=>Date.parse(b.attempt.updatedAt)-Date.parse(a.attempt.updatedAt));
}
function openPracticeHistory() {
  if (practiceBusy) return;
  closeModal(); navigateTo('practice-history'); renderPracticeHistory();
}
function openPracticeAttempt(parentId, attemptId) {
  if (practiceBusy) return;
  const attempt = findError(parentId)?.practiceAttempts?.find(a => a.id === attemptId);
  if (!attempt) { showToast('这条练习记录已不存在'); return; }
  const back = practiceReturnLocation();
  closeModal(); navigateTo('practice');
  practiceSession = {...attempt, parentId, attemptId, viewOnly:true, back}; renderPractice();
}
function startPracticeAgain() {
  if (!practiceSession || practiceBusy) return;
  practiceSession = {...practiceSession, attemptId:null, viewOnly:false, answerText:'', answerImage:'', feedback:null, error:''};
  renderPractice();
}
function returnFromPractice() {
  if (practiceBusy) return;
  stashPracticeDraft();
  const back = practiceSession?.back || {page:'home',scroll:0};
  navigateTo(back.page === 'practice' ? 'practice-history' : back.page);
  document.getElementById('appContent').scrollTop = back.scroll || 0;
  if (back.detailId && findError(back.detailId)) {
    openDetail(back.detailId);
    requestAnimationFrame(()=>{document.querySelector('.modal-sheet').scrollTop = back.modalScroll || 0;});
  }
}
function practiceStatusLabel(a) { return a.feedback ? 'AI 已分析 · 待核对' : a.status === 'error' ? '分析未完成 · 作答已保存' : '作答已保存'; }
function practiceRecordCard(item, attempt) {
  return `<button class="practice-history-card" onclick="openPracticeAttempt(${item.id},'${attempt.id}')"><strong>${escapeHtml(questionTitle(item))}</strong><span class="practice-question-excerpt">${escapeHtml(shortText(attempt.question,100))}</span><small>${escapeHtml(dateLabel(attempt.updatedAt))} · ${practiceStatusLabel(attempt)}${attempt.answerImage ? ' · 含作答照片' : ''}</small></button>`;
}
function renderHomePractice() {
  const element = document.getElementById('homePractice');
  if (!element) return;
  const records = practiceRecords();
  element.innerHTML = records.length ? `<p class="field-help">已保存 ${records.length} 次作答</p>` + records.slice(0,3).map(({item,attempt})=>practiceRecordCard(item,attempt)).join('')
    : '<p class="field-help">在错题详情中打开一道举一反三练习，保存作答后会出现在这里。</p>';
}
function renderPracticeHistory() {
  const records = practiceRecords();
  document.getElementById('practiceHistoryList').innerHTML = records.length ? records.map(({item,attempt})=>practiceRecordCard(item,attempt)).join('')
    : '<div class="empty-state"><div class="es-title">还没有练习记录</div><p>先到错题详情，选择一道举一反三题目。</p><button class="btn primary" onclick="navigateTo(\'book\')">去错题本</button></div>';
}
function renderPractice(preserveScroll = false) {
  const s = practiceSession, item = s && findError(s.parentId);
  if (!s || !item) { openPracticeHistory(); return; }
  const scroll = document.getElementById('appContent').scrollTop;
  const record = s.attemptId && item.practiceAttempts?.find(a=>a.id===s.attemptId);
  const feedback = record?.feedback;
  const disabled = practiceBusy ? 'disabled' : '';
  document.getElementById('practiceContent').innerHTML = `
    <button class="text-btn practice-back" onclick="returnFromPractice()" ${disabled}>← 返回${s.back?.detailId ? '原题' : '练习列表'}</button>
    <p class="field-help">来自 ${escapeHtml(questionTitle(item))} · ${s.originSource === 'ai' ? 'AI 生成练习，请核对条件' : '规则生成练习'}</p>
    <div class="practice-panel"><h2>这道题，自己试一次</h2><div class="modal-text">${escapeHtml(s.question)}</div></div>
    <div class="practice-panel"><h3>我的作答</h3>
      ${s.viewOnly ? `<div class="modal-text">${escapeHtml(record?.answerText || '已提交作答照片')}</div>` : '<label class="field-label" for="practiceAnswer">写下答案或解题过程</label><textarea id="practiceAnswer" rows="5" maxlength="10000" '+disabled+' placeholder="可以输入文字，也可以拍下纸上的作答" oninput="stashPracticeDraft()">'+escapeHtml(s.answerText || '')+'</textarea>'}
      ${s.answerImage ? `<img class="practice-answer-image" src="${imageHtml(s.answerImage)}" alt="提交的作答原图">` : ''}
      ${!s.viewOnly ? `<div class="practice-actions"><button class="btn outline" onclick="document.getElementById('practiceCamera').click()" ${disabled}>拍照提交</button><button class="btn outline" onclick="document.getElementById('practiceAlbum').click()" ${disabled}>选择作答照片</button>${s.answerImage ? '<button class="text-btn" onclick="removePracticeImage()">移除照片</button>' : ''}</div><input id="practiceCamera" type="file" accept="image/*" capture="environment" hidden onchange="readPracticeImage(this)"><input id="practiceAlbum" type="file" accept="image/*" hidden onchange="readPracticeImage(this)"><p class="field-help">手写内容请拍清楚。AI 识读可能有误，结果需要对照原图核对。保存前的草稿只保留在本次打开的页面中。</p>` : ''}
    </div>
    <p id="practiceStatus" class="field-help" role="status">${practiceBusy ? '正在处理，作答保存后才会发送给 AI…' : record ? practiceStatusLabel(record) : '先保存作答，再请求 AI。失败也能回来继续。'}</p>
    ${record?.error && !practiceBusy ? `<p class="practice-error">${escapeHtml(record.error)}</p>` : ''}
    ${feedback ? `<div class="practice-panel practice-feedback"><h3>AI 分析 <small>请核对</small></h3><p class="field-help">${({correct:'模型判断：正确',partial:'模型判断：部分正确',incorrect:'模型判断：存在错误',uncertain:'模型无法可靠判断，请补充清晰作答'})[feedback.verdict]}</p><h4>AI 读到的作答</h4><div class="modal-text">${escapeHtml(feedback.recognizedAnswer || '未能可靠识读，请对照照片核对')}</div><h4>分析与建议</h4><div class="modal-text">${escapeHtml(feedback.analysis)}</div><h4>AI 参考答案</h4><div class="modal-text">${escapeHtml(feedback.referenceAnswer)}</div></div>` : ''}
    <div class="practice-actions">${s.viewOnly ? `<button class="btn outline" onclick="startPracticeAgain()" ${disabled}>再做一次</button>${!feedback ? `<button class="btn primary" onclick="submitPractice(true)" ${disabled}>${navigator.onLine ? '请 AI 分析这次作答' : '联网后可请求 AI 分析'}</button>` : ''}` : `<button class="btn outline" onclick="submitPractice(false)" ${disabled}>保存作答</button><button class="btn primary" onclick="submitPractice(true)" ${disabled}>提交 AI 分析</button>`}</div>
    <p class="field-help">AI 使用你配置的模型，会发送本题和本次作答，并产生服务商用量；离线也可保存。</p>`;
  if (preserveScroll) document.getElementById('appContent').scrollTop = scroll;
}
async function readPracticeImage(input) {
  const file = input.files?.[0], session = practiceSession;
  if (!file || practiceBusy || !session || session.viewOnly) return;
  stashPracticeDraft(); practiceBusy = true; renderPractice(true);
  try {
    if (file.size > 25000000) throw Error('照片过大，请只拍本题作答');
    const data = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('照片读取失败'));reader.readAsDataURL(file);});
    const image = await compressImage(data);
    if (practiceSession !== session) return;
    session.answerImage = image; stashPracticeDraft();
  } catch (error) { notifyFailure(error); }
  finally { practiceBusy = false; renderPractice(true); }
}
function removePracticeImage() {
  if (practiceBusy || !practiceSession || practiceSession.viewOnly) return;
  stashPracticeDraft(); practiceSession.answerImage=''; stashPracticeDraft(); renderPractice(true);
}
async function savePracticeRecord(record) {
  const item = findError(practiceSession.parentId);
  if (!item) throw Error('原题已被删除，无法保存练习');
  const records = [...(item.practiceAttempts || [])], index = records.findIndex(a=>a.id===record.id);
  if (index < 0) records.push(record); else records[index] = record;
  const valid = normalizePracticeAttempts(records);
  await storeUpdate(item.id,{practiceAttempts:valid});
  await loadErrors(); updateHome();
}
function parsePracticeFeedback(text) {
  let data;
  try { data=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')); }
  catch (_) { throw Error('AI 返回的分析格式不完整，作答已保留，可稍后重试'); }
  if (!data || typeof data.analysis !== 'string' || !data.analysis.trim() || typeof data.referenceAnswer !== 'string' || !data.referenceAnswer.trim()) throw Error('AI 未返回完整分析和参考答案，作答已保留');
  return {recognizedAnswer:typeof data.recognizedAnswer==='string'?data.recognizedAnswer.slice(0,12000):'',analysis:data.analysis.slice(0,12000),referenceAnswer:data.referenceAnswer.slice(0,12000),verdict:['correct','partial','incorrect','uncertain'].includes(data.verdict)?data.verdict:'uncertain'};
}
async function submitPractice(withAi) {
  if (practiceBusy || processingBusy || saveBusy || !practiceSession) return;
  stashPracticeDraft();
  const s=practiceSession, now=new Date().toISOString();
  let record=s.viewOnly ? findError(s.parentId)?.practiceAttempts?.find(a=>a.id===s.attemptId) : null;
  if (!s.viewOnly && !s.answerText.trim() && !s.answerImage) { showToast('请先填写答案或添加作答照片');return; }
  if (!record) record={id:crypto.randomUUID(),questionKey:s.questionKey,question:s.question,originSource:s.originSource,answerText:s.answerText.trim(),answerImage:s.answerImage,createdAt:now,updatedAt:now,status:'saved',feedback:null,error:''};
  practiceBusy=true; renderPractice(true);
  try {
    await savePracticeRecord(record); // Do not send anything if local persistence fails.
    practiceDrafts.delete(s.parentId+':'+s.questionKey);
    s.attemptId=record.id; s.viewOnly=true;
    renderPractice(true);
    if (!withAi) { showToast('练习已保存，可在首页查看'); return; }
    if (!navigator.onLine || !canUseAi()) { showToast(navigator.onLine ? '作答已保存，请先在“我的”配置识图模型' : '当前离线，作答已保存，联网后可继续分析'); return; }
    try {
      const response=await requestAi([
        {role:'system',content:'你是高中练习辅导老师。这是举一反三作答分析任务。仅分析本次给出的练习，不要替换成原错题。图片是学生手写作答：先忠实识读，符号或步骤看不清必须明确指出，不能猜测补全。分析正确部分、错误或缺失步骤，再给可核对的参考答案。条件不足时明确说明，verdict 为 uncertain。只返回 JSON：recognizedAnswer（读到的学生作答），analysis（具体反馈），referenceAnswer（参考解法或缺少哪些条件），verdict（correct/partial/incorrect/uncertain）。'},
        {role:'user',content:aiUserContent(`练习题：${record.question}\n学生输入的作答：${record.answerText || '请读取附图中的手写作答'}\n${record.answerImage ? '附图仅为本题学生作答，请先核对识读内容。' : '本次未附图片。'}`,record.answerImage)}
      ]);
      record={...record,feedback:parsePracticeFeedback(response),status:'ai',error:'',updatedAt:new Date().toISOString()};
    } catch (error) { record={...record,status:'error',error:error.message,updatedAt:new Date().toISOString()}; }
    await savePracticeRecord(record);
  } catch (error) { notifyFailure(error); }
  finally { practiceBusy=false; renderPractice(true); }
}
window.addEventListener('beforeunload',event=>{if (hasPracticeDraft() || practiceBusy) {event.preventDefault();event.returnValue='';}});
