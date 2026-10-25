import {captureLayout} from './capture-layout.js';

export function setupEntryEditor({request,getCurrent,refresh,status}){
  const $=id=>document.getElementById(id);
  let entry=null,source=null,clearing=null,busy=false;
  const dialogs=['entry-dialog','source-dialog','clear-work-dialog'];
  function lock(value){busy=value;for(const id of dialogs)for(const el of $(id).querySelectorAll('input,textarea,button'))el.disabled=value;}
  function sourceList(){
    const current=getCurrent();if(!entry||current?.code!==entry.code)return;
    const poem=current.data.poems.find(p=>p.id===entry.id);
    $('entry-sources').replaceChildren(...current.data.sources.filter(s=>poem?.sourceIds.includes(s.id)).map(s=>{
      const row=document.createElement('div');row.className='editable-source';
      const label=document.createElement('span');label.textContent=s.url||'No source link';
      const button=document.createElement('button');button.type='button';button.textContent='Edit link';button.onclick=()=>openSource(s);
      row.append(label,button);return row;
    }));
  }
  function openEntry(poem){
    const current=getCurrent();if(busy||!current)return;
    entry={code:current.code,id:poem.id,revision:current.revision};
    $('entry-name').value=poem.name;$('entry-poem').value=poem.lines.map(line=>line.map(w=>w.text).join(' ')).join('\n');
    $('entry-status').textContent='';sourceList();$('entry-dialog').showModal();
  }
  function openSource(value){
    const current=getCurrent();if(busy||!current)return;
    source={...value,code:current.code,revision:current.revision};
    $('edit-source-url').value=value.url||'';$('refresh-source-page').checked=Boolean(value.url);
    $('source-status').textContent='';$('source-dialog').showModal();
  }
  async function updated(code){
    await refresh(code);
    if(entry?.code===code){entry.revision=getCurrent().revision;sourceList();}
  }
  $('entry-form').onsubmit=async event=>{
    event.preventDefault();if(busy||!entry)return;
    lock(true);$('entry-status').textContent='Saving…';
    try{await request(`rooms/${entry.code}/poems/${entry.id}/edit`,{body:{revision:entry.revision,name:$('entry-name').value,text:$('entry-poem').value}});await updated(entry.code);$('entry-dialog').close();status('Entry updated. Reload the visualization to see the changes.');}
    catch(error){$('entry-status').textContent=error.message;}finally{lock(false);}
  };
  $('source-form').onsubmit=async event=>{
    event.preventDefault();if(busy||!source)return;
    const url=$('edit-source-url').value.trim(),reload=$('refresh-source-page').checked;
    if(reload&&!url){$('source-status').textContent='Enter a URL, or uncheck Reload page to remove the link.';return;}
    lock(true);$('source-status').textContent=reload?'Loading page…':'Saving…';
    try{
      let page;
      if(reload){
        const result=await request('fetch-page',{body:{url}});$('source-status').textContent='Preparing page layout…';
        page=await captureLayout(result.html,source.text,['headings','paragraphs','lists','other'],result.url,url=>request('fetch-style',{body:{url}}));
      }
      await request(`rooms/${source.code}/sources/${source.id}/edit`,{body:{revision:source.revision,url,...(page?{page}:{})}});
      await updated(source.code);$('source-dialog').close();status('Source updated. Reload the visualization to see the changes.');
    }catch(error){$('source-status').textContent=error.message;}finally{lock(false);}
  };
  function deletionDetails(){
    const all=$('clear-work-form').querySelector('input[name="clear-scope"]:checked').value==='all';
    $('clear-work-details').textContent=all?'Permanently deletes this poem, source pages and word collection. Other poems keep their borrowed words, without links to the removed pages. The participant can stay in the room.':'Permanently clears this poem. Source pages, collected words and shared words are kept.';
  }
  $('entry-delete').onclick=()=>{
    if(busy||!entry)return;
    const current=getCurrent(),poem=current.data.poems.find(p=>p.id===entry.id);if(!poem)return;
    clearing={...entry,revision:current.revision};$('clear-work-name').textContent=poem.name;
    $('clear-work-form').querySelector('input[value="poem"]').checked=true;$('clear-work-status').textContent='';deletionDetails();$('clear-work-dialog').showModal();
  };
  $('clear-work-form').onchange=deletionDetails;
  $('clear-work-form').onsubmit=async event=>{
    event.preventDefault();if(busy||!clearing)return;
    const scope=$('clear-work-form').querySelector('input[name="clear-scope"]:checked').value;
    lock(true);$('clear-work-status').textContent='Deleting…';
    try{await request(`rooms/${clearing.code}/poems/${clearing.id}/clear`,{body:{revision:clearing.revision,scope,confirmation:clearing.id}});await updated(clearing.code);$('clear-work-dialog').close();$('entry-dialog').close();status('Selected work deleted. Reload the visualization to see the changes.');}
    catch(error){$('clear-work-status').textContent=error.message;}finally{lock(false);}
  };
  for(const [button,dialog] of [['entry-cancel','entry-dialog'],['source-cancel','source-dialog'],['clear-work-cancel','clear-work-dialog']])$(button).onclick=()=>{if(!busy)$(dialog).close();};
  for(const id of dialogs)$(id).addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  return {openEntry,close(){if(!busy)for(const id of dialogs)$(id).close();}};
}
