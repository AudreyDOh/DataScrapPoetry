// Position is measured before removing the source word.
export function moveWord(lines,{from,to,index,toIndex,blockId}){
  const valid=(n,max)=>Number.isInteger(n)&&n>=0&&n<max;
  if(!valid(from,lines.length)||!valid(to,lines.length)||!valid(index,lines[from].length)||lines[from][index]!==blockId)throw new Error('The poem changed. Try again.');
  const position=toIndex??lines[to].length;
  if(!Number.isInteger(position)||position<0||position>lines[to].length)throw new Error('Invalid word position.');
  const next=lines.map(l=>[...l]);next[from].splice(index,1);
  next[to].splice(position-(from===to&&index<position?1:0),0,blockId);
  return next;
}
export function splitLine(lines,{line,index,blockId}){
  if(!Number.isInteger(line)||line<0||line>=lines.length||!Number.isInteger(index)||index<0||index>=lines[line].length||lines[line][index]!==blockId)throw new Error('The poem changed. Try again.');
  if(line===lines.length-1&&lines.length>=6)throw new Error('Maximum six lines. Move words to an existing line.');
  const next=lines.map(l=>[...l]);const rest=next[line].splice(index+1);
  if(line===next.length-1)next.push([]);
  next[line+1].unshift(...rest);
  return next;
}
