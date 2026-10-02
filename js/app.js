/**
 * Main Application Controller (Direct, High-Utility Portal)
 * 100% German • Zero-Fluff • Instant Topic Cards
 */

class BookApp {
  constructor() {
    this.meta = null;
    this.categories = [];
    this.chapters = [];
    this.proofs = [];
    this.currentTheme = localStorage.getItem('book_theme') || 'light';
    this.currentCategoryFilter = 'all';

    this.initTheme();
    try { document.body.classList.toggle('bg-paper', localStorage.getItem('book_bg') === 'paper'); } catch (e) { /* no storage */ }
    this.initEvents();
    this.loadData();
  }

  initTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      this.updateThemeButtonIcon(themeBtn);
    }
  }

  toggleTheme() {
    const themes = ['light', 'dark', 'sepia'];
    const nextIdx = (themes.indexOf(this.currentTheme) + 1) % themes.length;
    this.currentTheme = themes[nextIdx];
    localStorage.setItem('book_theme', this.currentTheme);
    document.documentElement.setAttribute('data-theme', this.currentTheme);

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      this.updateThemeButtonIcon(themeBtn);
    }
    const themeNames = { light: 'Heller Modus', dark: 'Dunkelmodus', sepia: 'Pergament / Sepia' };
    this.showToast(themeNames[this.currentTheme] || this.currentTheme);
  }

  updateThemeButtonIcon(btn) {
    if (this.currentTheme === 'dark') {
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      btn.title = 'Aktuell: Dunkelmodus (Klick für Sepia)';
    } else if (this.currentTheme === 'sepia') {
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
      btn.title = 'Aktuell: Pergament / Sepia (Klick für Hell)';
    } else {
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      btn.title = 'Aktuell: Heller Modus (Klick für Dunkel)';
    }
  }

  initEvents() {
    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Hash navigation listener
    window.addEventListener('hashchange', () => this.handleRoute());

    // Search trigger button in header
    const searchBtn = document.getElementById('header-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => window.bookSearch.open());
    }

    // Mobile menu toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.getElementById('nav-menu');
    if (mobileBtn && navMenu) {
      const syncMenuBtn = () => {
        const open = navMenu.classList.contains('mobile-open');
        mobileBtn.setAttribute('aria-expanded', String(open));
        mobileBtn.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
      };
      mobileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navMenu.classList.toggle('mobile-open');
        syncMenuBtn();
      });
      new MutationObserver(syncMenuBtn).observe(navMenu, { attributes: true, attributeFilter: ['class'] });

      // Close mobile menu when a nav link is clicked
      navMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          navMenu.classList.remove('mobile-open');
        });
      });

      // Close mobile menu when clicking outside
      document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('mobile-open') && !navMenu.contains(e.target) && e.target !== mobileBtn) {
          navMenu.classList.remove('mobile-open');
        }
      });
    }

    // Phones have no mouse hover: the book (and the book cards) "play" while they are on screen
    if (window.matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => en.target.classList.toggle('is-active', en.isIntersecting));
      }, { threshold: 0.6 });
      document.querySelectorAll('.apple-book-stage, .book-pub-card').forEach(el => io.observe(el));
    }

    // Direct search input
    const dirSearchInput = document.getElementById('dir-search-input');
    if (dirSearchInput) {
      dirSearchInput.addEventListener('input', (e) => {
        this.filterChapters(e.target.value);
      });
    }

    // 3D Apple Book Showcase Interaction
    this.init3DBookInteractions();
  }

  init3DBookInteractions() {
    const stage = document.getElementById('hero-book-stage');
    if (!stage) return;
    const book = document.getElementById('hero-book-3d');
    if (!book) return;

    stage.addEventListener('mousemove', (e) => {
      const rect = stage.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      // Subtle dynamic tilt based on cursor position
      const rotY = -22 + (x / (rect.width / 2)) * 14;
      const rotX = 7 - (y / (rect.height / 2)) * 8;

      book.style.transform = `rotateY(${rotY}deg) rotateX(${rotX}deg) translateY(-6px) scale(1.02)`;
    });

    stage.addEventListener('mouseleave', () => {
      book.style.transform = '';
    });
  }

  async loadData() {
    try {
      const v = window.DATA_VERSION;
      const needsProofs = !!document.getElementById('belege-full-grid');
      const [metaResp, catResp, chResp, proofsResp] = await Promise.all([
        fetch(`data/book_meta.json?v=${v}`),
        fetch(`data/categories.json?v=${v}`),
        fetch(`data/chapters_index.json?v=${v}`),
        needsProofs ? fetch(`data/proofs_manifest.json?v=${v}`) : Promise.resolve(null)
      ]);

      this.meta = await metaResp.json();
      this.categories = await catResp.json();
      this.chapters = await chResp.json();
      this.proofs = proofsResp ? await proofsResp.json() : [];

      this.renderDirectTopicCards();
      this.initReaderNavigation();
      this.renderBelegeGallery(this.proofs);
      this.renderAboutSection();

      // Handle initial route
      this.handleRoute();

    } catch (err) {
      console.error('Fehler beim Laden der Anwendungsdaten:', err);
    }
  }

  /* ---- pages: every content has its own address (see window.PAGE, written by scripts/build_seo.py) ---- */
  get page() { return window.PAGE || {}; }

  /** address of the page that shows a route ('#home', '#belege', '#buecher', '#ueber-uns') */
  pageFor(route) {
    const p = this.page.pages || {};
    return { '#home': p.home, '#belege': p.belege, '#buecher': p.buecher, '#ueber-uns': p.about }[route] || null;
  }

  chapterUrl(n) {
    return (this.page.chapters && this.page.chapters[n]) || null;
  }

  handleRoute() {
    let hash = window.location.hash || this.page.route || document.body.dataset.route || '#home';
    // "#hat-gott-eine-wade" on a chapter page is a link to that heading (question), not a route
    let anchor = null;
    const KNOWN_ROUTES = ['#home', '#belege', '#buecher', '#ueber-uns', '#kapitel', '#reader'];
    if (hash.length > 1 && !KNOWN_ROUTES.includes(hash.split('?')[0]) && (this.page.route || document.body.dataset.route)) {
      try { anchor = decodeURIComponent(hash.slice(1)); } catch (e) { anchor = hash.slice(1); }
      hash = this.page.route || document.body.dataset.route;
    }
    const [route, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');
    const views = {
      '#home': document.getElementById('home-view'),
      '#kapitel': document.getElementById('reader-view'),
      '#reader': document.getElementById('reader-view'),
      '#belege': document.getElementById('belege-view'),
      '#buecher': document.getElementById('buecher-view'),
      '#ueber-uns': document.getElementById('about-view'),
    };
    const isChapter = route === '#kapitel' || route === '#reader';
    const chId = params.get('id') || 1;

    // this page does not contain what the address asks for (old "#..." links, links from search): open the right page
    const wrongChapter = isChapter && String(this.page.chapter) !== String(chId);
    if (!views[route] || wrongChapter) {
      const url = isChapter ? this.chapterUrl(chId) : this.pageFor(route);
      if (url && url !== this.page.file) {
        window.location.replace(url + (isChapter || queryString ? hash : ''));
        return;
      }
    }

    const navMenu = document.getElementById('nav-menu');
    if (navMenu) navMenu.classList.remove('mobile-open');

    if (isChapter) {
      if (anchor && window.bookReader && window.bookReader.currentChapter
          && String(window.bookReader.currentChapterNum) === String(chId) && document.getElementById(anchor)) {
        window.bookReader.scrollToId(anchor, 'start');     // same chapter is already open: just scroll to the heading
        return;
      }
      if (window.bookReader) {
        window.bookReader.loadChapter(chId, params.get('heading'), { p: params.get('p'), seite: params.get('seite'), anchor });
      }
      window.scrollTo(0, 0);
    } else if (route === '#home' || !views[route]) {
      const catParam = params.get('category');
      if (catParam) this.filterChaptersByCategory(catParam);
    } else {
      window.scrollTo(0, 0);
    }
  }

  /** open a route; other contents live on their own page */
  navigate(hash) {
    const h = String(hash).startsWith('#') ? String(hash) : '#' + hash;
    const url = this.pageFor(h.split('?')[0]);
    if (url && url !== this.page.file) {
      window.location.href = url + (h.includes('?') ? h : '');
    } else {
      window.location.hash = h;
    }
  }

  /** opens a chapter; opts: { p: section number (paragraph), seite: page of the printed book } */
  navigateToChapter(chNum, heading = null, opts = {}) {
    let hash = `#kapitel?id=${chNum}`;
    if (heading) hash += `&heading=${encodeURIComponent(heading)}`;
    if (opts.p !== undefined && opts.p !== null && opts.p !== '') hash += `&p=${opts.p}`;
    if (opts.seite) hash += `&seite=${opts.seite}`;
    const url = this.chapterUrl(chNum);
    if (url && String(this.page.chapter) !== String(chNum)) {
      window.location.href = url + hash;                 // every chapter has its own page
    } else if (window.location.hash === hash && window.bookReader) {
      window.bookReader.loadChapter(chNum, heading, { p: opts.p, seite: opts.seite });   // same address: still jump
    } else {
      window.location.hash = hash;
    }
  }

  /** jump to a page of the printed book (any chapter) */
  gotoBookPage(page) {
    const n = parseInt(page, 10);
    const ch = this.chapters.find(c => c.pdf_pages && n >= c.pdf_pages[0] && n <= c.pdf_pages[1]);
    if (!ch) {
      this.showToast(`Seite ${page} gehört zu keinem Kapitel (Kapitel 1 beginnt auf S. 11, Kapitel 40 endet auf S. 678)`);
      return false;
    }
    this.navigateToChapter(ch.number, null, { seite: n });
    return true;
  }

  /** chapter chooser + page box in the reader's contents column */
  initReaderNavigation() {
    const sel = document.getElementById('ch-select');
    if (sel) {
      sel.innerHTML = this.chapters.map(c => `<option value="${c.number}">${c.number}. ${c.title}</option>`).join('');
      sel.addEventListener('change', () => this.navigateToChapter(sel.value));
    }
    const form = document.getElementById('goto-page-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = document.getElementById('goto-page').value;
        if (v) this.gotoBookPage(v);
      });
    }
  }

  /**
   * Render Direct Topic & Chapter Cards
   */
  renderDirectTopicCards(catId = 'all', searchQuery = '') {
    const container = document.getElementById('direct-topics-container');
    if (!container) return;

    searchQuery = (searchQuery || '').trim().toLowerCase();

    // If searching, show filtered cards flatly with match count
    if (searchQuery.length > 0) {
      const filtered = this.chapters.filter(ch =>
        ch.title.toLowerCase().includes(searchQuery) ||
        `kapitel ${ch.number}`.includes(searchQuery) ||
        (ch.subheadings || []).some(sh => sh.toLowerCase().includes(searchQuery)) ||
        (ch.category && ch.category.title_de && ch.category.title_de.toLowerCase().includes(searchQuery))
      );

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 4rem 1rem; color: var(--ink-muted);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
            <h3 style="font-size: 1.15rem; color: var(--ink); margin-bottom: 0.5rem;">Keine passenden Kapitel gefunden</h3>
            <p style="font-size: 0.88rem;">Versuchen Sie es mit einem anderen Begriff wie „Vernunft“, „Hadith“, „Musik“, „Rechtsschulen“ oder „Frau“.</p>
          </div>`;
        return;
      }

      container.innerHTML = `
        <div class="category-group">
          <div class="category-group-header">
            <h2 class="category-group-title">Suchergebnisse</h2>
            <span class="category-group-count">${filtered.length} Kapitel gefunden</span>
          </div>
          <div class="chapter-cards-grid">
            ${filtered.map(ch => this.buildTopicCardHtml(ch)).join('')}
          </div>
        </div>`;
      return;
    }

    // If specific category is selected
    if (catId && catId !== 'all') {
      const cat = this.categories.find(c => c.id === catId);
      if (!cat) return;

      const chList = this.chapters.filter(ch => cat.chapters.includes(ch.number));

      container.innerHTML = `
        <div class="category-group">
          <div class="category-group-header">
            <div>
              <h2 class="category-group-title">${cat.title_de}</h2>
              <p style="font-size: 0.88rem; color: var(--ink-secondary); margin-top: 0.35rem;">${cat.description}</p>
            </div>
            <span class="category-group-count">${chList.length} Kapitel</span>
          </div>
          <div class="chapter-cards-grid">
            ${chList.map(ch => this.buildTopicCardHtml(ch)).join('')}
          </div>
        </div>`;
      return;
    }

    // Default 'all': all chapters in the order of the book (the category is shown on each card)
    container.innerHTML = `
      <div class="category-group" id="cat-all">
        <div class="category-group-header">
          <div>
            <h2 class="category-group-title">Inhaltsverzeichnis</h2>
            <p style="font-size: 0.88rem; color: var(--ink-secondary); margin-top: 0.25rem;">Alle 40 Kapitel in der Reihenfolge des Buches. Mit den Schaltflächen oben lassen sich die Kapitel nach Thema filtern.</p>
          </div>
          <span class="category-group-count">${this.chapters.length} Kapitel</span>
        </div>
        <div class="chapter-cards-grid">
          ${this.chapters.map(ch => this.buildTopicCardHtml(ch)).join('')}
        </div>
      </div>`;
  }

  buildTopicCardHtml(ch) {
    const subheads = (ch.subheadings || []).slice(0, 4);

    return `
      <article class="topic-card">
        <div class="topic-card-top">
          <span class="topic-badge">Kapitel ${ch.number}</span>
          <div class="topic-meta">
            ${ch.proof_images_count > 0 ? `
              <span class="topic-proof-tag" title="${ch.proof_images_count} Abbildungen in diesem Kapitel">
                ${ch.proof_images_count} Abbildungen
              </span>
            ` : ''}
            ${ch.pdf_pages ? `<span title="Seiten im gedruckten Buch">S. ${ch.pdf_pages[0]}–${ch.pdf_pages[1]}</span>` : ''}
            <span>${ch.reading_time_min} Min.</span>
          </div>
        </div>
        ${ch.category && ch.category.title_de ? `<div class="topic-cat">${ch.category.title_de}</div>` : ''}

        <h3 class="topic-title">
          <a href="${ch.url || `#kapitel?id=${ch.number}`}">${ch.title}</a>
        </h3>

        ${ch.preview ? `
          <p class="topic-preview">${ch.preview}</p>
        ` : ''}

        ${subheads.length > 0 ? `
          <div class="topic-subheads">
            ${subheads.map((sh, k) => {
              const slug = (ch.subheading_slugs || [])[k];
              const href = slug ? `${ch.url || ''}#${slug}` : `${ch.url || ''}#kapitel?id=${ch.number}&heading=${encodeURIComponent(sh)}`;
              return `
              <a href="${href}" class="topic-subhead-chip" title="Direkt zu: ${sh}">
                ${sh}
              </a>
            `; }).join('')}
          </div>
        ` : ''}

        <div class="topic-card-action">
          <a href="${ch.url || `#kapitel?id=${ch.number}`}" class="topic-read-link">
            Kapitel lesen
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
        </div>
      </article>`;
  }

  filterChaptersByCategory(catId) {
    this.currentCategoryFilter = catId || 'all';

    // Update active pill button state
    document.querySelectorAll('.cat-pill-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-cat') === this.currentCategoryFilter) {
        btn.classList.add('active');
      }
    });

    // Clear search input
    const searchInput = document.getElementById('dir-search-input');
    if (searchInput) searchInput.value = '';

    this.renderDirectTopicCards(this.currentCategoryFilter);
  }

  filterChapters(query) {
    if (!query || query.trim().length === 0) {
      this.renderDirectTopicCards(this.currentCategoryFilter);
      return;
    }
    this.renderDirectTopicCards('all', query);
  }

  /**
   * Render Proofs / Scans Gallery with Chapter Filter
   */
  renderBelegeGallery(proofList) {
    const galleryGrid = document.getElementById('belege-full-grid');
    if (!galleryGrid) return;

    if (!proofList || proofList.length === 0) {
      galleryGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--ink-muted);">
          Keine Abbildungen für dieses Kapitel vorhanden.
        </div>`;
      return;
    }

    galleryGrid.innerHTML = proofList.map(proof => `
      <div class="proof-card">
        <div class="proof-img-box" onclick="window.proofLightbox.open(${JSON.stringify(proof).replace(/"/g, '&quot;')})">
          <img src="${proof.local_path || proof.url}" alt="${proofCaption(proof) || proofKindLabel(proof)}" loading="lazy">
          <div class="proof-overlay">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Vergrößern
          </div>
        </div>
        <div class="proof-info">
          <div class="proof-badge">Kapitel ${proof.chapter || 1} • ${proofKindLabel(proof)}</div>
          <div class="proof-caption">${proofCaption(proof)}</div>
          <a href="${this.chapterUrl(proof.chapter || 1) || `#kapitel?id=${proof.chapter || 1}`}" class="proof-link-ch">
            Im Kapitel ansehen →
          </a>
        </div>
      </div>
    `).join('');
  }

  filterProofsByChapter(chNum) {
    // Update active pill button
    const container = document.getElementById('belege-filter-bar');
    if (container) {
      container.querySelectorAll('.cat-pill-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = event && event.target ? event.target : null;
      if (activeBtn) activeBtn.classList.add('active');
    }

    if (chNum === 'all') {
      this.renderBelegeGallery(this.proofs);
    } else {
      const filtered = this.proofs.filter(p => p.chapter === parseInt(chNum, 10));
      this.renderBelegeGallery(filtered);
    }
  }

  /** The translator's foreword on the "Wer wir sind" page comes from the book data. */
  async renderAboutSection() {
    const box = document.getElementById('about-geleitwort');
    if (!box) return;
    try {
      const resp = await fetch(`data/chapters/chapter_0.json?v=${window.DATA_VERSION}`);
      const ch = await resp.json();
      let html = '';
      let on = false;
      for (const s of ch.sections) {
        if (s.type === 'heading') {
          on = s.text.startsWith('Geleitwort');
          if (on) html += `<h2 class="subheading-title">${s.text} (Serdâr Yücedağ)</h2>`;
        } else if (on && s.type === 'paragraph') {
          html += `<p>${s.text}</p>`;
        }
      }
      box.innerHTML = html;
    } catch (err) {
      console.error('Geleitwort konnte nicht geladen werden:', err);
    }
  }

  copyQuote(text, citation, where = '') {
    const t = /^[„“"]/.test(text) ? text : `„${text}“`;
    const source = [citation, where].filter(Boolean).join(' — ');
    const fullText = `${t}${source ? ' (' + source + ')' : ''} — aus: Der verfälschte Islam und der Islam im Koran`;
    navigator.clipboard.writeText(fullText).then(() => {
      this.showToast('Vers mit Quellenangabe kopiert');
    }).catch(err => {
      console.error('Kopieren fehlgeschlagen:', err);
    });
  }

  showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.bookApp = new BookApp();
});
