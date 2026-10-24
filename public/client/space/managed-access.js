// A private link or a pasted key uses the same server-side authorization.
export async function loadManagedView(code,{key,requestKey,fetchView,saveKey}){
  const endpoint=`/api/facilitator/rooms/${encodeURIComponent(code)}/view`;
  let message='';
  for(;;){
    if(!key)key=await requestKey(message);
    const auth={Authorization:`Bearer ${key}`};
    try{
      const data=await fetchView(endpoint,auth);
      saveKey(key);
      return {data,endpoint,auth};
    }catch(error){
      if(error.status!==401&&error.status!==403)throw error;
      key='';message='This access key was not accepted. Try your facilitator access key.';
    }
  }
}
