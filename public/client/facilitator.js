import {readAccess,rememberAccess,forgetAccess,accessLink} from './facilitator-access.js';
const $=id=>document.getElementById(id);
let key=readAccess(),current=null,next=null,backupRevision=null,busy=false,selectionRequest=0;
const initialRoom=new URLSearchParams(location.search).get('room');
function status(text){$('status').textContent=text;}
async function request(path,{body}={}){const response=await fetch('/api/facilitator/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Request failed.');return result;}
function download(value,filename,type='application/json'){const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value)],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function showUnlocked(value){$('unlock').hidden=value;$('dashboard').hidden=!value;$('save-access').hidden=!value;$('lock').hidden=!value;}
function roomButton(room){const b=document.createElement('button');b.dataset.code=room.code;b.setAttribute('aria-pressed',String(current?.code===room.code));const code=document.createElement('strong');code.textContent=room.code;const count=document.createElement('small');count.textContent=`${room.participants} participants · ${room.sources} sources${room.expiresAt<Date.now()?' · Expired':''}`;b.append(code,count);b.onclick=()=>selectRoom(room.code);return b;}
async function rooms(append=false){const result=await request('rooms'+(append&&next?'?after='+encodeURIComponent(next):''));if(!append)$('rooms').replaceChildren();$('rooms').append(...result.rooms.map(roomButton));next=result.next;$('more').hidden=!next;}
async function open(){try{status('Loading rooms…');await rooms();showUnlocked(true);status('');if(initialRoom)await selectRoom(initialRoom);}catch(e){showUnlocked(false);status(e.message);}}
async function selectRoom(code){const operation=++selectionRequest;try{status('Loading room…');const result=await request('rooms/'+code);if(operation!==selectionRequest)return;current=result;renderRoom();status('');history.replaceState(null,'','/facilitator?room='+encodeURIComponent(code));}catch(e){if(operation===selectionRequest)status(e.message);}}
function renderRoom(){
  $('room').hidden=false;$('empty').hidden=true;$('room-title').textContent=current.code;$('room-code').value=current.code;
  $('room-meta').textContent=`${current.data.poems.length} participants · ${current.data.sources.length} sources · ${current.expiresAt<Date.now()?'Expired room — saved data retained':'Current saved work'}`;
  $('visualize').href='/space?managed='+current.code;
  for(const b of $('rooms').children)b.setAttribute('aria-pressed',String(b.dataset.code===current.code));
  $('participants').replaceChildren(...current.data.poems.map(p=>{
    const card=document.createElement('article');card.className='person';const heading=document.createElement('h3');heading.textContent=p.name;card.append(heading);
    const poem=document.createElement('div');poem.className='poem';
    if(!p.lines.flat().length)poem.textContent='No poem yet.';
    else for(const line of p.lines){const row=document.createElement('div');if(!line.length)row.append('\u00a0');for(const w of line){const word=document.createElement('span');word.textContent=w.text+' ';if(w.borrowed){word.className='borrowed';word.title='From '+(current.data.sources.find(s=>s.id===w.sourceId)?.name||'another participant');}row.append(word);}poem.append(row);}card.append(poem);
    for(const source of current.data.sources.filter(s=>p.sourceIds.includes(s.id))){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Source text';details.append(summary);if(source.url){try{const url=new URL(source.url);if(['http:','https:'].includes(url.protocol)){const a=document.createElement('a');a.className='source-url';a.href=url.href;a.textContent=url.href;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}}catch{}}const text=document.createElement('pre');text.textContent=source.text;details.append(text);card.append(details);}return card;
  }));
}
async function exportRoom(){const archive=await request('rooms/'+current.code+'/export');download(archive,`data-scrap-poetry-${current.code}.json`);return archive;}
$('unlock').onsubmit=async e=>{e.preventDefault();key=$('access-key').value.trim();try{await rooms();rememberAccess(key);$('access-key').value='';await open();}catch(error){status(error.message);}};
$('lock').onclick=()=>{selectionRequest++;forgetAccess();key='';current=null;$('rooms').replaceChildren();$('participants').replaceChildren();$('room').hidden=true;$('empty').hidden=false;$('visualize').removeAttribute('href');$('delete-dialog').close();showUnlocked(false);status('Locked.');};
$('save-access').onclick=()=>{download(accessLink('/facilitator'+(current?'?room='+current.code:''),key)+'\n','data-scrap-poetry-private-access.txt','text/plain');status('Access link saved. Keep this file private; it opens all workshop records.');};
$('refresh').onclick=async()=>{try{await rooms();if(current)await selectRoom(current.code);else status('Rooms refreshed.');}catch(e){status(e.message);}};
$('more').onclick=()=>rooms(true).catch(e=>status(e.message));
$('find-room').onsubmit=e=>{e.preventDefault();selectRoom($('room-code').value.trim().toUpperCase());};
$('download').onclick=async()=>{if(busy||!current)return;busy=true;try{await exportRoom();status('Visualization downloaded.');}catch(e){status(e.message);}finally{busy=false;}};
$('delete').onclick=()=>{if(busy||!current)return;backupRevision=null;$('skip-backup').checked=false;$('backup-saved').checked=false;$('backup-saved').disabled=true;$('confirm-code').value='';$('delete-code').textContent=current.code;$('delete-status').textContent='';$('confirm-delete').disabled=true;$('delete-dialog').showModal();};
function canDelete(){return !busy&&current&&Number.isSafeInteger(current.revision)&&($('skip-backup').checked||(backupRevision!==null&&$('backup-saved').checked))&&$('confirm-code').value===current.code;}
function updateDelete(){$('confirm-delete').disabled=!canDelete();}
$('skip-backup').onchange=updateDelete;$('backup-saved').onchange=updateDelete;$('confirm-code').oninput=updateDelete;
$('backup').onclick=async()=>{if(busy)return;busy=true;$('backup').disabled=true;try{const archive=await exportRoom();backupRevision=archive.revision;$('backup-saved').disabled=false;$('delete-status').textContent='Save the file before continuing.';}catch(e){$('delete-status').textContent=e.message;}finally{busy=false;$('backup').disabled=false;updateDelete();}};
$('cancel-delete').onclick=()=>{if(!busy)$('delete-dialog').close();};$('delete-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('confirm-delete').onclick=async()=>{
  if(!canDelete())return;
  const revision=$('skip-backup').checked?(backupRevision??current.revision):backupRevision;
  busy=true;updateDelete();try{const code=current.code;await request('rooms/'+code+'/delete',{body:{revision,confirmation:$('confirm-code').value}});current=null;$('room').hidden=true;$('empty').hidden=false;$('participants').replaceChildren();$('delete-dialog').close();history.replaceState(null,'','/facilitator');await rooms();status('Room '+code+' deleted. Other rooms were kept.');}catch(e){backupRevision=null;$('skip-backup').checked=false;$('backup-saved').checked=false;$('backup-saved').disabled=true;$('delete-status').textContent=e.message;}finally{busy=false;updateDelete();}
};
if(key)await open();
