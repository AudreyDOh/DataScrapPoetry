// A compact palette, without deleting source occurrences or shared identities.
// Prefer a received copy so using a collapsed word still records its exchange.
export function uniqueWords(blocks) {
  const groups=new Map();
  for(const block of blocks){
    const key=block.text.normalize('NFC').toLocaleLowerCase('en').replaceAll('’',"'");
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(block);
  }
  return [...groups.values()].map(occurrences=>({
    block:occurrences.find(b=>b.receivedOfferId)||occurrences[0],
    occurrences,
  }));
}
