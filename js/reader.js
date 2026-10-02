/**
 * Interactive Reader Controller
 * Renders a chapter from data/chapters/chapter_N.json (generated from the book PDF by
 * scripts/build_from_pdf.py): headings, paragraphs, Koran verses, lists, tables,
 * numbered footnotes (popover + list), printed-page markers and the pictures, which stand
 * at the paragraph they belong to. Also: scroll-spy, remaining reading time, resume.
 */

const LAST_CHAPTER = 40;
const WORDS_PER_MIN = 190;

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* private mode: ignore */ }
}

/* ---------------------------------------------------------------------------
   Footnote popover: the note opens right above the marker, the reader keeps his place.
   --------------------------------------------------------------------------- */
class FootnotePopover {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'fn-popover';
    this.el.id = 'fn-popover';
    this.el.setAttribute('role', 'note');
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.anchor = null;
    this.pinned = false;
    this.hideTimer = null;
    this.showTimer = null;
    this.canHover = window.matchMedia('(hover: hover)').matches;

    this.el.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
    this.el.addEventListener('mouseleave', () => { if (!this.pinned) this.scheduleHide(250); });
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('.fn-pop-close')) { this.hide(); return; }
      const go = e.target.closest('a[data-go]');
      if (go) {
        e.preventDefault();
        const id = go.dataset.go;
        this.hide();
        window.bookReader.scrollToId(id);
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hide(); });
    document.addEventListener('click', (e) => {
      if (this.el.hidden) return;
      if (!e.target.closest('.fn-popover') && !e.target.closest('.fn-ref a')) this.hide();
    }, true);
    window.addEventListener('resize', () => this.hide());

    // hover (mouse) – click/tap/Enter pins the note (touch, keyboard)
    document.addEventListener('mouseover', (e) => {
      if (!this.canHover) return;
      const a = e.target.closest('.reader-view .fn-ref a');
      if (!a || this.pinned) return;
      clearTimeout(this.hideTimer);
      clearTimeout(this.showTimer);
      this.showTimer = setTimeout(() => this.show(a, false), 140);
    });
    document.addEventListener('mouseout', (e) => {
      const a = e.target.closest('.reader-view .fn-ref a');
      if (!a) return;
      clearTimeout(this.showTimer);
      if (!this.pinned) this.scheduleHide(250);
    });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('.reader-view .fn-ref a');
      if (!a) return;
      e.preventDefault();
      if (this.anchor === a && this.pinned) this.hide();
      else this.show(a, true);
    });
  }

  content(n) {
    const item = document.getElementById('fn-' + n);
    if (!item) return null;
    const txt = item.querySelector('.footnote-text').cloneNode(true);
    txt.querySelectorAll('.fn-back').forEach(x => x.remove());
    return txt.innerHTML;
  }

  show(anchor, pin) {
    clearTimeout(this.hideTimer);
    const n = anchor.textContent.trim();
    const html = this.content(n);
    if (!html) return false;
    if (this.anchor && this.anchor !== anchor) this.anchor.setAttribute('aria-expanded', 'false');
    this.anchor = anchor;
    this.pinned = !!pin;
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', 'fn-popover');
    this.el.innerHTML = `
      <div class="fn-pop-head"><span>Anmerkung ${escapeHtml(n)}</span><button class="fn-pop-close" aria-label="Schließen">×</button></div>
      <div>${html}</div>
      <div class="fn-pop-foot"><a href="#fn-${escapeHtml(n)}" data-go="fn-${escapeHtml(n)}">Zur Anmerkung am Kapitelende ↓</a></div>`;
    this.el.hidden = false;
    this.position();
    requestAnimationFrame(() => this.el.classList.add('open'));
    return true;
  }

  position() {
    if (!this.anchor || window.innerWidth <= 700) return;   // small screens: bottom sheet via CSS
    const r = this.anchor.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const sx = window.scrollX;
    const sy = window.scrollY;
    let left = r.left + sx + r.width / 2 - w / 2;
    left = Math.max(sx + 12, Math.min(left, sx + window.innerWidth - w - 12));
    let top = r.top + sy - h - 10;
    if (r.top < h + 20) top = r.bottom + sy + 10;
    this.el.style.left = left + 'px';
    this.el.style.top = top + 'px';
  }

  scheduleHide(ms) {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { if (!this.pinned) this.hide(); }, ms);
  }

  hide() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    if (this.el.hidden) return;
    this.el.classList.remove('open');
    if (this.anchor) this.anchor.setAttribute('aria-expanded', 'false');
    this.anchor = null;
    this.pinned = false;
    setTimeout(() => { if (!this.anchor) this.el.hidden = true; }, 180);
  }
}

/* ---------------------------------------------------------------------------
   Selecting text in the book shows a small bar: copy as a citation (with chapter and printed
   page) or copy a link that opens the book at exactly that paragraph.
   --------------------------------------------------------------------------- */
class SelectionCite {
  constructor(reader) {
    this.reader = reader;
    this.bar = document.createElement('div');
    this.bar.className = 'cite-bar';
    this.bar.hidden = true;
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Auswahl zitieren');
    this.bar.innerHTML = `<button data-act="quote">Zitat kopieren</button><button data-act="link">Link kopieren</button>`;
    document.body.appendChild(this.bar);
    this.timer = null;
    this.info = null;

    // do not steal the selection when a button is pressed
    this.bar.addEventListener('mousedown', (e) => e.preventDefault());
    this.bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !this.info) return;
      this.copy(b.dataset.act);
    });
    document.addEventListener('selectionchange', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.update(), 220);
    });
    window.addEventListener('scroll', () => { if (!this.bar.hidden) this.position(); }, { passive: true });
  }

  selectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const body = document.querySelector('.reader-view.active .reader-body');
    if (!body || !body.contains(range.commonAncestorContainer)) return null;
    if (range.commonAncestorContainer.nodeType === 1 && range.commonAncestorContainer.closest('.reader-footnotes')) return null;
    const box = document.createElement('div');
    box.appendChild(range.cloneContents());
    box.querySelectorAll('sup.fn-ref, .pb, .verse-copy-btn, .verse-header').forEach(n => n.remove());
    const text = box.textContent.replace(/\s+/g, ' ').trim();
    if (text.length < 8) return null;
    const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const block = startEl && startEl.closest('[data-s]');
    return { text, range, sIdx: block ? block.dataset.s : null, page: this.reader.pageOf(startEl || body) };
  }

  update() {
    this.info = this.selectionInfo();
    if (!this.info) { this.bar.hidden = true; return; }
    this.bar.hidden = false;
    this.position();
  }

  position() {
    if (!this.info) return;
    const r = this.info.range.getBoundingClientRect();
    if (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700) {
      this.bar.classList.add('cite-bottom');
      this.bar.style.left = this.bar.style.top = '';
      return;
    }
    this.bar.classList.remove('cite-bottom');
    const w = this.bar.offsetWidth || 240;
    let left = r.left + r.width / 2 - w / 2 + window.scrollX;
    left = Math.max(window.scrollX + 10, Math.min(left, window.scrollX + window.innerWidth - w - 10));
    let top = r.top + window.scrollY - this.bar.offsetHeight - 10;
    if (r.top < 70) top = r.bottom + window.scrollY + 10;
    this.bar.style.left = left + 'px';
    this.bar.style.top = top + 'px';
  }

  link() {
    const ch = this.reader.currentChapter;
    const base = location.href.split('#')[0];
    return `${base}#kapitel?id=${ch.number}` + (this.info.sIdx !== null ? `&p=${this.info.sIdx}` : '');
  }

  async copy(kind) {
    const ch = this.reader.currentChapter;
    const where = [ch.number > 0 ? `Kapitel ${ch.number}` : ch.title, this.info.page ? `S. ${this.info.page}` : null].filter(Boolean).join(', ');
    let out;
    if (kind === 'link') {
      out = this.link();
    } else {
      const q = /^[„“"]/.test(this.info.text) ? this.info.text : `„${this.info.text}“`;
      out = `${q}\n— Der verfälschte Islam und der Islam im Koran, ${where}.\n${this.link()}`;
    }
    try {
      if (kind === 'link' && navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: document.title, url: out });
      } else {
        await navigator.clipboard.writeText(out);
        if (window.bookApp) window.bookApp.showToast(kind === 'link' ? 'Link zum Absatz kopiert' : 'Zitat mit Quellenangabe kopiert');
      }
    } catch (e) { /* cancelled or not allowed */ }
    window.getSelection().removeAllRanges();
    this.bar.hidden = true;
  }
}

/* --------------------------------------------------------------------------- */
class BookReader {
  constructor() {
    this.currentChapter = null;
    this.currentChapterNum = 1;
    this.fontSizeLevel = 0; // -1: small, 0: normal, 1: large, 2: extra large
    this.isSerif = true;
    this.sections = [];     // reading sections for scroll-spy / remaining time
    this.ticking = false;
    this.saveTimer = null;

    this.initElements();
    this.fontSizeLevel = parseInt(storageGet('book_font_level') || '0', 10) || 0;
    this.isSerif = storageGet('book_font_serif') !== '0';
    this.showPages = storageGet('book_show_pages') !== '0';
    this.width = storageGet('book_width') === 'full' ? 'full' : 'normal';
    this.loose = storageGet('book_leading') === 'loose';
    this.paper = storageGet('book_bg') === 'paper';
    this.initEvents();
    this.cite = new SelectionCite(this);
    this.popover = new FootnotePopover();
    this.initSettings();
    this.applyReadingSettings();
  }

  initElements() {
    this.readerView = document.getElementById('reader-view');
    this.progressBar = document.getElementById('reading-progress');
    this.chCatElem = document.getElementById('reader-ch-cat');
    this.chTitleBarElem = document.getElementById('reader-ch-title-bar');
    this.remainingElem = document.getElementById('reader-remaining');
    this.contentWrap = document.getElementById('reader-content-body');
    this.subheadsNav = document.getElementById('subheads-nav');
    this.sidebarProofs = document.getElementById('sidebar-proofs-container');
    this.sidebar = document.querySelector('.reader-sidebar');

    this.prevBtn = document.getElementById('prev-chapter-btn');
    this.nextBtn = document.getElementById('next-chapter-btn');
    this.settingsBtn = document.getElementById('reader-settings-btn');
    this.settingsPanel = document.getElementById('reader-settings');
    this.fontSmallerBtn = document.getElementById('font-smaller-btn');
    this.fontLargerBtn = document.getElementById('font-larger-btn');
    this.sizeLabel = document.getElementById('rs-size-label');
    this.serifBtn = document.getElementById('font-serif-btn');
    this.sansBtn = document.getElementById('font-sans-btn');
    this.widthNormalBtn = document.getElementById('width-normal-btn');
    this.widthFullBtn = document.getElementById('width-full-btn');
    this.leadingNormalBtn = document.getElementById('leading-normal-btn');
    this.leadingLooseBtn = document.getElementById('leading-loose-btn');
    this.printBtn = document.getElementById('print-chapter-btn');
    this.pagesSwitch = document.getElementById('pages-toggle-btn');
    this.zenSwitch = document.getElementById('zen-mode-btn');
  }

  /** reading settings panel ("Aa"): size, typeface, width, page numbers, text only */
  initSettings() {
    const panel = this.settingsPanel;
    const btn = this.settingsBtn;
    if (!panel || !btn) return;
    const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !e.target.closest('#reader-settings') && !e.target.closest('#reader-settings-btn')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); }
    });

    this.fontSmallerBtn.addEventListener('click', () => this.adjustFontSize(-1));
    this.fontLargerBtn.addEventListener('click', () => this.adjustFontSize(1));
    this.serifBtn.addEventListener('click', () => this.setSerif(true));
    this.sansBtn.addEventListener('click', () => this.setSerif(false));
    this.widthNormalBtn.addEventListener('click', () => this.setWidth('normal'));
    this.widthFullBtn.addEventListener('click', () => this.setWidth('full'));
    const bgLight = document.getElementById('bg-light-btn'), bgPaper = document.getElementById('bg-paper-btn');
    if (bgLight) bgLight.addEventListener('click', () => this.setPaper(false));
    if (bgPaper) bgPaper.addEventListener('click', () => this.setPaper(true));
    this.leadingNormalBtn.addEventListener('click', () => this.setLeading(false));
    this.leadingLooseBtn.addEventListener('click', () => this.setLeading(true));
    if (this.printBtn) this.printBtn.addEventListener('click', () => { close(); window.print(); });
    this.pagesSwitch.addEventListener('click', () => this.setPages(!this.showPages, true));
    this.zenSwitch.addEventListener('click', () => { close(); this.setFocus(!document.body.classList.contains('zen-mode')); });
    const focusBtn = document.getElementById('focus-btn');
    if (focusBtn) focusBtn.addEventListener('click', () => this.setFocus(!document.body.classList.contains('zen-mode')));
    const focusExit = document.getElementById('focus-exit');
    if (focusExit) focusExit.addEventListener('click', () => this.setFocus(false));
    // keyboard: Esc leaves the focus mode, F toggles it (not while typing)
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
      if (e.key === 'Escape' && document.body.classList.contains('zen-mode') && panel.hidden) this.setFocus(false);
      if ((e.key === 'f' || e.key === 'F') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey
          && this.readerView && this.readerView.classList.contains('active')) this.setFocus(!document.body.classList.contains('zen-mode'));
    });
  }

  /** focus mode: everything but the book disappears (menu, top bar, contents list, footer) */
  setFocus(on) {
    document.body.classList.toggle('zen-mode', on);
    if (this.zenSwitch) this.zenSwitch.setAttribute('aria-checked', String(on));
    const fb = document.getElementById('focus-btn');
    if (fb) fb.setAttribute('aria-pressed', String(on));
    if (on) {
      document.body.classList.remove('contents-open');
      if (window.bookApp && !storageGet('book_focus_hint')) {
        window.bookApp.showToast('Fokus-Modus: mit Esc oder dem Knopf oben rechts beenden');
        storageSet('book_focus_hint', '1');
      }
    }
  }

  setSerif(on) { this.isSerif = on; storageSet('book_font_serif', on ? '1' : '0'); this.applyReadingSettings(); }
  setWidth(w) { this.width = w; storageSet('book_width', w); this.applyReadingSettings(); }
  setPaper(on) { this.paper = on; storageSet('book_bg', on ? 'paper' : 'light'); this.applyReadingSettings(); }
  setLeading(loose) { this.loose = loose; storageSet('book_leading', loose ? 'loose' : 'normal'); this.applyReadingSettings(); }
  setPages(on, announce) {
    this.showPages = on;
    storageSet('book_show_pages', on ? '1' : '0');
    this.applyReadingSettings();
    if (announce && window.bookApp) {
      window.bookApp.showToast(on ? 'Seitenzahlen des gedruckten Buches werden angezeigt' : 'Seitenzahlen ausgeblendet');
    }
  }

  initEvents() {
    // Scroll: progress bar, scroll-spy, remaining time, reading position
    window.addEventListener('scroll', () => {
      if (!this.readerView || !this.readerView.classList.contains('active')) return;
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      if (this.progressBar) this.progressBar.style.width = scrolled + '%';
      if (!this.ticking) {
        this.ticking = true;
        requestAnimationFrame(() => { this.ticking = false; this.updateReadingAids(); });
      }
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.savePosition(), 500);
    }, { passive: true });

    // "Inhalt" on small screens: the contents column (sub-headings, chapter chooser, page box) as a sheet
    const contentsBtn = document.getElementById('contents-btn');
    if (contentsBtn) {
      const setOpen = (open) => {
        document.body.classList.toggle('contents-open', open);
        contentsBtn.setAttribute('aria-expanded', String(open));
      };
      contentsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(!document.body.classList.contains('contents-open'));
      });
      document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('contents-open')) return;
        // close after choosing something, or when tapping outside the sheet
        if (e.target.closest('.reader-sidebar a, .reader-sidebar button')
            || (!e.target.closest('.reader-sidebar') && !e.target.closest('#contents-btn'))) {
          setOpen(false);
        }
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
      window.addEventListener('hashchange', () => setOpen(false));
    }

    // Prev / Next Chapter
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => {
        if (this.currentChapterNum > 1) window.bookApp.navigateToChapter(this.currentChapterNum - 1);
      });
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => {
        if (this.currentChapterNum < LAST_CHAPTER) window.bookApp.navigateToChapter(this.currentChapterNum + 1);
      });
    }

    // One delegated handler for the rest of the chapter text.
    document.addEventListener('click', (e) => {
      const back = e.target.closest('a.fn-back');
      if (back) {
        e.preventDefault();
        this.scrollToId(back.getAttribute('href').slice(1));
        return;
      }
      const subLink = e.target.closest('a.subhead-nav-link[data-target]');
      if (subLink) {
        e.preventDefault();
        this.scrollToId(subLink.dataset.target, 'start');
        return;
      }
      const copyBtn = e.target.closest('.verse-copy-btn');
      if (copyBtn) {
        const card = copyBtn.closest('.quran-verse-card');
        if (card) this.copyVerse(card);
        return;
      }
      const proofEl = e.target.closest('[data-proof-idx]');
      if (proofEl && this.currentChapter) {
        const proof = (this.currentChapter.proof_images || [])[parseInt(proofEl.dataset.proofIdx, 10)];
        if (proof) window.proofLightbox.open(proof);
      }
    });
  }

  /** smooth scrolling unless the visitor asked for reduced motion */
  smooth() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  flash(el) {
    if (!el) return;
    el.classList.add('flash-target');
    setTimeout(() => el.classList.remove('flash-target'), 1800);
  }

  /** jump to a paragraph ({p}) or to a page of the printed book ({seite}) of the open chapter */
  jumpTo(target) {
    let el = null;
    if (target.p !== undefined && target.p !== null && target.p !== '') {
      el = this.contentWrap.querySelector(`[data-s="${parseInt(target.p, 10)}"]`);
    } else if (target.seite) {
      const pb = this.contentWrap.querySelector(`.pb[data-p="${parseInt(target.seite, 10)}"]`);
      if (pb) {       // scroll to the exact place where the page begins, highlight its paragraph
        window.scrollTo({ top: Math.max(0, pb.getBoundingClientRect().top + window.scrollY - 150), behavior: 'instant' });
        this.flash(pb.closest('[data-s]'));
        return;
      }
      this.popoverToast(`Die Seite ${target.seite} beginnt nicht in diesem Kapitel.`);
    }
    if (!el) return;
    el.scrollIntoView({ behavior: 'instant', block: 'start' });
    this.flash(el.closest('[data-s]') || el);
  }

  popoverToast(msg) { if (window.bookApp) window.bookApp.showToast(msg); }

  scrollToId(id, block = 'center', behavior = null) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: behavior || this.smooth(), block });
    el.classList.add('flash-target');
    setTimeout(() => el.classList.remove('flash-target'), 1600);
  }

  /** printed book page that a node belongs to (nearest page marker before or inside it) */
  pageOf(node) {
    let page = null;
    for (const pb of document.querySelectorAll('.reader-body .pb')) {
      if (node.contains(pb) || (pb.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) page = pb.dataset.p;
      else break;
    }
    return page;
  }

  copyVerse(card) {
    const text = card.querySelector('.verse-text').textContent.trim();
    const ref = card.dataset.ref || '';
    const page = this.pageOf(card);
    const ch = this.currentChapter;
    const where = [ch && ch.number > 0 ? `Kapitel ${ch.number}` : null, page ? `S. ${page}` : null].filter(Boolean).join(', ');
    window.bookApp.copyQuote(text, ref, where);
  }

  /** A− / A+ : scales the reading text (the choice is remembered) */
  adjustFontSize(delta) {
    this.fontSizeLevel = Math.max(-2, Math.min(3, this.fontSizeLevel + delta));
    storageSet('book_font_level', String(this.fontSizeLevel));
    this.applyReadingSettings();
  }

  applyReadingSettings() {
    const press = (el, on) => { if (el) el.setAttribute('aria-pressed', String(on)); };
    const scales = { '-2': 0.84, '-1': 0.92, '0': 1, '1': 1.1, '2': 1.22, '3': 1.36 };
    const scale = scales[this.fontSizeLevel];
    if (this.readerView) {
      this.readerView.style.setProperty('--reader-scale', scale);
      this.readerView.style.setProperty('--reader-font', this.isSerif ? 'var(--font-reader)' : 'var(--font-sans)');
    }
    if (this.contentWrap) this.contentWrap.classList.toggle('leading-loose', this.loose);
    document.body.classList.toggle('reader-full', this.width === 'full');
    document.body.classList.toggle('bg-paper', this.paper);
    press(document.getElementById('bg-light-btn'), !this.paper); press(document.getElementById('bg-paper-btn'), this.paper);
    press(this.widthNormalBtn, this.width === 'normal'); press(this.widthFullBtn, this.width === 'full');
    press(this.leadingNormalBtn, !this.loose); press(this.leadingLooseBtn, this.loose);
    document.body.classList.toggle('show-pages', this.showPages);
    press(this.serifBtn, this.isSerif); press(this.sansBtn, !this.isSerif);
    if (this.pagesSwitch) this.pagesSwitch.setAttribute('aria-checked', String(this.showPages));
    if (this.sizeLabel) this.sizeLabel.textContent = Math.round(scale * 100) + ' %';
    if (this.fontSmallerBtn) this.fontSmallerBtn.disabled = this.fontSizeLevel <= -2;
    if (this.fontLargerBtn) this.fontLargerBtn.disabled = this.fontSizeLevel >= 3;
  }

  async loadChapter(chNum, targetHeading = null, target = {}) {
    this.currentChapterNum = parseInt(chNum, 10);
    this.popover.hide();
    this.removeResumeBanner();
    try {
      // a chapter page that already contains the text (built by scripts/build_seo.py) keeps it while loading
      if (this.contentWrap.dataset.prerendered !== String(this.currentChapterNum)) {
        this.contentWrap.innerHTML = `
        <div style="text-align: center; padding: 4rem 1rem; color: var(--ink-muted);">
          Kapitel ${this.currentChapterNum} wird geladen...
        </div>`;
      }
      delete this.contentWrap.dataset.prerendered;

      const resp = await fetch(`data/chapters/chapter_${this.currentChapterNum}.json?v=${window.DATA_VERSION}`);
      if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
      const chData = await resp.json();
      this.currentChapter = chData;

      this.renderChapter(chData);
      this.initReadingAids();

      if (target && target.anchor) {
        setTimeout(() => this.scrollToId(target.anchor, 'start', 'instant'), 160);
      } else if (target && (target.p || target.seite)) {
        setTimeout(() => this.jumpTo(target), 160);
      } else if (targetHeading) {
        setTimeout(() => {
          const decoded = decodeURIComponent(targetHeading).toLowerCase();
          const headingElem = Array.from(document.querySelectorAll('.subheading-title'))
            .find(el => el.textContent.trim().toLowerCase().includes(decoded));
          if (headingElem) headingElem.scrollIntoView({ behavior: this.smooth() });
          else window.scrollTo({ top: 0, behavior: this.smooth() });
        }, 120);
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
        this.offerResume();
      }
    } catch (err) {
      console.error('Failed to load chapter:', err);
      this.contentWrap.innerHTML = `
        <div style="text-align: center; padding: 4rem; color: var(--accent-ruby);">
          <h3>Fehler beim Laden des Kapitels</h3>
          <p style="color: var(--ink-secondary); margin-top: 0.5rem;">Bitte versuchen Sie es erneut oder wählen Sie ein anderes Kapitel.</p>
        </div>`;
    }
  }

  /**
   * Where the pictures go. Each picture carries `after_idx`: the section of the text it belongs
   * to (matched against the position in the original article). Pictures without it are spread
   * evenly between paragraphs.
   */
  proofSlots(sections, proofs) {
    const slots = new Map();
    const put = (idx, k) => { if (!slots.has(idx)) slots.set(idx, []); slots.get(idx).push(k); };
    const candidates = [];
    sections.forEach((s, i) => {
      const next = sections[i + 1];
      if (s.type === 'paragraph' && (!next || next.type !== 'verse_ref')) candidates.push(i);
    });
    const unplaced = [];
    proofs.forEach((p, k) => {
      if (Number.isInteger(p.after_idx) && p.after_idx >= 0 && p.after_idx < sections.length) put(p.after_idx, k);
      else unplaced.push(k);
    });
    unplaced.forEach((k, n) => {
      if (!candidates.length) return;
      put(candidates[Math.min(candidates.length - 1, Math.floor(((n + 1) * candidates.length) / (unplaced.length + 1)))], k);
    });
    return slots;
  }

  renderSection(sec, state) {
    switch (sec.type) {
      case 'heading':
        return `<h2 id="${sec.slug || 'subhead-' + state.heads}" class="subheading-title">${(state.heads++, sec.text)}</h2>`;

      case 'verse': {
        const ref = sec.reference ? escapeHtml(sec.reference) : '';
        const refFn = (sec.reference_fn || [])
          .map(n => `<sup class="fn-ref"><a href="#fn-${n}" id="fnref-${n}">${n}</a></sup>`).join('');
        return `
          <div class="quran-verse-card" data-ref="${ref}">
            <div class="verse-text">${sec.text}</div>
            <div class="verse-header">
              <div class="verse-badge">${ref}${refFn}</div>
              <button class="verse-copy-btn" title="Vers mit Quellenangabe und Seitenzahl kopieren">Zitieren</button>
            </div>
          </div>`;
      }

      case 'verse_ref':
        return `<p class="verse-ref-line">${sec.text}</p>`;

      case 'list':
        return '<div class="reader-list">' + sec.items.map(it => `
          <div class="reader-list-item"><span class="li-label">${escapeHtml(it.label)}</span><div class="li-text">${it.text}</div></div>
        `).join('') + '</div>';

      case 'table':
        return `<div class="reader-table-wrap"><table class="reader-table">
          <thead><tr>${sec.header.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${sec.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;

      default: { // paragraph
        const pClass = state.first && state.chNum > 0 ? ' class="drop-cap-paragraph"' : '';
        state.first = false;
        return `<p${pClass}>${sec.text}</p>`;
      }
    }
  }

  renderChapter(ch) {
    // Top bar
    if (this.chCatElem) this.chCatElem.textContent = ch.category ? ch.category.title_de : '';
    if (this.chTitleBarElem) {
      this.chTitleBarElem.textContent = ch.number > 0 ? `Kapitel ${ch.number}: ${ch.title}` : ch.title;
    }

    // Contents column (same order as the heading sections)
    const heads = ch.sections.filter(s => s.type === 'heading');
    if (this.subheadsNav) {
      this.subheadsNav.innerHTML = heads.length > 0
        ? heads.map((h, idx) => {
            const id = h.slug || `subhead-${idx}`;
            return `<li><a href="#${id}" class="subhead-nav-link" data-target="${id}">${escapeHtml(h.plain || '')}</a></li>`;
          }).join('')
        : `<li><span class="subhead-nav-link" style="color: var(--ink-muted);">Keine Unterthemen</span></li>`;
    }
    if (this.sidebarProofs) this.sidebarProofs.innerHTML = '';    // pictures stand beside their text now

    const proofs = ch.proof_images || [];
    const titleSup = ch.title_fn
      ? `<sup class="fn-ref"><a href="#fn-${ch.title_fn}" id="fnref-${ch.title_fn}">${ch.title_fn}</a></sup>` : '';
    let html = `
      <div class="reader-header">
        ${ch.number > 0 ? `<div class="reader-ch-num">Kapitel ${ch.number}</div>` : ''}
        <h1 class="reader-title">${escapeHtml(ch.title)}${titleSup}</h1>
        <div class="reader-meta-row">
          <span>ca. ${ch.reading_time_min} Min. Lesezeit</span>
          <span>•</span>
          <span>${ch.word_count.toLocaleString('de-DE')} Wörter</span>
          ${ch.pdf_pages && ch.number > 0 ? `<span>•</span><span>Buchseiten ${ch.pdf_pages[0]}–${ch.pdf_pages[1]}</span>` : ''}
        </div>
      </div>
      <div class="reader-body" lang="de">
    `;

    const slots = this.proofSlots(ch.sections, proofs);
    const state = { heads: 0, first: true, chNum: ch.number };
    ch.sections.forEach((sec, sIdx) => {
      const inner = this.renderSection(sec, state).replace(/^(\s*<[a-z0-9]+)/i, `$1 data-s="${sIdx}"`);
      const figs = (slots.get(sIdx) || []).map(k => this.renderEmbeddedProofCard(proofs[k], k));
      // picture(s) first in the markup: in the wide layout they float into the margin beside this
      // paragraph, on narrow screens CSS puts them after it.
      html += figs.length ? `<div class="sec-block">${figs.join('')}${inner}</div>` : inner;
    });

    // Footnotes (numbered as in the printed book, with a way back to the text)
    const notes = ch.footnotes || [];
    if (notes.length > 0) {
      html += `
        <div class="reader-footnotes">
          <div class="footnotes-title">Anmerkungen</div>
          <div class="footnote-list">
            ${notes.map(fn => `
              <div id="fn-${fn.n}" class="footnote-item">
                <span class="footnote-num">${fn.n}</span>
                <span class="footnote-text">${fn.text} <a class="fn-back" href="#fnref-${fn.n}" title="Zurück zur Textstelle">↩</a></span>
              </div>`).join('')}
          </div>
        </div>`;
    }
    html += `</div>`; // Close reader-body

    // Bottom Navigation
    const prevChNum = ch.number > 1 ? ch.number - 1 : null;
    const nextChNum = ch.number >= 1 && ch.number < LAST_CHAPTER ? ch.number + 1 : null;
    html += `
      <div class="reader-bottom-nav">
        ${prevChNum ? `
          <button class="nav-ch-btn" onclick="window.bookApp.navigateToChapter(${prevChNum})">
            <span class="direction">← Vorheriges Kapitel</span>
            <span class="ch-name">Kapitel ${prevChNum}</span>
          </button>
        ` : '<div></div>'}

        <button class="btn-secondary" onclick="window.bookApp.navigate('#home')">Inhaltsverzeichnis</button>

        ${nextChNum ? `
          <button class="nav-ch-btn" style="text-align: right;" onclick="window.bookApp.navigateToChapter(${nextChNum})">
            <span class="direction">Nächstes Kapitel →</span>
            <span class="ch-name">Kapitel ${nextChNum}</span>
          </button>
        ` : '<div></div>'}
      </div>
    `;

    this.contentWrap.innerHTML = html;
    const sel = document.getElementById('ch-select');
    if (sel) sel.value = ch.number >= 1 ? String(ch.number) : '';
    if (this.prevBtn) this.prevBtn.disabled = !(ch.number > 1);
    if (this.nextBtn) this.nextBtn.disabled = !(ch.number >= 1 && ch.number < LAST_CHAPTER);
  }

  renderEmbeddedProofCard(proof, idx) {
    const caption = proofCaption(proof);
    const kind = proofKindLabel(proof);
    return `
      <figure class="embedded-proof-card" id="proof-${idx}">
        <div class="proof-card-media" data-proof-idx="${idx}" title="Vergrößern">
          <img src="${escapeHtml(proof.local_path || proof.url)}" alt="${escapeHtml(caption || kind)}" loading="lazy">
        </div>
        <figcaption class="proof-card-caption"><span class="proof-kind">${kind}</span>${caption ? ' · ' + escapeHtml(caption) : ''}</figcaption>
      </figure>
    `;
  }

  /* --------------------------- reading aids ------------------------------- */

  /** groups the text into reading sections (for scroll-spy and "remaining time") */
  initReadingAids() {
    const body = this.contentWrap.querySelector('.reader-body');
    this.headings = Array.from(this.contentWrap.querySelectorAll('h2.subheading-title'));
    this.navLinks = Array.from(this.subheadsNav.querySelectorAll('a.subhead-nav-link[data-target]'));
    this.activeHeading = -2;
    this.sections = [{ items: [] }];
    if (!body) return;
    Array.from(body.children).forEach(el => {
      if (el.classList.contains('reader-footnotes')) return;
      if (el.querySelector(':scope > h2.subheading-title') || el.matches('h2.subheading-title')) {
        this.sections.push({ items: [] });
      }
      let text = el.textContent;
      el.querySelectorAll('figcaption').forEach(c => { text = text.replace(c.textContent, ''); });
      const words = text.split(/\s+/).filter(Boolean).length;
      this.sections[this.sections.length - 1].items.push({ el, words });
    });
    this.updateReadingAids();
  }

  updateReadingAids() {
    if (!this.headings || !this.readerView.classList.contains('active')) return;
    // the last heading that has reached the top part of the screen
    let active = -1;
    for (let i = 0; i < this.headings.length; i++) {
      if (this.headings[i].getBoundingClientRect().top <= 190) active = i; else break;
    }
    if (active !== this.activeHeading) {
      this.activeHeading = active;
      this.navLinks.forEach((a, i) => a.classList.toggle('active', i === active));
      const link = this.navLinks[active];
      if (link && this.sidebar) {
        const top = link.offsetTop - this.sidebar.clientHeight / 3;
        this.sidebar.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }
    // remaining reading time of the current section
    if (this.remainingElem) {
      const sec = this.sections[active + 1];
      let words = 0;
      if (sec) for (const it of sec.items) if (it.el.getBoundingClientRect().bottom > 170) words += it.words;
      const min = words / WORDS_PER_MIN;
      const nearEnd = window.scrollY > 300 && words === 0;
      this.remainingElem.textContent = !sec || nearEnd ? ''
        : (min < 0.75 ? 'Noch weniger als 1 Min. in diesem Abschnitt' : `Noch ca. ${Math.ceil(min)} Min. in diesem Abschnitt`);
    }
  }

  /* ------------------------- resume where you stopped --------------------- */
  posKey() { return 'book_pos_v1_' + this.currentChapterNum; }

  savePosition() {
    if (!this.readerView || !this.readerView.classList.contains('active') || !this.currentChapter) return;
    const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if (h <= 0) return;
    const f = window.scrollY / h;
    if (window.scrollY < 400 || f > 0.985) storageSet(this.posKey(), '');   // finished or barely started
    else storageSet(this.posKey(), String(Math.round(f * 1000) / 1000));
  }

  removeResumeBanner() {
    const old = document.getElementById('resume-banner');
    if (old) old.remove();
  }

  offerResume() {
    const f = parseFloat(storageGet(this.posKey()) || '');
    if (!f || f < 0.03 || f > 0.97) return;
    const b = document.createElement('div');
    b.id = 'resume-banner';
    b.className = 'resume-banner';
    b.innerHTML = `<span>Sie waren bei ${Math.round(f * 100)} %.</span>
      <button data-act="go">Weiterlesen</button>
      <button class="resume-x" data-act="close" aria-label="Schließen">×</button>`;
    b.addEventListener('click', (e) => {
      const act = e.target.closest('button') && e.target.closest('button').dataset.act;
      if (act === 'go') {
        const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        window.scrollTo({ top: f * h, behavior: this.smooth() });
      }
      if (act) b.remove();
    });
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 15000);
  }
}

// Global instance
window.bookReader = document.getElementById('reader-view') ? new BookReader() : null;   // only the chapter pages contain the reader
