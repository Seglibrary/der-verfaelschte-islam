/**
 * Gallery & Lightbox Controller
 * Handles proof image zoom, modal inspection, and download
 */

/**
 * How a picture is named on the site. The 279 pictures taken over from the original site are
 * photographs and illustrations ("Abbildung"), not scans of book pages. Only an image that is
 * explicitly marked `kind: "quellenscan"` in the data is called a source scan.
 */
function proofKindLabel(p) {
  return p && p.kind === 'quellenscan' ? 'Quellenscan' : 'Abbildung';
}

/** Caption without the machine-made "Quellenscan:" prefix of the old data. */
function proofCaption(p) {
  if (!p) return '';
  if (typeof p.label === 'string') return p.label;
  const c = (p.caption_de || p.caption || '').trim().replace(/^Quellenscan:\s*/, '');
  return /^Quellenscan zu Kapitel \d+$/.test(c) ? '' : c;
}

class ProofLightbox {
  constructor() {
    this.modal = document.getElementById('lightbox-modal');
    this.imgElem = document.getElementById('lightbox-img');
    this.titleElem = document.getElementById('lightbox-title');
    this.captionElem = document.getElementById('lightbox-caption');
    this.badgeElem = document.getElementById('lightbox-badge');
    this.closeBtn = document.getElementById('lightbox-close');
    this.downloadBtn = document.getElementById('lightbox-download');
    
    this.currentData = null;
    this.initEvents();
  }

  initEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && this.modal.classList.contains('active')) {
        this.close();
      }
    });

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => {
        if (this.currentData && this.currentData.url) {
          const a = document.createElement('a');
          a.href = this.currentData.local_path || this.currentData.url;
          a.download = (this.currentData.local_path || this.currentData.url || 'abbildung.jpg').split('/').pop();
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      });
    }
  }

  open(data) {
    if (!this.modal) return;
    this.currentData = data;
    
    const src = data.local_path || data.url;
    this.imgElem.src = src;
    const titleText = proofCaption(data) || proofKindLabel(data);
    this.titleElem.textContent = titleText;
    this.captionElem.textContent = `${titleText} — ${data.post_title_de || data.post_title || 'Kapitel'}`;
    
    if (this.badgeElem) {
      this.badgeElem.textContent = data.chapter ? `Kapitel ${data.chapter} • ${proofKindLabel(data)}` : proofKindLabel(data);
    }

    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (!this.modal) return;
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
    if (this.imgElem) {
      this.imgElem.src = '';
    }
  }
}

// Global instance
window.proofLightbox = new ProofLightbox();
