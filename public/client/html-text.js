// Keep extraction and source-page word anchors on the same selection rules.
// This reads an inert DOM; it does not execute the imported page's scripts.
const excluded = 'head,title,meta,link,script,style,nav,header,footer,aside,noscript,iframe,object,embed,svg,template,form,button,textarea,select,[hidden],[aria-hidden="true"],[role="navigation"],[role="toolbar"],.print-information';
const boundaries = new Set('h1 h2 h3 h4 h5 h6 p li div section article main bodycopy blockquote pre figure figcaption ul ol dl dt dd table tr td th hr br'.split(' '));
const groupFor = tag => /^h[1-6]$/.test(tag) ? 'headings' : tag === 'p' ? 'paragraphs' : tag === 'li' ? 'lists' : null;

export function htmlTextRuns(root, groups) {
  const enabled = new Set(groups);
  const walker = root.ownerDocument.createTreeWalker(root, 5); // elements + text
  const runs = [];
  let nodes = [], container = null;
  function flush() {
    const text = nodes.map(node => node.data).join('').replace(/\s+/g, ' ').trim();
    if (text) runs.push({ tag: container?.localName || 'text', text, nodes });
    nodes = []; container = null;
  }
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 1) {
      if (boundaries.has(node.localName)) flush();
      continue;
    }
    const parent = node.parentElement;
    if (parent?.closest(excluded)) { flush(); continue; }
    let semantic = false, selected = false, block = null;
    for (let element = parent; element; element = element.parentElement) {
      if (!block && boundaries.has(element.localName)) block = element;
      const group = groupFor(element.localName);
      if (group) { semantic = true; if (enabled.has(group)) selected = true; }
      if (element === root) break;
    }
    // Other text never reintroduces an unchecked heading, paragraph or list.
    if (!selected && (semantic || !enabled.has('other'))) { flush(); continue; }
    if (block !== container) flush();
    container = block; nodes.push(node);
  }
  flush();
  return runs;
}
