import nlp from '../vendor/compromise.js';

export const categories = [
  ['noun','Nouns'], ['verb','Verbs'], ['describing','Describing words'],
  ['connecting','Connecting words'], ['other','Other'],
];
export function paletteGroup(block) {
  if(['common','link'].includes(block.writingGroup)) return 'connecting';
  if(['adjective','adverb'].includes(block.writingGroup)) return 'describing';
  return block.writingGroup || 'other';
}
const common = new Set('a an the am is are was were be been being do does did have has had can could will would shall should may might must i me my mine myself you your yours yourself he him his himself she her hers herself it its itself we us our ours ourselves they them their theirs themselves this that these those'.split(' '));
const connectors = new Set('aboard about above across after against along amid among around as at before behind below beneath beside besides between beyond by despite down during except for from in inside into like near of off on onto opposite outside over past since through throughout till to toward towards under underneath until up upon versus via with within without and or but nor yet so although because if unless while whereas whether than though'.split(' '));
const cache = new Map();
function writingGroup(text,tags) {
  if(common.has(text.toLowerCase().replace('’',"'")) || tags.includes('Determiner') || tags.includes('Pronoun') || tags.includes('Auxiliary')) return 'common';
  if(connectors.has(text.toLowerCase()) || tags.includes('Preposition') || tags.includes('Conjunction')) return 'link';
  if(tags.includes('Verb')) return 'verb';
  if(tags.includes('Adverb')) return 'adverb';
  if(tags.includes('Adjective')) return 'adjective';
  if(tags.includes('Noun')) return 'noun';
  return 'other';
}

// Tag complete source sentences, then align by character position rather than
// spelling. Repeated words can therefore have different tags in their context.
// These are English NLP estimates; writingGroup is a separate composition aid.
export function classifySource(source,blocks) {
  let entry=cache.get(source.id);
  if(!entry || entry.text!==source.text){
    const terms=nlp(source.text).json({offset:true}).flatMap(sentence=>sentence.terms);
    entry={text:source.text,terms};cache.set(source.id,entry);
    if(cache.size>12)cache.delete(cache.keys().next().value);
  }
  const terms=entry.terms;
  for(const block of blocks){
    if(block.category==='punctuation') {block.writingGroup='punctuation';block.grammarTags=[];continue;}
    // Binary search is important for lengthy imports: do not scan every term
    // for each of the source's blocks.
    let lo=0,hi=terms.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(terms[mid].offset.start<=block.start)lo=mid+1;else hi=mid;}
    const term=terms[lo-1];
    const matched=term && block.start<term.offset.start+term.offset.length;
    const tags=matched ? term.tags : [];
    block.grammarTags=[...tags];
    block.writingGroup=writingGroup(block.text,tags);
  }
}
export function classifyRoom(room) {
  const bySource=new Map();
  for(const block of room.blocks){if(!bySource.has(block.sourceId))bySource.set(block.sourceId,[]);bySource.get(block.sourceId).push(block);}
  for(const source of room.sources)classifySource(source,bySource.get(source.id)||[]);
}
