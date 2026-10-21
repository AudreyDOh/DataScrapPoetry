import { captureLayout } from './capture-layout.js';
import { htmlTextRuns } from './html-text.js';
// Parse into an inert template: imported markup never enters the live document.
// Preview nodes are created from textContent, so scripts and event handlers
// cannot run and images/iframes are never attached to the page.
export function extractHtml(html, groups, doc = document) {
  const template = doc.createElement('template');
  template.innerHTML = html;
  return htmlTextRuns(template.content, groups).map(({tag, text}) => ({tag, text}));
}

export function setupHtmlLab(onImport,loadPage,loadStyle) {
  const $ = id => document.getElementById(id);
  let edited = false, busy=false, cached=null;
  let updateTimer;
  const maxHtmlLength = 10000000;
  const maxTextLength = 18000;
  function stats() {
    const text = $('html-clean').value;
    const selected = document.querySelector('[data-tag]:checked');
    const tokens = text.match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu) || [];
    let label = `${tokens.length} blocks${edited ? ' · edited' : ''}`;
    if ($('html-input').value.length > maxHtmlLength) label = 'HTML exceeds 10 million characters.';
    else if (!selected && !edited) label = 'Select Headings, Paragraphs, List items or Other text.';
    else if (!text.trim() && $('html-input').value.trim()) label = 'No text found in selected elements.';
    else if (text.length > maxTextLength) label = `${text.length.toLocaleString('en')} characters · import limit: 18,000. Edit the extracted text.`;
    $('html-stats').textContent = label;
    $('html-import').disabled = busy || tokens.length === 0 || text.length > maxTextLength || $('html-input').value.length > maxHtmlLength;
  }
  function update() {
    clearTimeout(updateTimer);
    if ($('html-input').value.length > maxHtmlLength) {
      $('html-clean').value = '';
      $('html-input').setCustomValidity('HTML exceeds 10 million characters.');
      edited = false; stats(); return;
    }
    $('html-input').setCustomValidity('');
    const groups = [...document.querySelectorAll('[data-tag]:checked')].map(input => input.dataset.tag);
    const parts = groups.length ? extractHtml($('html-input').value, groups) : [];
    $('html-clean').value = parts.map(part => part.text).join('\n\n');
    edited = false; stats();
  }
  $('html-input').value = '';
  $('html-input').addEventListener('input', () => { clearTimeout(updateTimer); $('html-import').disabled = true; $('html-stats').textContent = 'Extracting…'; updateTimer = setTimeout(update, 180); });
  document.querySelectorAll('[data-tag]').forEach(input => input.addEventListener('change',update));
  $('html-clean').oninput = () => { edited = true; stats(); };
  function lock(value){busy=value;for(const el of [$('source-url'),$('load-page'),$('html-input'),$('html-clean'),...document.querySelectorAll('[data-tag]')])el.disabled=value;stats();}
  function validLink(){const link=$('source-url');link.setCustomValidity('');if(!link.value.trim()){link.setCustomValidity('Enter a public webpage link.');link.reportValidity();return null;}try{const url=new URL(link.value.trim());if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error();return url.href;}catch{link.setCustomValidity('Enter a public http or https webpage link.');link.reportValidity();return null;}}
  async function fetchSource(url){if(cached?.input===url)return cached;const result=await loadPage(url);cached={...result,input:url};return cached;}
  $('load-page').onclick=async()=>{const url=validLink();if(!url||busy)return;lock(true);$('html-stats').textContent='Loading page…';let error;try{cached=null;const result=await fetchSource(url);$('html-input').value=result.html;update();}catch(e){error=e.message;}finally{lock(false);if(error)$('html-stats').textContent=error;}};
  $('source-url').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('load-page').click();}});
  $('html-import').onclick = async () => {
    if (!$('html-clean').value.trim()) return;
    const text=$('html-clean').value;
    const url=$('source-url').value.trim()?validLink():null;
    if($('source-url').value.trim()&&!url)return;
    const groups=[...document.querySelectorAll('[data-tag]:checked')].map(el=>el.dataset.tag);
    lock(true);$('html-stats').textContent='Capturing page layout…';let notice='';
    try{
      let html=$('html-input').value,base=url;
      if(url){try{const result=await fetchSource(url);html=result.html;base=result.url;}catch(e){if(!html.trim())throw e;notice=' · using pasted HTML';}}
      const page=await captureLayout(html,text,groups,base,loadStyle);
      const result=await onImport({text,url,page});
      notice=result?`Imported · page captured${notice}${page.missingStyles?' · some styles unavailable':''}`:'Import was not saved. Please retry.';
    }catch(e){notice=e.message||'Could not capture this page. Please try again.';}finally{lock(false);$('html-stats').textContent=notice;}
  };
  update();
}
