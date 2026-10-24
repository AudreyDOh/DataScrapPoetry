import {readAccess,rememberAccess} from '../facilitator-access.js';
import {loadManagedView} from './managed-access.js';
import {readArchive} from './archive.js';
import * as THREE from '../../vendor/three/three.module.js';
import {CSS3DRenderer,CSS3DObject} from '../../vendor/three/CSS3DRenderer.js';
import {OrbitControls} from '../../vendor/three/OrbitControls.js';
import {RopeWorld} from './physics.js';
import {buildSheet,decorateSheet,drawFlatPath} from './sheet.js';
import {poemSteps} from '../space-data.js';
import {captureView,downloadScreenshot} from './screenshot.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
let data,endpoint,archivePages=null,auth={},selected=null,selectedPoem=null,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,drag=null,tracing=null,flatSheet=null,capturing=false;
const panels=[],snapshots=new Map(),bySource=new Map(),world=new RopeWorld({damping:.72,strandCollisions:true,collisionStrength:.18}),scene=new THREE.Scene(),cssScene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.05,250);
let renderer,css,controls,raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),radius=5;
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2500);}
async function get(url,headers=auth){const r=await fetch(url,{headers});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error||'Could not load this view.'),{status:r.status});return value;}
function requestFacilitatorKey(message){
  $('loading').hidden=true;$('facilitator-unlock').hidden=false;$('facilitator-error').textContent=message;$('facilitator-key').value='';$('facilitator-key').focus();
  return new Promise(resolve=>{$('facilitator-unlock').onsubmit=event=>{event.preventDefault();const key=$('facilitator-key').value.trim();if(!/^[a-f0-9]{64}$/.test(key)){$('facilitator-error').textContent='Enter your 64-character facilitator access key.';return;}$('facilitator-key').value='';$('facilitator-unlock').hidden=true;$('loading').hidden=false;$('loading').textContent='Loading pages…';resolve(key);};});
}
function worldPoint(panel,word){const p=panel.sheet.anchors.get(word.start);if(!p)return null;return new THREE.Vector3((p.x-panel.sheet.width/2)*panel.scale,(panel.sheet.height/2-p.y)*panel.scale,.07).applyQuaternion(panel.quaternion).add(panel.position);}
function endpointAt(word){const panel=bySource.get(word.sourceId);if(!panel||!panel.sheet.anchors.has(word.start))return null;return ()=>worldPoint(panel,word);}
function initialLayout(){
  radius=Math.max(3.8,panels.length*.58);
  panels.forEach((p,i)=>{const theta=i/panels.length*Math.PI*2;p.position.set(Math.cos(theta)*radius,0,Math.sin(theta)*radius);p.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),-theta);syncPanel(p);});
  camera.position.set(radius*.95,radius*.86,radius*2.4);controls.target.set(0,-.5,0);controls.update();
}
function syncPanel(p){p.object.position.copy(p.position);p.object.quaternion.copy(p.quaternion);p.mesh.position.copy(p.position);p.mesh.quaternion.copy(p.quaternion);p.mesh.updateMatrixWorld(true);}
function makeRopes(){
  for(const r of world.ropes){scene.remove(r.line);r.line.geometry.dispose();r.line.material.dispose();}world.ropes=[];world.sleep();
  for(const poem of data.poems){const steps=poemSteps(poem);steps.slice(1).forEach((to,i)=>{const from=steps[i],a=endpointAt(from),b=endpointAt(to);if(!a||!b)return;
    const cross=from.sourceId!==to.sourceId,red=cross&&(from.borrowed||to.borrowed);
    const rope=world.add(a,b,{fromPage:from.sourceId,toPage:to.sourceId,poemId:poem.id,order:i+1,red,physical:red,elastic:red});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rope.p.length*3),3));
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:red?0xe56b64:0xcad3d2,transparent:true,opacity:red?.8:.38,depthTest:false}));line.frustumCulled=false;scene.add(line);rope.line=line;
  });}
  $('counts').textContent=`${panels.length} pages / ${data.poems.filter(p=>poemSteps(p).length).length} poems`;
}
function selectPanel(panel){
  if(capturing)return;
  selected=panel;selectedPoem=data.poems.find(p=>p.sourceIds.includes(panel.id))||data.poems.find(p=>poemSteps(p).some(w=>w.sourceId===panel.id));
  $('selection').hidden=false;$('selection-name').textContent=panel.source.name;
  for(const button of $('page-list').children)button.setAttribute('aria-pressed',String(button.dataset.source===panel.id));
  updateFocus();
}
function updateFocus(){const steps=selectedPoem?poemSteps(selectedPoem):[];for(const p of panels)decorateSheet(p.sheet,steps);for(const r of world.ropes)r.line.material.opacity=selectedPoem?(r.poemId===selectedPoem.id?(r.red?1:.85):.09):(r.red?.8:.38);}
function clearSelection(){selected=null;selectedPoem=null;tracing=null;$('selection').hidden=true;for(const b of $('page-list').children)b.setAttribute('aria-pressed','false');updateFocus();}
function pick(e){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(panels.map(p=>p.mesh))[0];return hit?bySource.get(hit.object.userData.sourceId):null;}
function beginDrag(e){if(capturing||e.button!==0)return;const panel=pick(e);if(!panel)return;controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);const normal=camera.getWorldDirection(new THREE.Vector3()),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,panel.position),hit=new THREE.Vector3();raycaster.ray.intersectPlane(plane,hit);drag={panel,plane,offset:panel.position.clone().sub(hit),desired:panel.position.clone(),x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false};}
function moveDrag(e){if(!drag||e.pointerId!==drag.pointer)return;pick(e);const hit=new THREE.Vector3();if(raycaster.ray.intersectPlane(drag.plane,hit)){drag.desired.copy(hit).add(drag.offset);drag.moved ||= Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4;}}
function endDrag(e){if(!drag||e.pointerId!==drag.pointer)return;if(!drag.moved&&e.type!=='pointercancel')selectPanel(drag.panel);drag=null;controls.enabled=true;}
async function openDetail(panel,poem=selectedPoem){
  if(capturing)return;
  selectPanel(panel);if(poem)selectedPoem=poem;
  const sourceSelect=$('detail-source');sourceSelect.replaceChildren(...panels.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.source.name;return o;}));sourceSelect.value=panel.id;
  const poemSelect=$('detail-poem');poemSelect.replaceChildren(...data.poems.filter(p=>poemSteps(p).length).map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));if(selectedPoem)poemSelect.value=selectedPoem.id;
  if(!$('detail').open)$('detail').showModal();await renderDetail();
}
async function renderDetail(){
  const source=data.sources.find(s=>s.id===$('detail-source').value);selectedPoem=data.poems.find(p=>p.id===$('detail-poem').value)||selectedPoem;const steps=selectedPoem?poemSteps(selectedPoem):[];
  const sheet=await buildSheet(source,snapshots.get(source.id),steps);drawFlatPath(sheet,steps);flatSheet=sheet;$('flat-inner').replaceChildren(sheet.element);sizeDetail();
  $('poem-text').replaceChildren();if(selectedPoem)selectedPoem.lines.forEach(line=>{const p=document.createElement('p');for(const word of line){const b=document.createElement('button');b.textContent=word.text;b.className=word.borrowed?'borrowed':'';b.title=`${data.sources.find(s=>s.id===word.sourceId)?.name||''} · source word`;b.onclick=async()=>{$('detail-source').value=word.sourceId;await renderDetail();const pos=flatSheet.anchors.get(word.start);if(pos){const scale=parseFloat($('flat-inner').style.zoom)||1;$('flat-page').scrollTo({top:Math.max(0,pos.y*scale-160),behavior:paused?'instant':'smooth'});}};p.append(b,' ');}if(!line.length)p.append('\u00a0');$('poem-text').append(p);});
  const notes=[];if(!(snapshots.get(source.id)?.nodes?.length||snapshots.get(source.id)?.items?.length))notes.push('Text-only source. Import the HTML again to preserve its page layout.');else if(snapshots.get(source.id).missingStyles)notes.push('Some source styles could not be loaded.');if(snapshots.get(source.id)?.truncated)notes.push('This source was larger than the page capture limit.');$('source-note').textContent=notes.join(' ');updateFocus();
}
function sizeDetail(){if(!flatSheet)return;const scale=Math.min(1,($('flat-page').clientWidth-40)/flatSheet.width);$('flat-inner').style.zoom=String(Math.max(.2,scale));}
function resize(){if(capturing)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);css.setSize(innerWidth,innerHeight);sizeDetail();}
async function screenshot(){
  if(capturing)return;
  capturing=true;const wasEnabled=controls.enabled,button=$('screenshot');controls.enabled=false;button.disabled=true;button.textContent='Saving…';
  try{css.render(cssScene,camera);const {blob,missingImages}=await captureView({cssRoot:css.domElement,renderer,scene,camera,snapshots});downloadScreenshot(blob);toast(missingImages?'Screenshot saved. Some source images could not be included.':'Screenshot saved.');}
  catch(error){console.error(error);toast('Could not save the screenshot. Please try again.');}
  finally{capturing=false;controls.enabled=wasEnabled;button.disabled=false;button.textContent='Screenshot';resize();}
}
async function init(){
  const gallery=params.get('gallery'),room=params.get('room');
  if(params.has('archive')){
    $('loading').hidden=true;$('archive-picker').hidden=false;$('view-kind').textContent='Saved visualization';
    const archive=await new Promise(resolve=>{$('archive-file').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>80000000)throw new Error('File exceeds 80 MB.');const value=readArchive(JSON.parse(await file.text()));resolve(value);}catch(error){$('archive-error').textContent=error.message;event.target.value='';}};});
    data=archive.data;archivePages=archive.pages;endpoint=null;$('archive-picker').hidden=true;$('loading').hidden=false;
  }
  else if(params.has('demo')){data=await get('/examples/space.json');endpoint=null;$('view-kind').textContent='Sample pages';}
  else if(gallery){let session;try{session=JSON.parse(localStorage.getItem('poetry-online-session'));}catch{}if(session?.token)auth={Authorization:`Bearer ${session.token}`};endpoint=`/api/galleries/${encodeURIComponent(gallery)}`;data=await get(endpoint);$('view-kind').textContent='Host visualization';}
  else if(params.has('managed')){const code=params.get('managed');$('view-kind').textContent='Room '+code;$('workshop-link').href='/facilitator?room='+encodeURIComponent(code);$('workshop-link').textContent='Facilitator';$('copy-view').hidden=true;({data,endpoint,auth}=await loadManagedView(code,{key:readAccess(),requestKey:requestFacilitatorKey,fetchView:get,saveKey:rememberAccess}));}
  else {let session;try{session=JSON.parse(localStorage.getItem('poetry-online-session'));}catch{}if(!session||room&&session.code!==room)throw new Error('Open Visualization from the room creator’s workshop, or choose Open archive.');auth={Authorization:`Bearer ${session.token}`};endpoint=`/api/rooms/${session.code}/view`;data=await get(endpoint);$('view-kind').textContent='Host visualization';$('copy-view').hidden=true;}
  if(!data.sources.length)throw new Error('Import HTML in the workshop to add your first page.');
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x000000,0);$('stage').append(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D pages. Drag pages to move them, drag empty space to orbit.');
  css=new CSS3DRenderer();css.setSize(innerWidth,innerHeight);$('stage').prepend(css.domElement);css.domElement.setAttribute('aria-hidden','true');
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=1.2;controls.maxDistance=100;controls.maxPolarAngle=Math.PI*.94;
  for(const source of data.sources){$('loading').textContent=`Loading pages… ${panels.length+1}/${data.sources.length}`;const snapshot=endpoint&&source.pageId?await get(`${endpoint}/pages/${source.id}`):(archivePages?.[source.id]||source.snapshot||null);snapshots.set(source.id,snapshot);const sheet=await buildSheet(source,snapshot,data.poems.flatMap(poemSteps));const scale=Math.min(.004,7.5/sheet.height);const object=new CSS3DObject(sheet.element);object.scale.setScalar(scale);cssScene.add(object);const width=sheet.width*scale,height=sheet.height*scale;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.userData.sourceId=source.id;const panel={id:source.id,source,sheet,object,mesh,width,height,scale,position:new THREE.Vector3(),quaternion:new THREE.Quaternion()};panels.push(panel);bySource.set(source.id,panel);const b=document.createElement('button');b.dataset.source=source.id;b.textContent=`${String(panels.length).padStart(2,'0')}  ${source.name}`;b.setAttribute('aria-pressed','false');b.onclick=()=>selectPanel(panel);b.ondblclick=()=>openDetail(panel);$('page-list').append(b);}
  world.panels=panels;initialLayout();makeRopes();$('loading').hidden=true;
  renderer.domElement.addEventListener('pointerdown',beginDrag,true);renderer.domElement.addEventListener('pointermove',moveDrag);renderer.domElement.addEventListener('pointerup',endDrag);renderer.domElement.addEventListener('pointercancel',endDrag);renderer.domElement.addEventListener('dblclick',e=>{const panel=pick(e);if(panel)openDetail(panel);});
  $('reset').onclick=()=>{if(capturing)return;drag=null;initialLayout();makeRopes();clearSelection();};$('screenshot').onclick=screenshot;$('screenshot').disabled=false;
  $('read').onclick=()=>selected&&openDetail(selected);$('clear-selection').onclick=clearSelection;
  $('trace').onclick=()=>{if(!selectedPoem)return;tracing={poemId:selectedPoem.id,start:performance.now()};};
  $('detail-close').onclick=()=>$('detail').close();$('detail-source').onchange=()=>renderDetail();$('detail-poem').onchange=()=>renderDetail();
  $('copy-view').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Link copied.');}catch{toast(location.href);}};
  window.addEventListener('resize',resize);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('detail').open)clearSelection();});
  let previous=performance.now(),accumulator=0;
  function frame(now){requestAnimationFrame(frame);if(document.hidden||capturing){previous=now;return;}const elapsed=Math.min((now-previous)/1000,.045);previous=now;controls.update();
    if((!paused||drag)&&!$('detail').open){accumulator=Math.min(accumulator+elapsed,2/60);while(accumulator>=1/60){let moved=false;if(drag?.moved){const next=world.dragLimit(drag.panel,drag.desired);moved=next.distanceToSquared(drag.panel.position)>1e-10;if(moved){drag.panel.position.copy(next);syncPanel(drag.panel);}}world.tick(1/60,moved);accumulator-=1/60;}}else accumulator=0;
    for(const rope of world.ropes){const attribute=rope.line.geometry.attributes.position;rope.p.forEach((p,i)=>attribute.setXYZ(i,p.x,p.y,p.z));attribute.needsUpdate=true;if(tracing&&rope.poemId===tracing.poemId){const progress=(now-tracing.start)/650-rope.order+1;rope.line.geometry.setDrawRange(0,Math.max(0,Math.min(rope.p.length,Math.floor(progress*rope.p.length))));}else rope.line.geometry.setDrawRange(0,Infinity);}
    if(tracing&&(now-tracing.start)>poemSteps(selectedPoem).length*650+1200)tracing=null;
    css.render(cssScene,camera);renderer.render(scene,camera);
  }requestAnimationFrame(frame);
}
init().catch(error=>{$('loading').hidden=false;$('loading').textContent=error.message;console.error(error);});
