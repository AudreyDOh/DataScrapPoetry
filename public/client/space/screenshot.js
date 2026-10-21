import {toCanvas} from '../../vendor/html-to-image.js';

const fontCache = new Map();
async function embeddedFonts(snapshots, signal) {
  const faces = [...new Map([...snapshots.values()].flatMap(s => s?.faces || []).map(face => [JSON.stringify(face), face])).values()];
  const rules = await Promise.all(faces.map(async face => {
    for (const url of face.urls) {
      try {
        let data = fontCache.get(url);
        if (!data) {
          const response = await fetch(url, {signal, credentials:'omit', referrerPolicy:'no-referrer'});
          if (!response.ok) continue;
          const blob = await response.blob();
          data = await new Promise((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);});
          fontCache.set(url, data);
        }
        return `@font-face{font-family:${JSON.stringify(face.family)};src:url(${JSON.stringify(data)});font-weight:${face.weight};font-style:${face.style};unicode-range:${face.unicodeRange}}`;
      } catch { /* Existing system font fallback remains available. */ }
    }
    return '';
  }));
  return rules.join('\n');
}

// CSS3D pages and WebGL threads are separate layers. Capture both at the
// current camera position; exporting only renderer.domElement loses all pages.
export async function captureView({cssRoot, renderer, scene, camera, snapshots}) {
  const width = cssRoot.clientWidth, height = cssRoot.clientHeight;
  if (!width || !height) throw new Error('The view is not ready yet.');
  const ratio = Math.min(devicePixelRatio || 1, 2, 4096 / Math.max(width, height));
  const threads = document.createElement('canvas');
  threads.width = Math.round(width * ratio); threads.height = Math.round(height * ratio);
  // Read in the same task as rendering, before WebGL clears its drawing buffer.
  renderer.render(scene, camera);
  threads.getContext('2d').drawImage(renderer.domElement, 0, 0, threads.width, threads.height);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  let missingImages = 0;
  try {
    const fontEmbedCSS = await embeddedFonts(snapshots, controller.signal);
    const canvas = await toCanvas(cssRoot, {
      width, height, pixelRatio:ratio, backgroundColor:'#090b0c', fontEmbedCSS,
      includeQueryParams:true,
      fetchRequestInit:{signal:controller.signal, credentials:'omit', referrerPolicy:'no-referrer'},
      onImageErrorHandler:event => {missingImages++; event?.target?.remove();},
    });
    canvas.getContext('2d').drawImage(threads, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not save this screenshot. Please try again.');
    return {blob, missingImages};
  } finally {clearTimeout(timeout); controller.abort(); threads.width = threads.height = 0;}
}

export function downloadScreenshot(blob) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = `data-scrap-poetry-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
