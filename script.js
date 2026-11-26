(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const pad = n => String(n).padStart(2, '0');

  /* body scroll lock shared by the menu and the modal */
  let menuOpen = false, modalOpen = false;
  const syncLock = () => document.body.classList.toggle('is-locked', menuOpen || modalOpen);

  /* =========================================================
     1. MOTION TYPOGRAPHY
     - [data-split] headings are split into per-character spans
     - hero: letters pop in on load, jiggle on hover
     - section titles: letters rise in as they enter the screen
     - marquee: speed follows scroll velocity
  ========================================================= */
  function splitChars(el) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let n = 0;
    const walk = node => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          [...ch.textContent].forEach(c => {
            if (/\s/.test(c)) { frag.append(c); return; }
            const s = document.createElement('span');
            s.className = 'char';
            s.setAttribute('aria-hidden', 'true');
            s.style.setProperty('--i', n++);
            s.textContent = c;
            frag.append(s);
          });
          ch.replaceWith(frag);
        } else if (ch.nodeType === 1) walk(ch);
      });
    };
    walk(el);
  }
  $$('[data-split]').forEach(splitChars);

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' })
    : null;
  $$('[data-observe],[data-reveal]').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  const track = $('.marquee__track');
  let marquee = null;
  if (track && track.animate && !reduce.matches) {
    marquee = track.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
      { duration: 34000, iterations: Infinity }
    );
  }
  let rate = 1, easing = false, lastY = window.scrollY;
  function easeRate() {
    rate += (1 - rate) * 0.07;
    if (rate < 1.02) { rate = 1; easing = false; }
    marquee.updatePlaybackRate(rate);
    if (easing) requestAnimationFrame(easeRate);
  }
  function boostMarquee() {
    const y = window.scrollY, dy = Math.abs(y - lastY);
    lastY = y;
    if (!marquee) return;
    rate = Math.min(1 + dy * 0.25, 9);
    marquee.updatePlaybackRate(rate);
    if (!easing) { easing = true; requestAnimationFrame(easeRate); }
  }

  /* =========================================================
     2. HAMBURGER MENU
  ========================================================= */
  const burger = $('.burger'), menu = $('#menu');
  function setMenu(open) {
    menuOpen = open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menu.inert = !open;
    syncLock();
    if (open) setTimeout(() => { if (menuOpen) $('a', menu).focus({ preventScroll: true }); }, 350);
  }
  burger.addEventListener('click', () => setMenu(!menuOpen));
  menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });

  /* =========================================================
     3. PARALLAX  ([data-parallax="speed"], + data-parallax-clamp for photos)
     Positive speed = slower than the page, negative = faster.
     Uses the individual `translate` property so it never fights other transforms.
  ========================================================= */
  const layers = $$('[data-parallax]').map(el => ({
    el,
    speed: parseFloat(el.dataset.parallax) || 0,
    clamp: el.hasAttribute('data-parallax-clamp'),
    host: el.parentElement
  }));
  let pxTick = false;
  function updateParallax() {
    pxTick = false;
    if (reduce.matches) return;
    const vh = window.innerHeight;
    layers.forEach(l => {
      const r = l.host.getBoundingClientRect();
      if (r.bottom < -300 || r.top > vh + 300) return;
      let y = (vh / 2 - (r.top + r.height / 2)) * l.speed;
      if (l.clamp) { const lim = r.height * 0.15; y = Math.max(-lim, Math.min(lim, y)); }
      l.el.style.translate = '0 ' + y.toFixed(1) + 'px';
    });
  }
  const requestParallax = () => { if (!pxTick) { pxTick = true; requestAnimationFrame(updateParallax); } };

  /* back-to-top button */
  const toTop = $('.to-top');
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' }));

  window.addEventListener('scroll', () => {
    requestParallax();
    boostMarquee();
    toTop.classList.toggle('is-show', window.scrollY > 700);
  }, { passive: true });
  window.addEventListener('resize', requestParallax);
  window.addEventListener('load', requestParallax);
  requestParallax();

  /* =========================================================
     4. SLIDESHOW / CAROUSEL
     arrows, swipe, arrow keys, autoplay (pauses on hover/focus/hidden tab)
  ========================================================= */
  $$('[data-carousel]').forEach(car => {
    const viewport = $('.carousel__viewport', car);
    const trackEl = $('.carousel__track', car);
    const slides = $$('.carousel__slide', car);
    const cur = $('[data-cur]', car);
    const total = slides.length;
    $('[data-total]', car).textContent = pad(total);
    let index = 0, per = 1, timer = null, paused = false;

    function go(i, animate = true) {
      const max = Math.max(0, total - per);
      index = i < 0 ? max : (i > max ? 0 : i);
      trackEl.classList.toggle('no-anim', !animate);
      trackEl.style.transform = 'translate3d(' + (-slides[index].offsetLeft) + 'px,0,0)';
      slides.forEach((s, k) => {
        const visible = k >= index && k < index + per;
        s.setAttribute('aria-hidden', String(!visible));
        s.inert = !visible;
      });
      cur.textContent = pad(Math.min(total, index + per));
    }
    function measure() {
      per = Math.max(1, parseInt(getComputedStyle(trackEl).getPropertyValue('--per'), 10) || 1);
      go(Math.min(index, Math.max(0, total - per)), false);
    }
    const next = () => go(index + 1);
    const prev = () => go(index - 1);

    $('[data-next]', car).addEventListener('click', () => { next(); restart(); });
    $('[data-prev]', car).addEventListener('click', () => { prev(); restart(); });
    viewport.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { next(); restart(); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { prev(); restart(); e.preventDefault(); }
    });

    let startX = null;
    viewport.addEventListener('pointerdown', e => { startX = e.clientX; });
    viewport.addEventListener('pointerup', e => {
      if (startX === null) return;
      const dx = e.clientX - startX; startX = null;
      if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); restart(); }
    });
    viewport.addEventListener('pointercancel', () => { startX = null; });

    function start() {
      if (reduce.matches || timer) return;
      timer = setInterval(() => { if (!paused && !document.hidden) next(); }, 5200);
    }
    function restart() { clearInterval(timer); timer = null; start(); }
    car.addEventListener('pointerenter', () => { paused = true; });
    car.addEventListener('pointerleave', () => { paused = false; });
    car.addEventListener('focusin', () => { paused = true; });
    car.addEventListener('focusout', () => { paused = false; });

    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(viewport);
    else window.addEventListener('resize', measure);
    measure();
    start();
  });

  /* =========================================================
     5. MODAL WINDOW
     [data-modal="template-id"] opens that <template> in the dialog.
     Esc / backdrop / × close it; Tab stays inside; focus returns to the trigger.
  ========================================================= */
  const modal = $('#modal'), panel = $('.modal__panel', modal), modalBody = $('.modal__body', modal);
  let lastFocus = null, hideTimer = null;

  function openModal(id, trigger) {
    const tpl = document.getElementById(id);
    if (!tpl) return;
    clearTimeout(hideTimer);
    modalBody.replaceChildren(tpl.content.cloneNode(true));
    lastFocus = trigger || document.activeElement;
    modal.hidden = false;
    void modal.offsetWidth;
    modal.classList.add('is-open');
    modalOpen = true; syncLock();
    panel.scrollTop = 0;
    panel.focus({ preventScroll: true });
  }
  function closeModal() {
    if (!modalOpen) return;
    modalOpen = false; syncLock();
    modal.classList.remove('is-open');
    hideTimer = setTimeout(() => { modal.hidden = true; modalBody.replaceChildren(); }, reduce.matches ? 0 : 380);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-modal]');
    if (t) { openModal(t.dataset.modal, t); return; }
    if (e.target.closest('[data-close]')) closeModal();
    else if (modalOpen && e.target.closest('.mdl__cta')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (modalOpen) closeModal();
      else if (menuOpen) { setMenu(false); burger.focus(); }
      return;
    }
    if (e.key === 'Tab' && modalOpen) {
      const f = $$('button,a[href],[tabindex]:not([tabindex="-1"])', panel).filter(x => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  /* =========================================================
     6. ACCORDION  (data-accordion="single" keeps one panel open)
     aria-expanded + animated height (grid 0fr -> 1fr), arrow keys move between headers
  ========================================================= */
  $$('[data-accordion]').forEach(acc => {
    const items = $$('.acc__item', acc);
    const single = acc.dataset.accordion === 'single';
    const buttons = items.map(it => $('.acc__btn', it));
    const set = (item, open) => {
      item.classList.toggle('is-open', open);
      $('.acc__btn', item).setAttribute('aria-expanded', String(open));
      $('.acc__panel', item).inert = !open;
    };
    items.forEach((it, i) => {
      set(it, false);
      buttons[i].addEventListener('click', () => {
        const open = !it.classList.contains('is-open');
        if (single && open) items.forEach(o => { if (o !== it) set(o, false); });
        set(it, open);
      });
      buttons[i].addEventListener('keydown', e => {
        const k = e.key; let to = null;
        if (k === 'ArrowDown') to = (i + 1) % buttons.length;
        else if (k === 'ArrowUp') to = (i - 1 + buttons.length) % buttons.length;
        else if (k === 'Home') to = 0;
        else if (k === 'End') to = buttons.length - 1;
        if (to !== null) { buttons[to].focus(); e.preventDefault(); }
      });
    });
  });
})();