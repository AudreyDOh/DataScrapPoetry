# Poetry Workshop — Facilitator script

An English speaking guide for six beginners. Use the timings loosely; leave most of the workshop for making and exchanging poems. Read the quoted passages aloud or adapt them to your voice. Instructions outside quotations are for the facilitator.

[View Page Source Online](https://viewpagesource.online/)

## Before students arrive

Open the app. Paste a prepared HTML excerpt and select Headings, Paragraphs and Other text. Leave List items unselected. Prepare one or two HTML excerpts whose text you have checked, plus original or permission-based text as a backup.

The online app supports up to 20 participants across laptops and phones. Enter your name and a room code of 6–10 letters or numbers, then choose **Create room**. The code you enter is kept exactly (letters become uppercase); for example, `8212026` stays `8212026`. Leave the code blank only if you want a generated code. Students enter their own names and the same code, then choose **Join room**. An existing code cannot be overwritten by creating another room. **Load page** downloads public HTML from a URL. English word grouping is automatic and approximate.

## Opening — about 10 minutes

> Today we’re going to make a short poem from words we find somewhere else. Then we’ll let some of those words travel to another person.
>
> You don’t need to know how to code. We’re going to notice what a computer receives, choose what we want to keep, and see what changes.
>
> Our starting material has a context: someone wrote it for a purpose. We’ll keep a record of where our words came from, even when we move them into a different context.

Ask: “What kinds of words might a recipe give us? What might a privacy statement give us?” Take a few responses; no need for a long discussion.

## Look inside a webpage — about 10–15 minutes

Point to the HTML source.

> A webpage has a structure underneath its appearance. HTML is one way that structure is written down.
>
> These pieces in angle brackets are tags. They tell the browser what kind of element something is.
>
> Here’s `<h1>`, then some words, then `</h1>`. The first tag opens a heading. The slash in the second tag closes it. Together, they mark the beginning and end of that element.

Point to the document wrappers in the source.

> `<html>` wraps the document. `<head>` holds information about the page, such as its title. `<body>` contains the page’s content.
>
> Inside the body, `<main>` groups the main content. Inside that, we have a heading, paragraphs, and a list. Elements can live inside other elements, like smaller boxes inside a bigger box.

Point to indentation in the HTML source.

> The indentation helps us see the nesting: a paragraph can contain another element, and the paragraph itself can live inside a larger container.

Point to `<p>Leave the <strong>window</strong> open.</p>`.

> A `<p>` marks a paragraph. Inside it, `<strong>` marks a word as important. It doesn’t create a second copy of “window.” When we collect this paragraph, we get “Leave the window open.”

Ask one student to identify the paragraph’s opening and closing tags. Ask another to identify the nested element.

## Choose what to keep — about 10 minutes

Point to the HTML selection checkboxes.

> We don’t have to take every piece of a webpage. We can choose by structure.
>
> Headings collects `<h1>` through `<h6>`. Those numbers describe heading levels. Paragraphs collects `<p>`. List items collects `<li>`, which lives inside an unordered list, `<ul>`, or an ordered list, `<ol>`.
>
> Other text collects writing outside those elements, including text directly inside `<div>`, `<section>` or a custom element such as Cargo’s `<bodycopy>`. It does not bring back unchecked headings, paragraphs or list items.
>
> Before we click: what do you predict will disappear if we turn off Headings?

Uncheck Headings. Compare the HTML source and Extracted text. Turn it back on, then select List items.

> The HTML didn’t change. Our selection changed. We gave the computer a different rule for what to keep.
>
> An unselected container can still have selected children. Our cleanup rules leave out navigation, scripts and styles.

Point to `<nav>`.

> This app leaves out navigation, scripts and styles. That is a choice we made for this exercise, not a rule that those parts never matter.

## Change an input — about 5 minutes

Ask a student to replace “moon” with “sun” in the HTML source.

> Watch the extracted text. One change to the input changes the output.
>
> Now try changing a word inside a paragraph. You can change the content without changing the tags around it.

If a student breaks the markup, inspect what happened without framing it as failure. Paste your prepared excerpt again if needed. Browsers try to repair malformed HTML, so the parsed structure may differ from the original text.

## Clean and collect — about 10–15 minutes

> The extracted text is our next material. We can edit it before we turn it into blocks.
>
> You might remove a repeated phrase or keep an unexpected word. Cleaning is a decision about what matters for your poem; it doesn’t have to mean making everything neat.

Demonstrate editing Extracted text, then Import words.

> Now the text has been split into words and punctuation. The tags are gone, but we still record the source.
>
> This import is a snapshot. Changing the HTML later won’t change the blocks we already made. Also, changing a tag selection generates fresh extracted text, so do your final text edits after choosing the tags.

For pasted HTML:

> Paste HTML into the source field. This does not download a live website. Some copied pages won’t contain readable text because the site uses extra code to load it later. We can try a different excerpt.

For plain-text backups:

> Pasting text skips the HTML step. We can still explore how text becomes blocks, but it isn’t the same as fetching a webpage.

## Optional code demonstration — Take out all punctuation

Use this during cleanup. Show the code separately; it is not extra interface text.

> We can give the computer one small instruction: take out all punctuation. Here is real JavaScript we can run in a browser console.

```javascript
const text = "Wait, listen—then begin. Are you ready?";
const cleaned = text.replace(/\p{P}+/gu, " ").replace(/\s+/gu, " ").trim();
console.log(cleaned);
// Wait listen then begin Are you ready
```

> `text` holds the original. `replace` finds a pattern and replaces it. `\p{P}` means a Unicode punctuation character. The `g` means every match, and `u` enables Unicode-aware matching. We replace punctuation with a space so words on either side of a dash do not run together. Then we combine repeated spaces and trim the ends.
>
> The original stays unchanged. `cleaned` holds the new version. What do you predict will happen to a comma? A question mark? An apostrophe?

Apostrophes and hyphens are punctuation too: “don't” becomes “don t.” Currency symbols and emoji are symbols, not Unicode punctuation. This is a deliberate opportunity to discuss how a broad cleanup rule can change meaning. The app now removes standalone punctuation blocks automatically during import. It keeps the original source text unchanged for context and word-position tracking.

If showing the app's existing block data instead of raw text, use a filter to leave whole word blocks intact:

```javascript
const blocks = [
  { text: "Wait", category: "unclassified" },
  { text: ",", category: "punctuation" },
  { text: "don't", category: "unclassified" },
  { text: ".", category: "punctuation" }
];
const wordsOnly = blocks.filter(block => block.category !== "punctuation");
console.log(wordsOnly.map(block => block.text));
// ["Wait", "don't"]
```

> `filter` keeps only items that pass a condition. Here we keep blocks whose category is not punctuation. Since “don't” was already one word block, its apostrophe stays inside it.

## Optional code demonstration — How the writing groups work

Place this after collecting words and before composing. This is a short demonstration within the existing session, not an additional timed activity.

> Is the app asking an LLM to sort our words? No. It uses a list we wrote and a rule-based English language library called Compromise. The online app runs this library on its server. It does not ask an LLM or an external AI service to classify the text.
>
> The palette has four main writing groups: Nouns for people, things and ideas; Verbs for actions; Describing words for adjectives and adverbs; Connecting words for articles, pronouns, helping verbs, prepositions and conjunctions. Other keeps words that the rules cannot identify. These are composition aids, not strict grammatical classes. “Is” remains grammatically a verb even though we display it with connecting words.

Show the list used by the app:

```javascript
const common = new Set('a an the am is are was were be been being do does did have has had can could will would shall should may might must i me my mine myself you your yours yourself he him his himself she her hers herself it its itself we us our ours ourselves they them their theirs themselves this that these those'.split(' '));
```

> A `Set` is a collection of unique values. Here, `split(" ")` separates the long string at each space to make a list of words. The Set lets us ask whether a word is on that list.

Run this small example in a browser console:

```javascript
const common = new Set(["a", "an", "the", "is", "was"]);

console.log(common.has("the"));               // true
console.log(common.has("window"));            // false
console.log(common.has("The".toLowerCase())); // true
```

> `has` checks membership. `toLowerCase` lets “The” match “the.” Nothing is being generated here: the computer is following a rule we can inspect and change.

Use the following as a separate example or a fresh console scope: it defines its own `common` variable.

Show the app’s actual category selection function alongside the full list above:

```javascript
function writingGroup(text,tags) {
  if(common.has(text.toLowerCase().replace('’',"'")) || tags.includes('Determiner') || tags.includes('Pronoun') || tags.includes('Auxiliary')) return 'common';
  if(connectors.has(text.toLowerCase()) || tags.includes('Preposition') || tags.includes('Conjunction')) return 'link';
  if(tags.includes('Verb')) return 'verb';
  if(tags.includes('Adverb')) return 'adverb';
  if(tags.includes('Adjective')) return 'adjective';
  if(tags.includes('Noun')) return 'noun';
  return 'other';
}
```

> The first condition asks whether the word is on our list, OR whether its grammar tags include Determiner, Pronoun, or Auxiliary. If any of those checks is true, it goes into Common words.
>
> A determiner is a word such as “the” or “this.” A pronoun is a word such as “she” or “they.” An auxiliary is a helping verb. The tags come from Compromise’s dictionary and language rules, applied to the original sentence.
>
> The order matters. “Is” can have a Verb tag, but it matches our Common words list first. Its grammar tag remains stored; we only choose a different place to display it.
>
> If it does not match that first condition, the code checks the other categories. `return` chooses a group and stops checking. Words that do not match any of these checks go into Other. Punctuation is handled separately before this function is called.

Optional demonstration using the same local library the app loads. Run this as a complete block in the app page’s browser console; the braces keep the variables local so the example can be repeated.

```javascript
{
  const { default: nlp } = await import("/vendor/compromise.js");
  const sentence = nlp("The bird is small.");
  const terms = sentence.json()[0].terms;
  console.table(terms.map(term => ({
    word: term.text,
    tags: term.tags.join(", ")
  })));
}
```

> We analyze the sentence before separating its words into movable blocks. That gives the rules some context, although automatic labels can still be wrong. A word can play different roles in different sentences.

Ask: “What would change if we removed ‘is’ from the list? Would you group these words differently for your own poem?”

Facilitator note: removing a word from the list does not guarantee a different group; its grammar tags may still meet the first condition. This is useful for showing that several rules can lead to the same result. The Common words list is manually chosen, not calculated from word frequency in the imported page.

A small explicit connector list also catches familiar linking words when the tagger is uncertain. For example, “under” is always available with Connecting words in this workshop. This is a writing choice: “up” or “like” can have other grammatical roles in real sentences. The original grammar tags remain stored.

```javascript
const connectors = new Set('aboard about above across after against along amid among around as at before behind below beneath beside besides between beyond by despite down during except for from in inside into like near of off on onto opposite outside over past since through throughout till to toward towards under underneath until up upon versus via with within without and or but nor yet so although because if unless while whereas whether than though'.split(' '));
```

## From grammar tags to the four palette groups

> We keep the detailed grammar tags, then combine them into fewer groups for writing. “Soft” and “slowly” go together as Describing words. “The,” “is,” “under,” and “and” go together as Connecting words. Here, “connecting” means useful for assembling a phrase; it does not mean only conjunctions.

This is the actual display mapping used by the app, after `writingGroup` above:

```javascript
export function paletteGroup(block) {
  if (['common', 'link'].includes(block.writingGroup)) return 'connecting';
  if (['adjective', 'adverb'].includes(block.writingGroup)) return 'describing';
  return block.writingGroup || 'other';
}
```

> The original sentence supplies context. Compromise estimates its grammar tags, the ordered rules assign a detailed group, and this function combines those groups for the palette. The app stores original source positions and tags; changing the display does not erase them. Words can have more than one role, and automatic labels can be wrong. Other makes uncertainty visible.

## Saving the source link

> Paste the public webpage link above its HTML. The link is saved when you click Import words, alongside that collection’s source. It does not download the webpage. Every block retains a source ID, so an exported poem can trace a word back to the saved URL. This is the connection we can use in the three-dimensional visualization.

## Repeated words in the palette

> Repeated words are shown once in each writing group. “The” and “the” count as the same word. A word with different grammatical roles can still appear in different groups. You can use a displayed word more than once in your poem.

The palette merges display entries only. Source occurrences, original capitalization, and exchange identities remain stored. If a group contains a received copy, that copy is used as the displayed block so placing it in a poem records the exchange. Other occurrences remain in the exported room data.

## First poem — about 20 minutes

> Choose a line, then click words or drag them into the poem. Click a word in the poem to remove it. You can drag words between lines.
>
> Start with a few words that catch your attention. They don’t have to make a sentence yet.
>
> Aim for something short: around three to six lines. You don’t have to count syllables. Leave space for a word you haven’t met yet.

Give students quiet making time. Optional prompts, one at a time:

- “Which word feels different outside its original page?”
- “What changes if you remove one word?”
- “What happens if the last line comes first?”

The app estimates English parts of speech using each source sentence. Standalone punctuation blocks are discarded before appearing in the collection. Labels can be wrong. Connecting words is a composition group, not a grammatical class: “is” is a verb but is placed beside “a” and “the” for convenient writing. A word such as “light” can play different roles in different sentences.

## Release and receive — about 20 minutes

> Pick a word you’re willing to send into the void. Drag it into the shared space.
>
> You’re releasing a copy. Your own word stays with you.
>
> A shared word never runs out. Anyone can use it, and you can use it more than once. Choose a poem line, then press Use word. It adds the word to that line and also gives you a copy in your collection. Other people can still use the same offering.

In this prototype, switch participants to demonstrate claiming. Do not imply that this is a live online exchange.

> Find a word someone else offered. Choose a line and press Use word to put it into your poem. You can move it afterward, or use it again.
>
> You can take it out again while you experiment. Your final poem should include at least one received word.

Optional prompt: “Did their word change what you thought your poem was about?”

## Revise and share — about 15–20 minutes

> Read your poem quietly once. Move something, or take something away.
>
> When you’re ready, read it aloud. You can tell us where your words started and which word came from another person.

Invite each participant to read or pass. Ask listeners to notice how the same word can change with its surroundings.

## Closing — about 5 minutes

> We started with a structured document, chose parts of it, extracted text, and turned it into movable pieces. Then we changed the meaning by changing the arrangement and the person using it.
>
> We’ve also kept a record of the exchanges. Later, we can use those records to draw connections between poems.

Export the data. The JSON contains the room, source records, and graph edges for received blocks actually used in poems. The graph data is available; the Three.js view is not yet built. Each laptop’s local data must currently be exported separately.

## Short answers to likely questions

**“Is HTML a programming language?”**

> HTML is a markup language: it describes structure. Our JavaScript code does the work of reading that structure, selecting text and creating blocks.

**“Why isn’t `<strong>` a checkbox?”**

> We’re choosing larger pieces first. If a selected paragraph contains a strong element, its words come along with the paragraph.

**“Does removing a tag delete its words?”**

> It depends on the operation. Extracting a paragraph keeps its words without the tags. Excluding a whole section leaves out its words too. Those are different choices.

**“Why do we keep ‘the’ or ‘was’?”**

> Connecting words help create relationships, rhythm and time. They can be useful poetic material. “Was” is also a verb; “common word” and “part of speech” are different ways to describe a word.

**“Can we use any website?”**

> Websites have different structures, access rules and permissions. We’ll use material we can collect and reuse appropriately. If a page doesn’t work, we have another source ready.

## Import behavior

> Each time you send new text, your Collect palette starts again with only that import. Finish choosing words before sending another source. Your existing poem and exchange records stay in place.

## Actual parsing pipeline used by the app

Show this separately from the workshop interface.

> The browser receives pasted HTML as text. We parse it into an inert template, so the pasted page is not run as an active website. Then we remove scripts, styles, navigation and other excluded parts, and choose the checked elements.

```javascript
const template = document.createElement("template");
template.innerHTML = html;

template.content.querySelectorAll(
  'script,style,nav,header,footer,aside,noscript,iframe,object,embed,svg,template,form,[hidden],[aria-hidden="true"]'
).forEach(element => element.remove());

const selectors = {
  headings: "h1,h2,h3,h4,h5,h6",
  paragraphs: "p",
  lists: "li"
};
const selector = selectedGroups.map(group => selectors[group]).join(",");
const elements = selector ? [...template.content.querySelectorAll(selector)] : [];
const parents = new Set(elements);
const topLevel = elements.filter(element => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parents.has(parent)) return false;
  }
  return true;
});
const text = topLevel.map(element => {
  element.querySelectorAll("br").forEach(br => br.replaceWith(document.createTextNode(" ")));
  return element.textContent.replace(/\s+/g, " ").trim();
}).filter(Boolean).join("\n\n");
```

> `html` is the pasted HTML string. `selectedGroups` is an array such as `["headings", "paragraphs"]`, taken from the checkboxes. These names are inputs to the example. A selected element inside another selected element is collected once, with its parent. This avoids duplicating nested text.
>
> Next, we separate the text into word and punctuation tokens. This pattern keeps a contraction such as “don't” as one word.

```javascript
const tokens = [...text.matchAll(
  /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*|[^\s\p{L}\p{M}\p{N}]/gu
)];
const blocks = tokens.map(match => ({
  text: match[0],
  start: match.index,
  end: match.index + match[0].length,
  category: /^[\p{L}\p{N}]/u.test(match[0]) ? "unclassified" : "punctuation"
}));
const wordsOnly = blocks.filter(block => block.category !== "punctuation");
```

> `wordsOnly` is what we keep for the writing palette. Commas, periods, quotation marks and standalone symbols are left out. An apostrophe inside “don't” remains part of that word. We keep each word’s position in the original text, so its grammar and source context are still traceable.
>
> This simplified block example omits the IDs, ownership and source fields that the full app adds. It shows the same tokenization and punctuation rule. We do not strip punctuation from the source sentence before grammar analysis.

The exact removal in `replaceCollection` is:

```javascript
const punctuationIds = new Set(
  result.blocks.filter(block => block.category === "punctuation").map(block => block.id)
);
result.blocks = result.blocks.filter(block => block.category !== "punctuation");
room.blocks = room.blocks.filter(block => !punctuationIds.has(block.id));
```

Here `result` contains the newly created source and blocks, and `room.blocks` contains the room's stored blocks. Existing punctuation blocks are also removed when the online server loads a room, including references in poems and shared offers, so old punctuation does not reappear.

## Search and poem editing

> Search matches part of a word and ignores capitalization. It narrows what you see; it does not delete words or change your poem.

```javascript
const query = searchInput.value.toLowerCase();
const matches = blocks.filter(block => block.text.toLowerCase().includes(query));
```

> Drag a poem word between lines, or drop it between words to change their order. The insertion marker shows where it will land. To split a phrase, select the last word you want on the current line, then press Space or Enter, or choose Split line. The words after it move to the start of the next line. Words already there remain after them.
>
> On a touch screen, you can also select a poem word and tap another line to move it there. To delete a selected word, use Remove word, Backspace or Delete. Clicking a poem word selects it rather than deleting it.

## Shared words do not run out

> Throwing a word into the shared space makes it available to everyone. Use word places it in your selected line without removing it from the shared space. You and other participants can keep using it. The export records a connection for each person who uses it, including how many times it appears.

## The public page space

“Each sheet is a source page. We removed colored backgrounds, made the text white,
and turned images grayscale. The pages begin evenly spaced around a circle. Each
one faces along the circle, like people following one another in a queue.”

“The numbers follow a poem in reading order, across its line breaks. A thread can
leave your page and visit someone else's original word. Red threads show these
borrowed passages. The other person does not have to use that word in their own
poem for the connection to exist.”

“Drag a page. It stays suspended where you leave it. Only the thread responds to
gravity. The thread has a length, so it resists being pulled too far. Threads also
collide with other threads and with the sheets. These are physical constraints,
not just a wavy line animation. Reset circle returns everything to the beginning.”

“Double-click a sheet to read the source beside the complete poem. Click a word
in the poem to visit its source page. Trace poem draws the sequence in order.”

### How a word keeps its address

The import now stores a safe page structure plus an address for each matched word:

```js
{ key: 12, offset: 27, start: 84, length: 4 }
```

`key` identifies a text node in the page; `offset` locates the word inside that node.
`start` locates the same occurrence inside the extracted text. A shared copy keeps
its original `sourceId` and `start`. Equal spelling alone never creates a connection.
The viewer measures that word's position in the preserved page structure and moves
its address into 3D space. Repeated uses return to the same original occurrence.

### How the circle and thread work

```js
const angle = index / pageCount * Math.PI * 2;
page.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
page.rotation.y = -angle; // The page's front faces along the circle's tangent.
```

A thread is a chain of points. Every frame it keeps a little of its previous motion,
moves down under gravity, and repeatedly corrects its segment lengths and collisions.
Endpoints stay attached to words. Pages move only when the viewer drags them.
This is an iterative, finite-resolution simulation: it is not an exact knot solver.
Very fast motion and dense tangles can still produce contact inaccuracies.

### Showing and saving the work (host only)

“Your screen is for collecting words, sharing them, and writing. I can open our
pages and poems together in a separate Visualization window.”

The room supports ten people, including its creator. Only the creator sees
**Visualization**, **Download visualization**, and **Download & new room**.
Participant sessions cannot open the room visualization or export through the API.
The extracted-text limit is now **100,000 characters per import**. Duplicate palette
words are stored once, preserving the first occurrence's source position.

```js
const seen = new Set();
const unique = blocks.filter(block => {
  const spelling = block.text.toLowerCase().replace('’', "'");
  if (block.category === 'punctuation' || seen.has(spelling)) return false;
  seen.add(spelling);
  return true; // Keep its original sourceId and start offset.
});
```

“At the end, I download a visualization file containing our source-page layouts,
source text, poems, and word paths. Then I can start a clean room.”

1. Choose **Download & new room**. Downloading pauses editing so the file and the
   final room state agree.
2. Save the JSON file and check **I saved the visualization file**.
3. Choose **Delete old room & start new**. This deletes that room's working data,
   page captures, and old published view. Other rooms stay intact. Cancel resumes
   the current room instead.
4. Open **Visualization → Open archive** to load the saved file later. It is read
   locally in the browser. No room membership or server copy is required.

The archive excludes session credentials and unused word blocks. It preserves
original word positions so borrowing still connects to the donor's page. Images
and fonts are referenced by URL; the file does not embed all external assets.

### Importing a website as a transparent page

“Paste a public webpage address and choose **Load page**. The server downloads its
HTML; the checkboxes choose which text becomes our material. Edit that extracted
text if you want, then choose **Import words**. Your word collection and a visual
record of the original page are saved together.”

“The browser reads the original CSS, places the text and images, and measures where
each word is. We keep that arrangement, remove colored surfaces, turn the letters
white, and make the images grayscale. A screenshot would turn the words into pixels;
our measured page keeps each word's address so a thread can find it.”

```js
const response = await fetch(publicURL, { redirect: 'manual' });
const html = await response.text(); // The production reader also bounds byte size.

// In a separate frame, with original scripts disabled:
range.setStart(textNode, wordOffset);
range.setEnd(textNode, wordOffset + word.length);
const box = range.getBoundingClientRect();

// The saved record contains visual data, never original executable HTML.
const wordOnPage = {
  type: 'text', text: word, font: fontIndex,
  x: box.x, y: box.y, w: box.width, h: box.height,
  start: extractedTextOffset
};
```

`sourceId` and `start` still identify the original occurrence. The viewer uses its
saved rectangle as the thread endpoint; duplicate spellings do not create false
connections. Edited words that cannot be matched, or words hidden in the original
layout, appear below the captured page in a labeled area.

**Import words** also captures the URL automatically when HTML/extracted text is
already present. **Load page** is the convenient way to fill both from a URL.
Without a URL, pasted HTML can still be measured, including inline styles. With a
URL, linked stylesheets and relative images can be resolved. If a URL fails and
pasted HTML is available, the app explicitly reports that it used the pasted HTML.

The capture uses a 1,200-pixel desktop viewport, on phones as well as laptops, so
participants see the same starting layout. It preserves static page composition,
not a live interactive copy. Login-only pages, bot-blocked sites, and pages that
create their content through JavaScript may not load. Remote images and fonts still
depend on their hosts; missing styles are reported. Inline SVG/canvas, video, some
CSS-generated artwork, rotations and clipped effects are not reproduced exactly.
Long captures are bounded to 20,000 pixels high and about 9,000 text/image records.
Old imports keep their saved version until reimported. Reopen **Visualization**
to see later edits, or download a fresh visualization archive.

Implementation references:
- [Three.js](https://threejs.org/docs/)
- [Position Based Dynamics](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)
