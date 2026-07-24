const PDF_URL = 'catalogo.pdf';
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfDoc;
let pageFlip;
let currentPage = 0;
let zoom = 1;
let pageTexts = [];
let pageCanvases = [];

const el = id => document.getElementById(id);
const loading = el('loading');
const loadingText = el('loadingText');
const book = el('book');
const thumbnails = el('thumbnails');

function setLoading(text) { loadingText.textContent = text; }
function updateIndicator(index = currentPage) {
  currentPage = Math.max(0, index);
  const total = pdfDoc?.numPages || 0;
  el('pageIndicator').textContent = `Página ${Math.min(currentPage + 1, total)} de ${total}`;
  document.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('active', i === currentPage));
}

async function renderPage(pageNumber, scale = 1.65) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function loadCatalog() {
  try {
    if (!window['pdfjs-dist/build/pdf']) {
      throw new Error('PDF.js no se cargó. Revisa la conexión a internet.');
    }
    if (!window.St || !window.St.PageFlip) {
      throw new Error('El motor PageFlip no se cargó. Revisa la conexión a internet.');
    }

    setLoading('Abriendo archivo PDF…');
    pdfDoc = await pdfjsLib.getDocument({ url: PDF_URL, disableAutoFetch: false }).promise;
    const total = pdfDoc.numPages;
    const pageNodes = [];

    for (let i = 1; i <= total; i++) {
      setLoading(`Cargando página ${i} de ${total}`);
      const [canvas, page] = await Promise.all([renderPage(i), pdfDoc.getPage(i)]);
      pageCanvases.push(canvas);

      const textContent = await page.getTextContent();
      pageTexts.push(textContent.items.map(item => item.str).join(' '));

      const pageEl = document.createElement('div');
      pageEl.className = 'page';
      pageEl.dataset.density = (i === 1 || i === total) ? 'hard' : 'soft';
      pageEl.appendChild(canvas);
      book.appendChild(pageEl);
      pageNodes.push(pageEl);

      const thumb = document.createElement('button');
      thumb.className = 'thumb';
      thumb.type = 'button';
      const thumbCanvas = document.createElement('canvas');
      const ratio = 180 / canvas.width;
      thumbCanvas.width = 180;
      thumbCanvas.height = Math.round(canvas.height * ratio);
      thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const number = document.createElement('span');
      number.textContent = i;
      thumb.append(thumbCanvas, number);
      thumb.addEventListener('click', () => { pageFlip.flip(i - 1); closeSidebar(); });
      thumbnails.appendChild(thumb);
    }

    const firstPage = await pdfDoc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const ratio = baseViewport.width / baseViewport.height;
    const baseHeight = 760;
    const baseWidth = Math.round(baseHeight * ratio);

    pageFlip = new St.PageFlip(book, {
      width: baseWidth,
      height: baseHeight,
      size: 'stretch',
      minWidth: 270,
      maxWidth: baseWidth,
      minHeight: 350,
      maxHeight: baseHeight,
      maxShadowOpacity: 0.55,
      showCover: true,
      mobileScrollSupport: false,
      usePortrait: true,
      flippingTime: 900,
      drawShadow: true,
      autoSize: true
    });

    pageFlip.loadFromHTML(pageNodes);
    pageFlip.on('flip', e => updateIndicator(e.data));
    pageFlip.on('changeOrientation', () => setTimeout(() => pageFlip.update(), 100));

    updateIndicator(0);
    loading.classList.add('hidden');
  } catch (error) {
    console.error(error);
    const detail = error && error.message ? error.message : 'Error desconocido';
    loading.innerHTML = `<strong>No se pudo cargar el catálogo.</strong><span>${escapeHtml(detail)}</span><a class="primary-button error-download" href="${PDF_URL}" target="_blank" rel="noopener">Abrir PDF para comprobar</a>`;
  }
}

function openSidebar(mode) {
  const sidebar = el('sidebar');
  const searchMode = mode === 'search';
  el('searchPanel').classList.toggle('hidden', !searchMode);
  thumbnails.style.display = searchMode ? 'none' : 'grid';
  el('sidebarTitle').textContent = searchMode ? 'Buscar en el catálogo' : 'Páginas';
  sidebar.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
  if (searchMode) setTimeout(() => el('searchInput').focus(), 180);
}
function closeSidebar() {
  el('sidebar').classList.remove('open');
  el('sidebar').setAttribute('aria-hidden', 'true');
}

function doSearch() {
  const query = el('searchInput').value.trim().toLocaleLowerCase('es');
  const results = el('searchResults');
  results.innerHTML = '';
  if (!query) return;
  const matches = [];
  pageTexts.forEach((text, index) => {
    const normalized = text.toLocaleLowerCase('es');
    if (normalized.includes(query)) matches.push({ index, text });
  });
  if (!matches.length) {
    results.innerHTML = '<p>No se encontraron coincidencias.</p>';
    return;
  }
  matches.forEach(match => {
    const button = document.createElement('button');
    button.className = 'search-result';
    button.innerHTML = `<strong>Página ${match.index + 1}</strong><small>${escapeHtml(snippet(match.text, query))}</small>`;
    button.addEventListener('click', () => { pageFlip.flip(match.index); closeSidebar(); });
    results.appendChild(button);
  });
}
function snippet(text, query) {
  const lower = text.toLocaleLowerCase('es');
  const position = lower.indexOf(query);
  const start = Math.max(0, position - 55);
  return `${start > 0 ? '…' : ''}${text.slice(start, position + query.length + 80)}…`;
}
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function applyZoom(value) {
  zoom = Math.min(1.5, Math.max(.75, value));
  book.style.transform = `scale(${zoom})`;
  el('zoomIndicator').textContent = `${Math.round(zoom * 100)}%`;
}

el('openCatalog').addEventListener('click', () => el('welcome').classList.add('hidden'));
el('prev').addEventListener('click', () => pageFlip?.flipPrev());
el('next').addEventListener('click', () => pageFlip?.flipNext());
el('previousPage').addEventListener('click', () => pageFlip?.flipPrev());
el('nextPage').addEventListener('click', () => pageFlip?.flipNext());
el('firstPage').addEventListener('click', () => pageFlip?.flip(0));
el('lastPage').addEventListener('click', () => pageFlip?.flip((pdfDoc?.numPages || 1) - 1));
el('zoomIn').addEventListener('click', () => applyZoom(zoom + .1));
el('zoomOut').addEventListener('click', () => applyZoom(zoom - .1));
el('toggleThumbs').addEventListener('click', () => openSidebar('thumbs'));
el('toggleSearch').addEventListener('click', () => openSidebar('search'));
el('closeSidebar').addEventListener('click', closeSidebar);
el('searchButton').addEventListener('click', doSearch);
el('searchInput').addEventListener('keydown', event => { if (event.key === 'Enter') doSearch(); });
el('fullscreen').addEventListener('click', async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
});
document.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') pageFlip?.flipPrev();
  if (event.key === 'ArrowRight') pageFlip?.flipNext();
  if (event.key === 'Escape') closeSidebar();
});

loadCatalog();
