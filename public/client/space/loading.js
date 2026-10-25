// Yield to input and painting between bounded pieces of page preparation.
export function yieldToBrowser(){
  if(globalThis.scheduler?.yield)return globalThis.scheduler.yield();
  return new Promise(resolve=>setTimeout(resolve,0));
}

export async function inBatches(items,visit,{size=150,pause=yieldToBrowser}={}){
  for(let start=0;start<items.length;start+=size){
    const end=Math.min(start+size,items.length);
    for(let i=start;i<end;i++)visit(items[i],i);
    if(end<items.length)await pause();
  }
}

// Prefetch a small window while building in source order. Keeping that order
// preserves the final circle, page list and strand ordering even on slow links.
export async function loadInOrder(items,{load,consume,concurrency=3}){
  const pending=new Map();
  function start(index){
    if(index>=items.length)return;
    // Observe failures immediately, including a later request that rejects
    // while an earlier page is still being built.
    pending.set(index,Promise.resolve().then(()=>load(items[index],index))
      .then(value=>({value}),error=>({error,failed:true})));
  }
  for(let i=0;i<Math.min(concurrency,items.length);i++)start(i);
  for(let i=0;i<items.length;i++){
    const result=await pending.get(i);pending.delete(i);
    if(result.failed)throw result.error;
    start(i+concurrency);
    await consume(result.value,items[i],i);
  }
}
