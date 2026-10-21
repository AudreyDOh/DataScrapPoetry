import { createId } from './id.js';
// This is the room's rulebook. Run mutations on the server, never trust a
// participant ID supplied by the browser without checking its session.
export function createRoom() {
  return { version: 1, participants: [], sources: [], blocks: [], offers: [], poems: [] };
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function participant(room, id) {
  return requireValue(room.participants.find(p => p.id === id), 'Unknown participant');
}

export function joinRoom(room, name) {
  requireValue(typeof name === 'string' && name.trim(), 'A nickname is required');
  const person = { id: createId(), name: name.trim().slice(0, 40) };
  room.participants.push(person);
  room.poems.push({ id: createId(), authorId: person.id, lines: [[], [], [], []] });
  return person;
}

export function addSource(room, ownerId, { title, url = null, method = 'paste', text, pageId = null }) {
  participant(room, ownerId);
  requireValue(typeof text === 'string' && text.trim(), 'Source text is required');
  requireValue(['paste', 'html', 'url'].includes(method), 'Unknown import method');
  const source = { id: createId(), ownerId, title: String(title || 'Untitled'), url, method, text, pageId };
  room.sources.push(source);
  // Preserve spelling, punctuation and offsets. Grammar tagging is a separate
  // step: a word must be read in context before deciding its part of speech.
  const tokens = text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*|[^\s\p{L}\p{M}\p{N}]/gu);
  const blocks = [...tokens].map(match => ({
    id: createId(), ownerId, sourceId: source.id,
    text: match[0], start: match.index, end: match.index + match[0].length,
    category: /^[\p{L}\p{N}]/u.test(match[0]) ? 'unclassified' : 'punctuation',
    receivedOfferId: null,
  }));
  room.blocks.push(...blocks);
  return { source, blocks };
}

// Replace only the active owner's collection. Referenced blocks remain available
// to existing poems and exchanges; unreferenced old material is removed.
export function replaceCollection(room, ownerId, input) {
  return applyCollection(room, ownerId, addSource(room, ownerId, input));
}

export function applyCollection(room, ownerId, result) {
  if (!room.sources.some(s => s.id === result.source.id)) {
    room.sources.push(result.source); room.blocks.push(...result.blocks);
  }
  const punctuationIds = new Set(result.blocks.filter(block => block.category === 'punctuation').map(block => block.id));
  result.blocks = result.blocks.filter(block => block.category !== 'punctuation');
  room.blocks = room.blocks.filter(block => !punctuationIds.has(block.id));
  const fresh = new Set(result.blocks.map(b => b.id));
  const referenced = new Set(room.poems.flatMap(p => p.lines.flat()));
  for (const offer of room.offers) {
    referenced.add(offer.blockId);
    if (offer.receivedBlockId) referenced.add(offer.receivedBlockId);
  }
  room.blocks = room.blocks.filter(block => {
    if (block.ownerId !== ownerId || fresh.has(block.id)) return true;
    if (referenced.has(block.id)) { block.archivedFromCollection = true; return true; }
    return false;
  });
  const usedSources = new Set([...room.blocks.map(b => b.sourceId), ...Object.entries(room._collections||{}).filter(([id])=>id!==ownerId).map(([,sourceId])=>sourceId)]);
  room.sources = room.sources.filter(source => usedSources.has(source.id));
  return result;
}

export function throwBlock(room, senderId, blockId) {
  participant(room, senderId);
  const block = requireValue(room.blocks.find(b => b.id === blockId && b.ownerId === senderId), 'Not your block');
  requireValue(!block.receivedOfferId, 'Received blocks cannot be offered again');
  requireValue(!room.offers.some(o => o.blockId === blockId), 'This block is already in the void');
  const offer = { id: createId(), blockId, senderId, recipientId: null, receivedBlockId: null };
  room.offers.push(offer);
  return offer;
}

// Shared offers are permanent supplies, not single-use claims.
export function claimBlock(room, recipientId, offerId) {
  participant(room, recipientId);
  const offer = requireValue(room.offers.find(o => o.id === offerId), 'Unknown offer');
  const original = requireValue(room.blocks.find(b => b.id === offer.blockId), 'Missing original block');
  if(offer.senderId === recipientId){original.archivedFromCollection=false;return original;}
  const existing=room.blocks.find(b=>b.ownerId===recipientId&&b.receivedOfferId===offer.id);
  if(existing){existing.archivedFromCollection=false;return existing;}
  const copy = { ...original, id: createId(), ownerId: recipientId, archivedFromCollection: false, receivedOfferId: offer.id };
  room.blocks.push(copy);
  return copy;
}

export function savePoem(room, authorId, lines) {
  participant(room, authorId);
  requireValue(Array.isArray(lines) && lines.length >= 1 && lines.length <= 6 && lines.every(Array.isArray), 'Use one to six lines');
  requireValue(lines.flat().every(id => room.blocks.some(b => b.id === id && b.ownerId === authorId)), 'Poem contains an unavailable block');
  const poem = room.poems.find(p => p.authorId === authorId);
  poem.lines = lines.map(line => [...line]);
  return poem;
}

export function hasBorrowedWord(room, authorId) {
  const poem = requireValue(room.poems.find(p => p.authorId === authorId), 'Unknown poem');
  return poem.lines.flat().some(id => room.blocks.some(b => b.id === id && b.receivedOfferId));
}

// Graph connections record actual exchanges, never coincidental spelling.
export function exportGraph(room) {
  const nodes = room.poems.map(poem => ({
    id: poem.id, authorId: poem.authorId,
    name: participant(room, poem.authorId).name,
    lines: poem.lines.map(line => line.map(id => room.blocks.find(b => b.id === id).text)),
  }));
  const edges = [];
  for(const offer of room.offers){
    const sender=room.poems.find(p=>p.authorId===offer.senderId);
    const original=room.blocks.find(b=>b.id===offer.blockId);
    if(!sender||!original)continue;
    for(const recipient of room.poems){
      if(recipient.authorId===offer.senderId)continue;
      const copies=new Set(room.blocks.filter(b=>b.ownerId===recipient.authorId&&b.receivedOfferId===offer.id).map(b=>b.id));
      const uses=recipient.lines.flat().filter(id=>copies.has(id)).length;
      if(!uses)continue;
      edges.push({id:`${offer.id}:${recipient.id}`,offerId:offer.id,source:sender.id,target:recipient.id,
        text:original.text,sourceId:original.sourceId,uses,senderUsesWord:sender.lines.flat().includes(original.id)});
    }
  }
  return { version: 1, nodes, edges };
}
