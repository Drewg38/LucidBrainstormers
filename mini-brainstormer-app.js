/* mini-brainstormer-app.js — reusable script (with baked-in defaults)
   Defaults point to LucidBrainstormers commit d38fd6e…
   Robust loader: JSON -> JS array parse -> dynamic module import via Blob (handles `export default`)
*/
(function(){
  'use strict';

  const $  = (s, r=document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ----- DEFAULT SOURCES (user's GitHub commit) -----
  const COMMIT = 'd38fd6ee3b954986a28eca30598b3655595bc915';
  const RAW = (path)=>`https://raw.githubusercontent.com/Drewg38/LucidBrainstormers/${COMMIT}/${path}`;

  const DEFAULT_LABELS = ['Activities','Locations','Thoughts'];
  const DEFAULT_URLS = [
    RAW('artist_excursion_activities.js'),
    RAW('artist_excursion_locations.js'),
    RAW('artist_excursion_thoughts.js')
  ];

  const root    = $('#mini-root');
  const status  = $('#status');
  const setStatus = (m)=>{ if(status) status.textContent = m || ''; };

  // --- Config from query params or data-* fallbacks
  const params = new URLSearchParams(location.search);
  const qp = (k,d='') => params.get(k) ?? d;

  const labels = [
    qp('l1', $('#label1')?.dataset?.default || $('#label1')?.textContent || DEFAULT_LABELS[0]),
    qp('l2', $('#label2')?.dataset?.default || $('#label2')?.textContent || DEFAULT_LABELS[1]),
    qp('l3', $('#label3')?.dataset?.default || $('#label3')?.textContent || DEFAULT_LABELS[2]),
  ];
  if ($('#label1')) $('#label1').textContent = labels[0];
  if ($('#label2')) $('#label2').textContent = labels[1];
  if ($('#label3')) $('#label3').textContent = labels[2];

  const urls = [
    qp('src1', $('#reel1')?.dataset?.src || DEFAULT_URLS[0]),
    qp('src2', $('#reel2')?.dataset?.src || DEFAULT_URLS[1]),
    qp('src3', $('#reel3')?.dataset?.src || DEFAULT_URLS[2])
  ];

  // --- JSON / JS normalization
  const getName = (x)=> x?.name ?? x?.label ?? x?.value ?? (typeof x === 'string' ? x : String(x ?? ''));
  const getDesc = (x)=> (!x || typeof x !== 'object') ? '' : (x.desc ?? x.description ?? x.details ?? x.detail ?? x.text ?? '');
  const normalizeList = (raw)=> {
    if (Array.isArray(raw))              return raw.map(x => ({ name:getName(x), desc:getDesc(x) }));
    if (raw && Array.isArray(raw.items)) return raw.items.map(x => ({ name:getName(x), desc:getDesc(x) }));
    return [];
  };

  const fetchTEXT = (u, ms=10000)=> new Promise((resolve,reject)=>{
    if (!u) return resolve('[]');
    const t = setTimeout(()=>reject(new Error('timeout')), ms);
    fetch(u, {mode:'cors', cache:'no-cache', redirect:'follow'}).then(r=>{
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.text();
    }).then(txt=>{ clearTimeout(t); resolve(txt); })
      .catch(e=>{ clearTimeout(t); reject(e); });
  });

  const tryParseJSON = (txt)=> { try { return JSON.parse(txt); } catch(_){ return null; } };

  // Extract a JS array literal if present
  function tryParseArrayLiteral(txt){
    // Look for the first top-level [ ... ] (naive but works for data files)
    const start = txt.indexOf('[');
    const end   = txt.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start){
      const slice = txt.slice(start, end+1);
      try { return JSON.parse(slice); } catch(_) {}
    }
    return null;
  }

  // Dynamic import via Blob (handles `export default` or module.exports)
  async function importModuleFromText(txt){
    const blob = new Blob([txt], {type:'text/javascript'});
    const url  = URL.createObjectURL(blob);
    try{
      const mod = await import(/* @vite-ignore */ url);
      return mod?.default ?? mod?.exports ?? null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function loadList(u){
    const txt = await fetchTEXT(u);
    // JSON straight
    const asJSON = tryParseJSON(txt);
    if (asJSON) return normalizeList(asJSON);
    // array literal contained in JS
    const arrLit = tryParseArrayLiteral(txt);
    if (arrLit) return normalizeList(arrLit);
    // dynamic module import (ESM/CommonJS)
    try{
      const modVal = await importModuleFromText(txt);
      if (Array.isArray(modVal)) return normalizeList(modVal);
      // maybe module exports an object with a property that is array
      if (modVal && typeof modVal === 'object'){
        for (const k of Object.keys(modVal)){
          if (Array.isArray(modVal[k])) return normalizeList(modVal[k]);
        }
      }
    }catch(_){}
    return [];
  }

  // --- 3-row window
  function windowed(list, center, size=3){
    const half = Math.floor(size/2), out=[];
    if (!list.length){ return [{name:'—'},{name:'—'},{name:'—'}]; }
    for (let i=center-half;i<=center+half;i++){
      const idx = ((i%list.length)+list.length)%list.length;
      out.push(list[idx]);
    }
    return out;
  }

  // --- Reel component (unified downward direction)
  function makeReel(rootEl, items){
    const viewport = rootEl.querySelector('.viewport') || rootEl;
    const listEl   = rootEl.querySelector('.list');
    let idx = Math.floor(Math.random()*Math.max(1,items.length));
    let spinning=false, raf=0, locked=false;

    function render(){
      if (!listEl) return;
      listEl.innerHTML='';
      const rows = windowed(items, idx, 3);
      rows.forEach((e,i)=>{
        const d = document.createElement('div');
        d.className = 'rowitem' + (i===1?' center':'');
        d.textContent = e?.name ?? '';
        listEl.appendChild(d);
      });
    }
    render();

    function step(dir=+1){
      dir = dir >= 0 ? +1 : -1;                // unify direction
      idx = ((idx + dir) % items.length + items.length) % items.length;
      render();
    }

    function spin(speed=1){
      if (locked) return;
      if (spinning) cancelAnimationFrame(raf);
      spinning = true;
      const cadence = 95 / speed;              // speed scale
      let last = performance.now(), acc = 0;
      function tick(t){
        if (!spinning) return;
        const dt = t - last; last = t; acc += dt;
        while (acc >= cadence){ step(+1); acc -= cadence; }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }
    function stop(){ spinning=false; cancelAnimationFrame(raf); }
    function lock(v){ locked = (v==null) ? true : !!v; rootEl.classList.toggle('locked', locked); }

    // Wheel & touch (down=next)
    let accum=0; const STEP=100;
    function onWheel(e){
      if (locked) return;
      e.preventDefault(); e.stopPropagation();
      if (spinning) return;
      accum += e.deltaY;
      while (accum >=  STEP){ step(+1); accum -= STEP; }
      while (accum <= -STEP){ step(-1); accum += STEP; }
    }
    viewport.addEventListener('wheel', onWheel, {passive:false});

    (function(){ // touch → wheel bridge
      let y0=null, acc=0;
      viewport.addEventListener('touchstart', e=>{ if(locked) return; y0=e.touches[0].clientY; acc=0; }, {passive:true});
      viewport.addEventListener('touchmove',  e=>{
        if (locked || y0==null) return;
        e.preventDefault();
        const y=e.touches[0].clientY, dy=y-y0; y0=y; acc+=dy;
        const CHUNK=14;
        while (acc >=  CHUNK){ onWheel({deltaY:+CHUNK, preventDefault:()=>{}, stopPropagation:()=>{}}); acc-=CHUNK; }
        while (acc <= -CHUNK){ onWheel({deltaY:-CHUNK, preventDefault:()=>{}, stopPropagation:()=>{}}); acc+=CHUNK; }
      }, {passive:false});
      viewport.addEventListener('touchend',   ()=>{ y0=null; acc=0; }, {passive:true});
      viewport.addEventListener('touchcancel',()=>{ y0=null; acc=0; }, {passive:true});
    })();

    return {
      get value(){ return items[idx]; },
      setItems(arr){ if(arr && arr.length){ items=arr; idx=Math.min(idx, items.length-1); render(); } },
      render, step, spin, stop, lock
    };
  }

  // --- Concept rendering
  function fieldHTML(label, item){
    const name = item?.name || '';
    const desc = item?.desc || '';
    return `
      <div class="field">
        <div class="name">${esc(label)}</div>
        <div>${esc(name || '—')}</div>
        ${desc ? `<div class="desc">${esc(desc)}</div>` : '' }
      </div>
    `;
  }
  function buildConcept(labels, v1, v2, v3){
    const el = $('#concept'); if(!el) return;
    el.innerHTML = `
      ${fieldHTML(labels[0], v1)}
      ${fieldHTML(labels[1], v2)}
      ${fieldHTML(labels[2], v3)}
    `;
    lastShareText = [
      `${labels[0]}: ${v1?.name || '—'}`, v1?.desc ? `  - ${v1.desc}` : '',
      `${labels[1]}: ${v2?.name || '—'}`, v2?.desc ? `  - ${v2.desc}` : '',
      `${labels[2]}: ${v3?.name || '—'}`, v3?.desc ? `  - ${v3.desc}` : '',
    ].filter(Boolean).join('\n');
  }

  // --- Share
  let lastShareText = '';
  function wireShare(){
    const box = $('#shareBox'); const toggle = $('#shareToggle');
    if (!box || !toggle) return;
    const close = ()=> box.classList.remove('open');
    toggle.onclick = (e)=>{ e.stopPropagation(); box.classList.toggle('open'); };
    document.addEventListener('click', (e)=>{ if(!box.contains(e.target)) close(); });
    const encMail = s => encodeURIComponent(s).replace(/%0A/g,'%0D%0A');

    $('#shareCopy')?.addEventListener('click', async ()=>{
      const txt = lastShareText || ($('#concept')?.innerText || '').trim();
      try{ await navigator.clipboard.writeText(txt); alert('Copied!'); }
      catch{ prompt('Copy the concept:', txt); }
      close();
    });

    $('#shareEmail')?.addEventListener('click', ()=>{
      const body = lastShareText || ($('#concept')?.innerText || '').trim();
      location.href = `mailto:?subject=${encodeURIComponent('Concept')}&body=${encMail(body)}`;
      close();
    });

    $('#shareSMS')?.addEventListener('click', ()=>{
      const body = encodeURIComponent(lastShareText || ($('#concept')?.innerText || '').trim());
      const link = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? `sms:&body=${body}` : `sms:?body=${body}`;
      location.href = link; close();
    });
  }

  async function start(){
    try{
      setStatus('Loading lists…');
      const lists = await Promise.all(urls.map(u => loadList(u).catch(()=>[])));
      const items = lists.map(js => js);
      setStatus('');

      // Build reels
      const reels = [
        makeReel($('#reel1'), items[0].length?items[0]:[{name:'—'}]),
        makeReel($('#reel2'), items[1].length?items[1]:[{name:'—'}]),
        makeReel($('#reel3'), items[2].length?items[2]:[{name:'—'}]),
      ];

      // Buttons
      const speeds = { slow:0.9, spin:1.4, fast:2.2 };
      const stopAll   = ()=> reels.forEach(r=>r.stop());
      const unlockAll = ()=> reels.forEach(r=>r.lock(false));
      const lockAll   = ()=> reels.forEach(r=>r.lock(true));

      $('#btnSlow')  && ($('#btnSlow').onclick  = ()=>{ unlockAll(); stopAll(); reels.forEach(r=>r.spin(speeds.slow)); });
      $('#btnSpin')  && ($('#btnSpin').onclick  = ()=>{ unlockAll(); stopAll(); reels.forEach(r=>r.spin(speeds.spin)); });
      $('#btnFast')  && ($('#btnFast').onclick  = ()=>{ unlockAll(); stopAll(); reels.forEach(r=>r.spin(speeds.fast)); });
      $('#btnManual')&& ($('#btnManual').onclick= ()=>{ stopAll(); unlockAll(); });
      $('#btnLock')  && ($('#btnLock').onclick  = ()=>{
        stopAll(); lockAll();
        buildConcept(labels, reels[0].value, reels[1].value, reels[2].value);
        setStatus('');
      });

      wireShare();

    }catch(e){
      console.error(e);
      setStatus('⚠️ Could not initialize.');
    }
  }

  if (root) document.addEventListener('DOMContentLoaded', start);
})();