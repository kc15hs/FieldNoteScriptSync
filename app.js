/* FieldNote ScriptSync: all parsing and comparison state stays in browser memory. */
const $ = (id) => document.getElementById(id);
const state = { sourceZip:null, speechZip:null, sourceFile:null, speechFile:null, entries:[], current:0, undo:null, dirty:false, speaking:false, sentence:0, resumeAt:0, composing:false };
const sourceKeys = ['sourceText','originalText','original','body','content','text','本文','元本文'];
const readingKeys = ['readingText','script','narration','speech','tts','読み上げ文章','読み上げ'];
const titleKeys = ['title','name','eventTitle','タイトル'];

function showToast(message){ const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>el.classList.remove('show'),2200); }
function escapeHtml(value){ return value.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function textParts(text){ return text.match(/\r?\n+|[^。！？!?\r\n]+[。！？!?]?/g)||[]; }
function sentences(text){ return textParts(text).filter(part=>!/^\r?\n+$/.test(part)); }
function sourceParagraphs(text){ const result=[];let start=0,breaksBefore=0;const re=/\r?\n{2,}/g;let match;while(match=re.exec(text)){result.push({text:text.slice(start,match.index),breaksBefore});breaksBefore=(match[0].match(/\n/g)||[]).length;start=re.lastIndex;}result.push({text:text.slice(start),breaksBefore});return result; }
function sourceMarkup(text,paired){ let index=0;return sourceParagraphs(text).map((paragraph,p)=>`<span class="source-paragraph" data-paragraph="${p}" style="--paragraph-gap:${Math.max(0,paragraph.breaksBefore-1)}"><span class="paragraph-anchor" data-paragraph="${p}"></span>${textParts(paragraph.text).map(part=>{if(/^\r?\n+$/.test(part))return escapeHtml(part);const i=index++;return segmentHtml(part,paired.includes(i)?'match':'difference',i,'source');}).join('')}</span>`).join(''); }
function readingMarkup(text,paired){ let index=0,paragraph=0,atStart=true;return textParts(text).map(part=>{if(/^\r?\n+$/.test(part)){if((part.match(/\n/g)||[]).length>=2){paragraph++;atStart=true;}return escapeHtml(part);}const anchor=atStart?`<span class="paragraph-anchor" data-paragraph="${paragraph}"></span>`:'';atStart=false;const i=index++;return `${anchor}${segmentHtml(part,paired[i]>=0?'match':'difference',i,'reading')}`;}).join(''); }
function alignSourceParagraphs(){ const source=$('source-text');const reading=$('reading-editor');source.querySelectorAll('.source-paragraph').forEach(item=>item.style.removeProperty('margin-top'));const sourceAnchors=[...source.querySelectorAll('.paragraph-anchor')],readingAnchors=[...reading.querySelectorAll('.paragraph-anchor')];for(let i=1;i<Math.min(sourceAnchors.length,readingAnchors.length);i++){const sourceBlock=sourceAnchors[i].closest('.source-paragraph');const difference=readingAnchors[i].getBoundingClientRect().top-sourceAnchors[i].getBoundingClientRect().top;if(difference>0.5){const base=parseFloat(getComputedStyle(sourceBlock).marginTop)||0;sourceBlock.style.marginTop=`${base+difference}px`;}} }
function words(text){ return text.match(/[ぁ-んァ-ヶー一-龠A-Za-z0-9]+|[^\s]/g)||[]; }
function similarity(a,b){ const aa=new Set(words(a).map(x=>x.toLowerCase())), bb=new Set(words(b).map(x=>x.toLowerCase())); if(!aa.size&&!bb.size)return 1; let common=0; aa.forEach(x=>{if(bb.has(x))common++}); return common/(aa.size+bb.size-common||1); }
function matchIndex(sentence, list, expected){ let best=-1, score=0; list.forEach((item,i)=>{const v=similarity(sentence,item); const proximity=1/(1+Math.abs(i-expected))*.08; if(v+proximity>score){score=v+proximity;best=i}}); return score>.12?best:-1; }
function segmentHtml(text, cls, index, side){ return `<span class="segment ${cls}" data-side="${side}" data-index="${index}">${escapeHtml(text)}</span>`; }
function caretOffset(element){ const selection=window.getSelection(); if(!selection?.rangeCount||!element.contains(selection.anchorNode))return null; const range=selection.getRangeAt(0).cloneRange();range.selectNodeContents(element);range.setEnd(selection.anchorNode,selection.anchorOffset);return range.toString().length; }
function restoreCaret(element,offset){ if(offset===null)return; const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node,remaining=offset;while(node=walker.nextNode()){if(remaining<=node.textContent.length){const range=document.createRange(),selection=window.getSelection();range.setStart(node,remaining);range.collapse(true);selection.removeAllRanges();selection.addRange(range);return;}remaining-=node.textContent.length;} }
function render(){ const event=state.entries[state.current]; if(!event)return; const source=event.source || '', reading=event.reading || '';
  const editor=$('reading-editor'), preserveEditor=document.activeElement===editor, savedScroll=editor.scrollTop, savedPageScroll=window.scrollY, savedCaret=preserveEditor?caretOffset(editor):null;
  $('source-title').classList.remove('playback-title-active'); $('reading-title').classList.remove('playback-title-active');
  $('source-title').textContent=`【${event.id}】${event.sourceTitle||'（タイトルなし）'}`; $('reading-event-number').textContent=`【${event.id}】`; $('reading-title').value=event.title||'';
  const sourceS=sentences(source), readingS=sentences(reading);
  // Source and speech are parallel FieldNote records. Keep their document positions
  // ordered; kana/kanji spelling must not make a later sentence map backwards.
  const paired=readingS.map((_,i)=>sourceS.length?Math.min(sourceS.length-1,Math.floor(i*sourceS.length/Math.max(1,readingS.length))):-1);
  $('source-text').innerHTML=sourceMarkup(source,paired);
  $('reading-editor').innerHTML=readingMarkup(reading,paired);
  if(preserveEditor){ editor.scrollTop=savedScroll;window.scrollTo({top:savedPageScroll});restoreCaret(editor,savedCaret); }
  $('progress').max=readingS.length; $('progress').value=Math.min(state.sentence,readingS.length); $('player').hidden=false;
  bindSegments(paired); $('source-title').onclick=()=>{setPlaybackStart(0);requestAnimationFrame(()=>$('reading-event-number').scrollIntoView({behavior:'smooth',block:'center'}));}; $('reading-event-number').onclick=()=>setPlaybackStart(0); updateDirty();
  if(state.speaking){ if(state.sentence===0){ $('source-title').classList.add('playback-title-active'); $('reading-title').classList.add('playback-title-active');requestAnimationFrame(()=>$('source-title').scrollIntoView({behavior:'smooth',block:'center'})); } else highlight('reading',state.sentence-1,paired); }
}
function setPlaybackStart(position){ if(state.speaking){speechSynthesis.cancel();state.speaking=false;$('play-button').textContent='▶';}state.sentence=position;$('progress').value=position;$('play-label').textContent=position===0?'タイトルから再生':'選択した文から再生';$('source-title').classList.toggle('playback-title-active',position===0);$('reading-title').classList.toggle('playback-title-active',position===0); }
function bindSegments(paired){ document.querySelectorAll('.segment').forEach(el=>el.addEventListener('click',()=>{const side=el.dataset.side,index=Number(el.dataset.index);highlight(side,index,paired);const readingIndex=side==='reading'?index:paired.findIndex(x=>x===index);if(readingIndex>=0)setPlaybackStart(readingIndex+1);if(side==='source'&&readingIndex>=0)revealMarker('reading',readingIndex);})); }
function revealMarker(side,index){ const marker=document.querySelector(`.segment[data-side="${side}"][data-index="${index}"]`);if(marker)requestAnimationFrame(()=>marker.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})); }
function highlight(side,index,paired){ document.querySelectorAll('.segment.active').forEach(x=>x.classList.remove('active')); const other=side==='reading'?paired[index]:paired.findIndex(x=>x===index); document.querySelectorAll(`.segment[data-side="${side}"][data-index="${index}"]`).forEach(x=>x.classList.add('active')); if(other>=0) document.querySelectorAll(`.segment[data-side="${side==='reading'?'source':'reading'}"][data-index="${other}"]`).forEach(x=>x.classList.add('active')); if(state.speaking&&other>=0)revealMarker(side==='reading'?'source':'reading',other); }
function getReading(){ return $('reading-editor').textContent; }
function updateEvent(){ const e=state.entries[state.current]; e.reading=getReading().replace(/\r?\n/g,e.lineEnding); e.title=$('reading-title').value.trim(); state.dirty=true; updateDirty(); }
function updateDirty(){ $('dirty-mark').hidden=!state.dirty; $('save-button').disabled=!state.speechZip; }
function dialog(title,message,action){ $('dialog-title').textContent=title;$('dialog-message').textContent=message; const d=$('confirm-dialog'); $('dialog-confirm').onclick=()=>action(); d.showModal(); }

async function loadPair(){ if(!state.sourceFile||!state.speechFile)return; if(!window.JSZip){showToast('ZIPライブラリを読み込めませんでした。ネットワーク接続を確認してください。');return;} try{ state.sourceZip=await JSZip.loadAsync(state.sourceFile);state.speechZip=await JSZip.loadAsync(state.speechFile);state.entries=[];
  const sources={}; for(const f of Object.values(state.sourceZip.files).filter(f=>/events\/\d+\/event\.json$/i.test(f.name))){try{const raw=await f.async('text'),data=JSON.parse(raw),id=String(data.id||f.name.match(/events\/(\d+)/i)[1]);sources[id]=data;}catch{}}
  const speechFile=Object.values(state.speechZip.files).find(f=>!f.dir&&/speech\.json$/i.test(f.name)); if(!speechFile)throw new Error('speech.json が見つかりません');
  const speechRoot=JSON.parse(await speechFile.async('text')); for(const [id,item] of Object.entries(speechRoot.events||{})){const source=sources[id];if(source&&typeof item.body==='string')state.entries.push({id,path:speechFile.name,root:speechRoot,trail:['events',id],sourceKey:'body',readingKey:'body',titleKey:'title',source:source.body||'',reading:item.body,lineEnding:item.body.includes('\r\n')?'\r\n':'\n',title:item.title||source.title||id,sourceTitle:source.title||''});}
  if(!state.entries.length){ $('schema-notice').hidden=false;$('schema-notice').textContent='本文ZIPとspeech ZIPで共通するイベントを検出できませんでした。'; return; }
  state.current=0;state.dirty=false;$('empty-state').hidden=true;$('workspace').hidden=false;$('schema-notice').hidden=false;$('schema-notice').textContent=`${state.entries.length}件のイベント候補を検出しました。編集内容は保存するまでZIPへ反映されません。`;
  $('event-select').innerHTML=state.entries.map((e,i)=>`<option value="${i}">【${e.id}】${escapeHtml(e.title||e.path)}</option>`).join('');$('file-status').textContent=`本文: ${state.sourceFile.name} ／ 読み上げ: ${state.speechFile.name}`;render();
 }catch(err){console.error(err);showToast('ZIPを開けませんでした。');} }
function findCandidates(node,path,root,trail){ if(Array.isArray(node)){node.forEach((x,i)=>findCandidates(x,path,root,trail.concat(i)));return;} if(!node||typeof node!=='object')return;
 const keys=Object.keys(node), sourceKey=keys.find(k=>sourceKeys.includes(k)), readingKey=keys.find(k=>readingKeys.includes(k));
 if(sourceKey&&readingKey&&typeof node[sourceKey]==='string'&&typeof node[readingKey]==='string') state.entries.push({path,root,trail,sourceKey,readingKey,titleKey:keys.find(k=>titleKeys.includes(k)),source:node[sourceKey],reading:node[readingKey],title:node[keys.find(k=>titleKeys.includes(k))]||path});
 else keys.forEach(k=>findCandidates(node[k],path,root,trail.concat(k)));
}
function replaceAt(root,trail,value){ let cursor=root; for(let i=0;i<trail.length;i++)cursor=cursor[trail[i]]; return cursor; }
async function saveZip(){ for(const e of state.entries){ const target=replaceAt(e.root,e.trail);target[e.readingKey]=e.reading;if(e.titleKey)target[e.titleKey]=e.title; state.speechZip.file(e.path,JSON.stringify(e.root,null,2)); }
 const blob=await state.speechZip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}); const name=state.speechFile.name;
 try{ if(window.showSaveFilePicker){const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'ZIP file',accept:{'application/zip':['.zip']}}]});const writable=await handle.createWritable();await writable.write(blob);await writable.close();}else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);} state.dirty=false;updateDirty();showToast('ZIPを保存しました。');}catch(err){if(err.name!=='AbortError')showToast('保存できませんでした。');}
}
function setReading(value){ state.undo={reading:getReading(),title:$('reading-title').value}; $('reading-editor').innerText=value; updateEvent();render(); }
function copy(text){navigator.clipboard.writeText(text).then(()=>showToast('クリップボードにコピーしました。')).catch(()=>showToast('コピーが許可されていません。'));}
function speak(){ const event=state.entries[state.current], list=[event.title,...sentences(getReading())].filter(Boolean); if(!list.length)return; if(state.speaking){speechSynthesis.cancel();state.speaking=false;$('play-button').textContent='▶';$('play-label').textContent='一時停止';render();return;} state.speaking=true;$('play-button').textContent='❚❚'; const start=Number($('progress').value)||0;
 const next=(i)=>{if(!state.speaking||i>=list.length){state.speaking=false;$('play-button').textContent='▶';$('play-label').textContent='再生待機中';render();return;}state.sentence=i;$('progress').value=i;render(); const u=new SpeechSynthesisUtterance(list[i]);u.lang='ja-JP';u.rate=Number($('rate').value);u.onend=()=>next(i+1);speechSynthesis.speak(u);};next(start);
}

function acceptFile(file){
  if(!file)return;
  // Either picker accepts either role. The filename makes the role unambiguous for FieldNote exports.
  const isSpeech=/_speech\.zip$/i.test(file.name);
  if(isSpeech) state.speechFile=file; else state.sourceFile=file;
  const missing=isSpeech?'sourceFile':'speechFile';
  if(!state[missing]){
    showToast(isSpeech?'本文編集ZIPを続けて選択してください。':'speech ZIPを続けて選択してください。');
    // Browsers prohibit reading sibling files automatically, so prompt for the paired file immediately.
    setTimeout(()=>$(`${isSpeech?'source':'speech'}-input`).click(),0);
  } else loadPair();
}
$('source-input').addEventListener('change',e=>acceptFile(e.target.files[0]));
$('speech-input').addEventListener('change',e=>acceptFile(e.target.files[0]));
$('event-select').addEventListener('change',e=>{speechSynthesis.cancel();state.current=Number(e.target.value);state.sentence=0;render();});
function scheduleComparison(){ clearTimeout(state.renderTimer);state.renderTimer=setTimeout(render,500); }
$('reading-editor').addEventListener('compositionstart',()=>{state.composing=true;clearTimeout(state.renderTimer);});
$('reading-editor').addEventListener('compositionend',()=>{state.composing=false;updateEvent();scheduleComparison();});
$('reading-editor').addEventListener('input',()=>{if(state.composing)return;updateEvent();scheduleComparison();}); $('reading-title').addEventListener('input',updateEvent);
$('source-copy').onclick=()=>{const e=state.entries[state.current];copy(`元本文\n${e.sourceTitle}\n${e.source}\n\n読み上げ文章\n${$('reading-title').value}\n${getReading()}`)};
$('reading-copy').onclick=()=>{copy(getReading());$('reading-paste').disabled=false};
$('reading-paste').onclick=async()=>{try{const text=await navigator.clipboard.readText(),old=getReading();const large=similarity(old,text)<.35;if(large)dialog('読み上げ文章を置き換えますか？','現在の文章と大きく異なる内容です。現在の内容は1回だけ元に戻せます。',()=>setReading(text));else setReading(text);}catch{showToast('クリップボードの読み取りが許可されていません。');}};
$('delete-button').onclick=()=>{if(!getReading())return;dialog('読み上げ文章を削除しますか？','現在の読み上げ文章を空にします。直前の状態は1回だけ復元できます。',()=>setReading(''));};
$('undo-button').onclick=()=>{if(!state.undo)return;$('reading-editor').innerText=state.undo.reading;$('reading-title').value=state.undo.title;state.undo=null;updateEvent();render();$('undo-button').disabled=true;};
const oldSet=setReading; setReading=(value)=>{oldSet(value);$('undo-button').disabled=false};
$('save-button').onclick=()=>dialog('このZIPファイルを上書き保存しますか？','元のデータが更新されます。',saveZip);
$('play-button').onclick=speak;$('progress').oninput=()=>{speechSynthesis.cancel();state.speaking=false;$('play-button').textContent='▶';state.sentence=Number($('progress').value);render();};
