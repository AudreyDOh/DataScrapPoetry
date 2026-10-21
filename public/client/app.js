import { uniqueWords } from './word-groups.js';
import { categories, paletteGroup } from './grammar.js';
import { setupHtmlLab } from './html-lab.js';
import { createId } from './id.js';
const $=id=>document.getElementById(id);
const storageKey='poetry-online-session';
let session=null,room=null,revision=-1,line=0,filter='all',sharing=false,pending=false,pendingInput=null,timer,search='',selectedWord=null,dragging=false,ignoreClickUntil=0;
function message(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function status(text){$('connection').textContent=text;}
async function request(path,{method='GET',body,token=session?.token}={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch('/api/'+path,{method,signal:controller.signal,cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    const result=await response.json();if(!response.ok){const e=new Error(result.error||'Request failed.');e.status=response.status;throw e;}return result;
  }finally{clearTimeout(timeout);}
}
function accept(result){if(dragging||result.revision<revision)return;if(room&&result.revision===revision){status('Connected');return;}room=result.room;revision=result.revision;session.participantId=result.participantId;status('Connected');render();}
function showRoom(result,token){session={code:result.code,token,participantId:result.participantId};revision=-1;try{localStorage.setItem(storageKey,JSON.stringify(session));}catch{message('Session will not survive a reload.');}$('entry').hidden=true;document.querySelector('main').hidden=false;document.querySelector('header').hidden=false;accept(result);}
async function action(input){
  if(!session)return;if(pending){message('Saving… Try again.');return;}pending=true;pendingInput=input;status('Saving…');paintPending();
  try{const result=await request(`rooms/${session.code}/actions`,{method:'POST',body:{...input,requestId:createId()}});accept(result);return result;}catch(e){status('Not saved');message(e.message);pending=false;await sync();}finally{pending=false;pendingInput=null;paintPending();$('saved').textContent=$('connection').textContent==='Connected'?'Saved ✓':'Not saved';}
}
// A local placeholder acknowledges the exact drop immediately; the server
// remains authoritative, so failed saves never leave a fictitious word behind.
function paintPending(){
  document.querySelectorAll('.pending-word').forEach(el=>el.remove());
  document.querySelectorAll('[data-saving]').forEach(el=>{el.removeAttribute('data-saving');el.removeAttribute('aria-busy');});
  if(!pending||!pendingInput||!room)return;
  const input=pendingInput;
  const offer=room.offers.find(o=>o.id===input.offerId);
  const block=room.blocks.find(b=>b.id===(input.blockId||offer?.blockId));
  const target=input.action==='throw'?$('offers'):['append','use','move'].includes(input.action)?$('lines').querySelector(`[data-row="${input.to??input.line}"]`):null;
  if(target&&block){
    target.dataset.saving='true';target.setAttribute('aria-busy','true');
    const placeholder=document.createElement('span');placeholder.className='pending-word';placeholder.setAttribute('role','status');placeholder.setAttribute('aria-label',`Saving ${block.text}`);
    const word=document.createElement('span');word.textContent=block.text;placeholder.append(word);
    const dots=document.createElement('span');dots.className='saving-dots';dots.setAttribute('aria-hidden','true');
    for(let i=0;i<3;i++)dots.append(document.createElement('i'));placeholder.append(dots);
    const tokens=[...target.querySelectorAll(':scope > .token')];
    let position=input.toIndex??tokens.length;
    if(input.action==='move'&&input.from===input.to&&input.index<position)position=Math.max(0,position-1);
    target.insertBefore(placeholder,tokens[position]||null);
  }
  $('saved').textContent='Saving…';
}
async function sync(){if(!session||pending)return;const code=session.code;try{const result=await request(`rooms/${code}`);if(session?.code===code)accept(result);}catch(e){status(e.status===401?'Session expired':'Reconnecting…');}}
function poem(){return room.poems.find(p=>p.authorId===session.participantId);}
function name(id){return room.participants.find(p=>p.id===id)?.name||'Participant';}
function selected(){
  if(!selectedWord)return null;
  const {row,index,id}=selectedWord;
  return poem().lines[row]?.[index]===id?selectedWord:null;
}
function splitSelected(){
  const word=selected();if(!word||pending)return;
  const {row,index,id}=word;selectedWord=null;line=Math.min(row+1,5);
  action({action:'split',line:row,index,blockId:id});
}
function insertionAt(element,x,y){
  const nodes=[...element.querySelectorAll(':scope > .token')];
  for(let i=0;i<nodes.length;i++){const rect=nodes[i].getBoundingClientRect();if(y<rect.top||(y<=rect.bottom&&x<rect.left+rect.width/2))return i;}
  return nodes.length;
}
function clearMarker(){document.querySelectorAll('#drop.drop-active').forEach(el=>el.classList.remove('drop-active'));document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));document.querySelectorAll('.drop-marker').forEach(el=>el.remove());}
function markDrop(element,position){
  clearMarker();element.classList.add('drop-target');
  const nodes=[...element.querySelectorAll(':scope > .token')],target=nodes[position],last=nodes.at(-1),base=element.getBoundingClientRect();
  const rect=(target||last)?.getBoundingClientRect();const marker=document.createElement('span');marker.className='drop-marker';
  marker.style.left=`${rect?(target?rect.left:rect.right)-base.left:35}px`;marker.style.top=`${rect?rect.top-base.top:22}px`;
  element.append(marker);
}
function dropInto(data,row,position){
  dragging=false;clearMarker();line=row;selectedWord=null;
  action(data.offerId?{action:'use',offerId:data.offerId,line:row,toIndex:position}:data.from===null?{action:'append',line:row,toIndex:position,blockId:data.id}:{action:'move',from:data.from,to:row,index:data.index,toIndex:position,blockId:data.id});
}
function touchMove(wrap,data){
  let start=null,ghost=null;
  wrap.onpointerdown=e=>{if(e.button!==0||pending)return;start={x:e.clientX,y:e.clientY,pointer:e.pointerId};wrap.querySelector('button').setPointerCapture(e.pointerId);};
  wrap.onpointermove=e=>{
    if(!start||e.pointerId!==start.pointer)return;
    if(!ghost&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<8)return;
    e.preventDefault();dragging=true;
    if(!ghost){wrap.querySelector('button').setPointerCapture(e.pointerId);ghost=document.createElement('div');ghost.className='word-drag-ghost';ghost.textContent=wrap.querySelector('button').textContent;document.body.append(ghost);}
    ghost.style.left=`${e.clientX+12}px`;ghost.style.top=`${e.clientY-36}px`;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.poemline');
    if(target)markDrop(target,insertionAt(target,e.clientX,e.clientY));else {const shareTarget=!data.offerId&&document.elementFromPoint(e.clientX,e.clientY)?.closest('#drop');if(shareTarget){document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));document.querySelectorAll('.drop-marker').forEach(el=>el.remove());shareTarget.classList.add('drop-active');}else clearMarker();}
    if(e.clientY<60)window.scrollBy(0,-12);else if(e.clientY>innerHeight-60)window.scrollBy(0,12);
  };
  function end(e,cancelled=false){
    if(!start||e.pointerId!==start.pointer)return;
    const moved=Boolean(ghost);if(ghost){ghost.remove();ghost=null;ignoreClickUntil=Date.now()+500;}
    if(moved&&!cancelled){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.poemline');if(target)dropInto(data,Number(target.dataset.row),insertionAt(target,e.clientX,e.clientY));else if(!data.offerId&&document.elementFromPoint(e.clientX,e.clientY)?.closest('#drop')){dragging=false;action({action:'throw',blockId:data.id});}}
    dragging=false;clearMarker();start=null;
  }
  wrap.onpointerup=e=>end(e);wrap.onpointercancel=e=>end(e,true);
}
function token(block,inPoem=false,row=0,index=0,offer=null){
  const wrap=document.createElement('span');wrap.className='token'+(block.receivedOfferId?' borrow':'')+(inPoem?' poem-word':'')+(offer?' shared-token':'');wrap.draggable=false;
  const data={id:block.id,from:inPoem?row:null,index,...(offer?{offerId:offer.id}:{})};
  wrap.ondragstart=e=>{if(pending){e.preventDefault();return;}dragging=true;selectedWord=null;e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain',JSON.stringify(data));};
  wrap.ondragend=()=>{dragging=false;clearMarker();ignoreClickUntil=Date.now()+250;};
  const button=document.createElement('button');button.draggable=false;button.textContent=block.text;button.title=(room.sources.find(s=>s.id===block.sourceId)?.title||'')+(block.receivedOfferId?' · borrowed':'');
  if(offer){const by=document.createElement('small');by.className='shared-by';by.textContent=`from ${name(offer.senderId)}`;button.append(by);button.title=`Use ${block.text} · from ${name(offer.senderId)}`;}
  if(inPoem){
    const isSelected=selectedWord?.row===row&&selectedWord?.index===index&&selectedWord?.id===block.id;
    wrap.classList.toggle('word-selected',Boolean(isSelected));button.setAttribute('aria-pressed',String(Boolean(isSelected)));
    button.title+=' · Space or Enter: split after word';
    button.onkeydown=e=>{
      if([' ','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();selectedWord={row,index,id:block.id};splitSelected();}
      else if(['Backspace','Delete'].includes(e.key)){e.preventDefault();e.stopPropagation();selectedWord=null;action({action:'remove',line:row,index,blockId:block.id});}
    };
  }
  button.onclick=e=>{
    e.stopPropagation();if(Date.now()<ignoreClickUntil)return;
    if(inPoem){selectedWord={row,index,id:block.id};line=row;render();$('lines').querySelector('.word-selected button')?.focus({preventScroll:true});}
    else if(offer){action({action:'use',offerId:offer.id,line});}
    else if(sharing){sharing=false;action({action:'throw',blockId:block.id});}
    else action({action:'append',line,blockId:block.id});
  };wrap.append(button);touchMove(wrap,data);return wrap;
}
function dropData(e){e.preventDefault();try{return JSON.parse(e.dataTransfer.getData('text/plain'));}catch{return null;}}
function render(){
  const id=session.participantId,own=room.blocks.filter(b=>b.ownerId===id&&!b.archivedFromCollection);
  $('room-info').textContent=`${session.code} · ${name(id)} · ${room.participants.length}/20`;
  $('publish-view').hidden=room.participants[0]?.id!==id;$('publish-view').textContent=room.galleryId?'Update public view':'Publish view';$('space-view').href=room.galleryId?`/space?gallery=${room.galleryId}`:`/space?room=${session.code}`;
  $('saved').textContent='Saved ✓';$('count').textContent=`${uniqueWords(own).length} WORDS`;
  $('filters').replaceChildren(...[['all','All'],...categories].map(([key,label])=>{const b=document.createElement('button');b.textContent=label;b.dataset.filter=key;b.className=filter===key?'active':'';b.setAttribute('aria-pressed',String(filter===key));return b;}));
  $('words').replaceChildren();
  for(const [key,label]of categories){if(filter!=='all'&&filter!==key)continue;const items=uniqueWords(own.filter(b=>paletteGroup(b)===key&&b.category!=='punctuation'&&b.text.toLowerCase().includes(search)));if(!items.length)continue;const group=document.createElement('section');group.className='word-group';group.dataset.group=key;const heading=document.createElement('h3');heading.textContent=label;const list=document.createElement('div');list.className='tokens';list.append(...items.map(item=>token(item.block)));group.append(heading,list);$('words').append(group);}
  const current=poem();if(line>=current.lines.length)line=0;
  if(selectedWord&&!selected())selectedWord=null;
  $('lines').replaceChildren(...current.lines.map((ids,row)=>{
    const div=document.createElement('div');div.className='poemline'+(row===line?' selected':'');div.dataset.row=row;div.tabIndex=0;div.setAttribute('aria-label',`Select line ${row+1}`);
    div.onclick=()=>{const word=selected();if(word&&word.row!==row&&!pending){dropInto({id:word.id,from:word.row,index:word.index},row,ids.length);}else{line=row;selectedWord=null;render();}};
    div.onkeydown=e=>{if(e.target===div&&['Enter',' '].includes(e.key)){e.preventDefault();line=row;selectedWord=null;render();}};
    const num=document.createElement('span');num.className='lineno';num.textContent=String(row+1).padStart(2,'0');div.append(num);
    ids.forEach((id,index)=>{const block=room.blocks.find(b=>b.id===id);if(block)div.append(token(block,true,row,index));});
    if(!ids.length){const p=document.createElement('span');p.className='placeholder';p.textContent=row===line?'+':'…';div.append(p);}
    div.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';markDrop(div,insertionAt(div,e.clientX,e.clientY));};
    div.ondragleave=e=>{if(!div.contains(e.relatedTarget))clearMarker();};
    div.ondrop=e=>{const data=dropData(e);if(data)dropInto(data,row,insertionAt(div,e.clientX,e.clientY));};return div;
  }));
  $('split-line').disabled=!selected();
  $('addline').disabled=current.lines.length>=6;
  $('drop').setAttribute('aria-pressed',String(sharing));$('drop').textContent='Drop a word in the void to share';
  $('offers').replaceChildren();for(const offer of [...room.offers].reverse()){
    const block=room.blocks.find(b=>b.id===offer.blockId);if(block)$('offers').append(token(block,false,0,0,offer));
  }
  paintPending();
}
async function enter(create=false){
  const nickname=$('name').value.trim(),code=$('code').value.trim().toUpperCase();if(!nickname){$('name').reportValidity();return;}
  $('entry-error').textContent='';if((code||!create)&&!/^[A-Z0-9]{6,10}$/.test(code)){$('entry-error').textContent='Use 6–10 letters or numbers for the room code.';return;}document.querySelectorAll('#entry button').forEach(b=>b.disabled=true);
  try{if(create){const result=await request('rooms',{method:'POST',body:{name:nickname,code},token:null});showRoom(result,result.token);}else{const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');const result=await request(`rooms/${code}/join`,{method:'POST',body:{name:nickname,token},token:null});showRoom(result,token);}}catch(e){$('entry-error').textContent=e.message;}finally{document.querySelectorAll('#entry button').forEach(b=>b.disabled=false);}
}
$('entry-form').onsubmit=e=>{e.preventDefault();enter();};$('create-room').onclick=()=>enter(true);
$('word-search').oninput=e=>{search=e.target.value.toLowerCase();if(room)render();};
$('filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;render();}};
$('addline').onclick=()=>action({action:'line'});
$('split-line').onclick=splitSelected;
$('undo').onclick=()=>{const word=selected();if(word){selectedWord=null;action({action:'remove',line:word.row,index:word.index,blockId:word.id});}else{const ids=poem().lines[line];if(ids.length)action({action:'remove',line,index:ids.length-1,blockId:ids.at(-1)});}};
$('drop').onclick=()=>{sharing=!sharing;render();};$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drop-active');};$('drop').ondragleave=e=>{if(!$('drop').contains(e.relatedTarget))clearMarker();};$('drop').ondrop=e=>{clearMarker();const data=dropData(e);if(data&&!data.offerId)action({action:'throw',blockId:data.id});};
$('export').onclick=async()=>{try{const data=await request(`rooms/${session.code}/export`);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`poems-${session.code}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message(e.message);}};
$('publish-view').onclick=async()=>{const result=await action({action:'publish'});if(result?.room.galleryId){$('space-view').href=`/space?gallery=${result.room.galleryId}`;message('Public view published. Open View to copy its link.');}};
$('invite').onclick=async()=>{const url=new URL('/workshop.html',location.origin);url.searchParams.set('room',session.code);try{await navigator.clipboard.writeText(url.href);message('Link copied.');}catch{message(url.href);}};
$('leave').onclick=()=>{session=null;room=null;try{localStorage.removeItem(storageKey);}catch{}document.querySelector('main').hidden=true;document.querySelector('header').hidden=true;$('entry').hidden=false;};
setupHtmlLab(({text,page,url})=>{filter='all';search='';$('word-search').value='';return action({action:'import',method:'html',text,page,url});},url=>request(`rooms/${session.code}/fetch-page`,{method:'POST',body:{url}}),url=>request(`rooms/${session.code}/fetch-style`,{method:'POST',body:{url}}));
document.querySelector('header').hidden=true;
const invited=new URL(location.href).searchParams.get('room');if(invited)$('code').value=invited.toUpperCase();
try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&(!invited||saved.code===invited.toUpperCase())){session=saved;const result=await request(`rooms/${saved.code}`);showRoom(result,saved.token);}}catch{session=null;}
setInterval(sync,2000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
