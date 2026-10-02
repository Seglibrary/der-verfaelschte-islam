/**
 * Full-Text Search Controller
 * Fast in-memory search over 3,696 indexed sections across 40 chapters
 */

class BookSearch {
  constructor() {
    this.searchModal = document.getElementById('search-modal');
    this.searchInput = document.getElementById('search-input');
    this.resultsList = document.getElementById('search-results');
    this.resultsCount = document.getElementById('search-count');
    this.closeBtn = document.getElementById('search-close');
    
    this.index = [];
    this.isLoaded = false;
    this.debounceTimer = null;
    
    this.initEvents();
  }

  async loadIndex() {
    if (this.isLoaded) return;
    try {
      const resp = await fetch(`data/search_index.json?v=${window.DATA_VERSION}`);
      this.index = await resp.json();
      this.isLoaded = true;
      console.log(`Search index loaded: ${this.index.length} items`);
    } catch (err) {
      console.error('Failed to load search index:', err);
    }
  }

  initEvents() {
    // Open on Ctrl + K or Cmd + K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.open();
      }
      if (e.key === 'Escape' && this.searchModal && this.searchModal.classList.contains('active')) {
        this.close();
      }
    });

    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Click outside to close
    if (this.searchModal) {
      this.searchModal.addEventListener('click', (e) => {
        if (e.target === this.searchModal) {
          this.close();
        }
      });
    }

    // Click on a result (delegated; data comes from this.shown, nothing is put into inline JS)
    if (this.resultsList) {
      this.resultsList.addEventListener('click', (e) => {
        const row = e.target.closest('.search-result-item');
        if (!row || !this.shown) return;
        const item = this.shown[parseInt(row.dataset.idx, 10)];
        if (!item) return;
        window.bookApp.navigateToChapter(item.ch, null, { p: item.sec_idx });
        this.close();
      });
    }

    // Input search
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.performSearch(e.target.value);
        }, 180);
      });
    }
  }

  open() {
    if (!this.searchModal) return;
    this.loadIndex();
    this.searchModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.focus();
        this.searchInput.select();
      }
    }, 100);
  }

  close() {
    if (!this.searchModal) return;
    this.searchModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  performSearch(query) {
    query = (query || '').trim().toLowerCase();
    if (!query || query.length < 2) {
      this.resultsList.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: var(--ink-muted); font-size: 0.9rem;">
          Geben Sie mindestens 2 Zeichen ein, um alle 40 Kapitel, Verse und Belege zu durchsuchen...
        </div>`;
      if (this.resultsCount) this.resultsCount.textContent = '0 Treffer';
      return;
    }

    const words = query.split(/\s+/).filter(w => w.length > 1);
    const matches = [];

    for (const item of this.index) {
      const textLower = item.text.toLowerCase();
      const titleLower = item.title.toLowerCase();
      const headingLower = item.heading.toLowerCase();
      
      let score = 0;
      let allWordsMatch = true;

      for (const w of words) {
        if (titleLower.includes(w)) score += 15;
        else if (headingLower.includes(w)) score += 10;
        else if (textLower.includes(w)) score += 2;
        else {
          allWordsMatch = false;
          break;
        }
      }

      if (allWordsMatch) {
        matches.push({ item, score });
      }
    }

    // Best hits first (ties keep the order of the book), show the first 60
    matches.sort((a, b) => b.score - a.score);
    const total = matches.length;
    matches.length = Math.min(matches.length, 60);

    if (this.resultsCount) {
      this.resultsCount.textContent = total > 60 ? `${total} Treffer (die besten 60)` : `${total} Treffer`;
    }

    if (matches.length === 0) {
      this.resultsList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--ink-muted);">
          <p style="font-size: 1.1rem; color: var(--ink); margin-bottom: 0.5rem; font-weight: 600;">Keine Ergebnisse gefunden</p>
          <p style="font-size: 0.85rem; color: var(--ink-secondary);">Versuchen Sie es mit einem anderen Suchbegriff wie „Vernunft“, „Hadith“, „Koran“ oder „Rechtsschulen“.</p>
        </div>`;
      return;
    }

    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    this.resultsList.innerHTML = matches.map(({ item }, idx) => {
      // Highlight query words in snippet
      let snippet = item.text;
      if (snippet.length > 200) {
        const firstIdx = Math.max(0, snippet.toLowerCase().indexOf(words[0]));
        const start = Math.max(0, firstIdx - 40);
        snippet = (start > 0 ? '…' : '') + snippet.substring(start, start + 210) + '…';
      }
      snippet = esc(snippet);
      for (const w of words) {
        snippet = snippet.replace(new RegExp(`(${reEsc(esc(w))})`, 'gi'), '<mark>$1</mark>');
      }

      const typeLabel = item.type === 'verse' ? (item.ref || 'KORANVERS') : (item.type === 'heading' ? 'THEMA' : 'TEXT');

      return `
        <div class="search-result-item" data-idx="${idx}">
          <div class="res-header">
            <span class="res-ch">Kapitel ${item.ch}: ${esc(item.title)}${item.page ? ` · S. ${item.page}` : ''}</span>
            <span class="res-type-tag">${esc(typeLabel)}</span>
          </div>
          <div class="res-title">${esc(item.heading)}</div>
          <div class="res-snippet">${snippet}</div>
        </div>
      `;
    }).join('');
    this.shown = matches.map(m => m.item);
  }
}

// Global instance
window.bookSearch = new BookSearch();
