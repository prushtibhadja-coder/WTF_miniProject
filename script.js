const { LANGS, PHRASES, CATS, LEVELS } = window.BHASHA_DATA;

const KEY = "bhasha.v1";

/* ---------------- state ---------------- */
let S = {learned:{}, answered:0, correct:0, streak:0, bestStreak:0};
try{ const raw = localStorage.getItem(KEY); if(raw) S = Object.assign(S, JSON.parse(raw)); }catch(e){}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
function learnedCount(id){ return (S.learned[id] || []).length; }
function isLearned(id,k){ return (S.learned[id] || []).indexOf(k) > -1; }
function toggleLearned(id,k){
  const arr = S.learned[id] || [];
  const i = arr.indexOf(k);
  if(i > -1) arr.splice(i,1); else arr.push(k);
  S.learned[id] = arr; save();
}
function totalLearned(){ return LANGS.reduce((n,l)=>n+learnedCount(l.id),0); }
const byId = id => LANGS.find(l=>l.id===id);
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* ---------------- toast ---------------- */
let toastT;
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove("show"), 3200);
}

/* ---------------- speech ---------------- */
let voices = [];
let voiceTries = 0;
function ensureVoices(){
  loadVoices();
  if(!voices.length && voiceTries < 6){
    voiceTries++;
    setTimeout(ensureVoices, 350 * voiceTries);
  }
}
function loadVoices(){
  try{ voices = window.speechSynthesis.getVoices() || []; }catch(e){ voices = []; }
  const lp = document.getElementById("page-listen");
  if(lp && !lp.hidden && typeof renderListen === "function") renderListen();
}
if("speechSynthesis" in window){
  ensureVoices();
  window.speechSynthesis.onvoiceschanged = ()=>{ loadVoices(); };
  document.addEventListener("pointerdown", ()=>{ if(!voices.length) ensureVoices(); }, { once:true });
  document.addEventListener("keydown", ()=>{ if(!voices.length) ensureVoices(); }, { once:true });
}
function autoVoice(langCode){
  if(!langCode) return null;
  const want = langCode.toLowerCase().replace("_","-");
  const base = want.split("-")[0];
  return voices.find(v=>v.lang && v.lang.toLowerCase().replace("_","-") === want)
      || voices.find(v=>v.lang && v.lang.toLowerCase().replace("_","-").split("-")[0] === base)
      || null;
}
/* a voice the learner picked by hand always wins over automatic matching */
function getVoice(langCode){
  const picked = langCode && S.voiceChoice ? S.voiceChoice[langCode] : null;
  if(picked){
    const v = voices.find(x=>x.name === picked);
    if(v) return v;
  }
  return autoVoice(langCode);
}
function voiceChoices(langCode){
  const want = (langCode || "").toLowerCase().replace("_","-");
  const base = want.split("-")[0];
  return voices.map(v=>{
    const vl = (v.lang || "").toLowerCase().replace("_","-");
    const rank = vl === want ? 0 : (vl.split("-")[0] === base ? 1 : 2);
    return {v:v, rank:rank};
  }).sort((a,b)=> a.rank - b.rank || a.v.name.localeCompare(b.v.name)).map(x=>x.v);
}
/* ---------- built-in voice pack (real recorded audio) ---------- */
const PACK = (window.VOICEPACK && window.VOICEPACK.clips) || {};
const PACK_META = (window.VOICEPACK && window.VOICEPACK.meta) || null;
let currentClip = null;
/* when a language has no voice, a sibling script can at least read the letters */
const APPROX = {"as-IN":"bn-IN","brx-IN":"hi-IN","doi-IN":"hi-IN","kok-IN":"hi-IN",
                "mai-IN":"hi-IN","sa-IN":"hi-IN","sd-IN":"hi-IN","ks-IN":"ur-IN"};
function approxCode(code){ return APPROX[code] || null; }
function approxAvailable(code){
  const rel = approxCode(code);
  return !!(rel && getVoice(rel));
}
function approxName(code){
  const rel = approxCode(code);
  if(!rel) return "";
  const l = LANGS.find(x=>x.speech === rel);
  return l ? l.en : rel;
}
function approxOn(code){
  return !!((S.approx && S.approx[code]) || (S.approxAll && APPROX[code]));
}
function hasVoiceFor(l){
  return !!(getVoice(l.speech) || packHas(l.speech) || clipFor(l.speech, l.phrases.hello));
}

function mineFor(langCode, text){ return VOICE.clips.get("mine|" + langCode + "|" + text) || null; }
function refClip(langCode, text){
  const stored = VOICE.clips.get(langCode + "|" + text);
  if(stored) return stored;
  return PACK[langCode + "|" + text] || null;
}
function clipFor(langCode, text){
  const mine = mineFor(langCode, text);
  if(mine) return mine;
  return refClip(langCode, text);
}
function packHas(langCode){
  for(const k of VOICE.clips.keys()){
    if(k.indexOf(langCode + "|") === 0 || k.indexOf("mine|" + langCode + "|") === 0) return true;
  }
  if(!PACK_META) return false;
  return (PACK_META.languages || []).indexOf(langCode) > -1;
}
function playClip(src, btn, onEnd){
  try{
    if(currentClip){ currentClip.pause(); currentClip = null; }
    try{ window.speechSynthesis.cancel(); }catch(e){}
    const a = new Audio(src);
    currentClip = a;
    if(btn){ btn.classList.add("on"); }
    const clear = ()=>{ if(btn) btn.classList.remove("on"); if(currentClip === a) currentClip = null; };
    a.onended = ()=>{ clear(); if(onEnd) onEnd(); };
    a.onerror = ()=>{ clear(); if(onEnd) onEnd(); };
    const pr = a.play();
    if(pr && pr.catch) pr.catch(()=>{ clear(); if(onEnd) onEnd(); });
    return true;
  }catch(e){ return false; }
}
function speak(text, langCode, langName, btn){
  const clip = clipFor(langCode, text);
  if(clip) return playClip(clip, btn);
  return speakDevice(text, langCode, langName, btn);
}
function speakDevice(text, langCode, langName, btn){
  if(!("speechSynthesis" in window)){ toast("This browser cannot play speech."); return false; }
  let v = getVoice(langCode);
  if(!v && approxOn(langCode) && approxCode(langCode)) v = getVoice(approxCode(langCode));
  if(v && !getVoice(langCode)) langName = approxName(langCode) + " (approximate)";
  if(!v){
    toast("No " + langName + " voice on this device — Listen → Check voices shows what is installed.");
    return false;
  }
  try{
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v; u.lang = v.lang; u.rate = 0.85;
    if(btn){ btn.classList.add("on"); u.onend = ()=>btn.classList.remove("on"); u.onerror = ()=>btn.classList.remove("on"); }
    window.speechSynthesis.speak(u);
    return true;
  }catch(e){ toast("Playback is unavailable here."); return false; }
}
/* sequential playback that does not cancel itself — used by the Listen tour */
function speakSeq(text, langCode, done){
  const clip = clipFor(langCode, text);
  if(clip){ playClip(clip, null, done); return; }
  const v = getVoice(langCode);
  if(!v || !("speechSynthesis" in window)){ done(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v; u.lang = v.lang; u.rate = 0.85;
  let fired = false;
  const finish = ()=>{ if(fired) return; fired = true; done(); };
  u.onend = finish; u.onerror = finish;
  try{ window.speechSynthesis.speak(u); }catch(e){ finish(); }
}
function speakCard(id, btn){
  const l = byId(id);
  speak(l.native + ". " + l.phrases.hello, l.speech, l.en, btn);
}
const speakSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 8.5a5 5 0 0 1 0 7"/></svg>';
const checkSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m4 12.5 5 5L20 6.5"/></svg>';
const micSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const playSVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z"/></svg>';

/* ---------------- explore ---------------- */
let filter = "all", query = "";
const famLabel = {indo:"Indo-Aryan", dravidian:"Dravidian", tibeto:"Tibeto-Burman", munda:"Austroasiatic"};

function renderChips(){
  const el = document.getElementById("chips");
  const items = [["all","All 22"]].concat(Object.keys(famLabel).map(k=>[k,famLabel[k]]));
  el.innerHTML = items.map(([k,label])=>
    '<button class="chip" data-fam="'+k+'" aria-pressed="'+(filter===k)+'">'+label+'</button>').join("");
  el.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ filter = b.dataset.fam; renderChips(); render(); });
}

function matches(l){
  if(filter !== "all" && l.famKey !== filter) return false;
  if(!query) return true;
  const q = query.toLowerCase();
  return [l.en, l.native, l.roman, l.script, l.family, l.states].join(" ").toLowerCase().includes(q);
}

let sortBy = "az";
function speakerNum(l){
  const s = String(l.speakers);
  const m = s.match(/([\d.]+)\s*(crore|lakh|thousand)/i);
  if(m){
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    return u === "crore" ? n * 1e7 : u === "lakh" ? n * 1e5 : n * 1e3;
  }
  return parseFloat(s.replace(/[^\d.]/g, "")) || 0;
}
function sorted(list){
  const arr = list.slice();
  if(sortBy === "speakers") arr.sort((a,b)=> speakerNum(b) - speakerNum(a));
  else if(sortBy === "family") arr.sort((a,b)=> a.family.localeCompare(b.family) || a.en.localeCompare(b.en));
  else if(sortBy === "script") arr.sort((a,b)=> a.script.localeCompare(b.script) || a.en.localeCompare(b.en));
  else if(sortBy === "progress") arr.sort((a,b)=> learnedCount(b.id) - learnedCount(a.id) || a.en.localeCompare(b.en));
  else arr.sort((a,b)=> a.en.localeCompare(b.en));
  return arr;
}
document.getElementById("sortSel").addEventListener("change", e => { sortBy = e.target.value; render(); });

function render(){
  const list = sorted(LANGS.filter(matches));
  const grid = document.getElementById("grid");
  const tw = document.getElementById("tableWrap");
  document.getElementById("empty").hidden = list.length > 0;
  grid.innerHTML = list.map((l,i)=>{
    const n = learnedCount(l.id), pct = Math.round(n/PHRASES.length*100);
    return '<div class="card" role="button" tabindex="0" data-id="'+l.id+'" aria-label="Open '+esc(l.en)+' phrasebook" style="animation-delay:'+Math.min(i*24,420)+'ms">'
      + '<button class="iconbtn card-sp" data-sp="'+l.id+'" title="Hear '+esc(l.en)+'" aria-label="Hear '+esc(l.en)+'">'+speakSVG+'</button>'
      + '<div class="native sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.native)+'</div>'
      + '<div class="name">'+esc(l.en)+'</div>'
      + (l.roman.toLowerCase()===l.en.toLowerCase() ? '' : '<div class="roman">'+esc(l.roman)+'</div>')
      + '<div class="meta"><span class="tag">'+esc(l.script)+'</span><span class="tag gold">'+esc(l.family)+'</span></div>'
      + '<div class="speakers">'+esc(l.speakers)+' speakers</div>'
      + '<div class="bar"><i style="width:'+pct+'%"></i></div>'
      + '<div class="done">'+(n?n+' / '+PHRASES.length+' phrases':'Start learning')+'</div>'
      + '</div>';
  }).join("");
  grid.querySelectorAll(".card").forEach(c=>{
    c.onclick = ()=>openDetail(c.dataset.id);
    c.onkeydown = e=>{ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); openDetail(c.dataset.id); } };
  });
  grid.querySelectorAll(".card-sp").forEach(b=>{
    b.onclick = e => { e.stopPropagation(); speakCard(b.dataset.sp, b); };
  });
  grid.querySelectorAll(".card .native").forEach(el=>{
    const l = byId(el.closest(".card").dataset.id);
    bindHover(el, l.native, l.speech, l.en);
  });

  document.getElementById("tbody").innerHTML = list.map(l=>
    '<tr data-id="'+l.id+'" style="cursor:pointer">'
    + '<td><div class="native sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.native)+'</div><div class="en">'+esc(l.en)+'</div></td>'
    + '<td>'+esc(l.script)+'</td><td>'+esc(l.family)+'</td>'
    + '<td class="num">'+esc(l.speakers)+'</td><td>'+esc(l.states)+'</td></tr>').join("");
  document.getElementById("tbody").querySelectorAll("tr").forEach(r=>r.onclick=()=>openDetail(r.dataset.id));
  tw.hidden = view !== "table";
  grid.hidden = view === "table";
}

let view = "grid";
document.getElementById("vGrid").onclick = ()=>{ view="grid"; document.getElementById("vGrid").setAttribute("aria-pressed","true"); document.getElementById("vTable").setAttribute("aria-pressed","false"); render(); };
document.getElementById("vTable").onclick = ()=>{ view="table"; document.getElementById("vTable").setAttribute("aria-pressed","true"); document.getElementById("vGrid").setAttribute("aria-pressed","false"); render(); };
document.getElementById("q").oninput = e => { query = e.target.value.trim(); render(); };

/* ---------------- phrase of the day ---------------- */
function renderPOD(){
  const d = new Date();
  const seed = d.getFullYear()*1000 + (d.getMonth()+1)*40 + d.getDate();
  const l = LANGS[seed % LANGS.length];
  const p = PHRASES[seed % PHRASES.length];
  const el = document.getElementById("pod");
  el.innerHTML =
    '<div class="pod-l">'
    + '<div class="eyebrow">Phrase of the day</div>'
    + '<div class="pod-native sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.phrases[p.k])+'</div>'
    + '<div class="pod-meaning">'+esc(p.en)+'</div>'
    + '<div class="pod-lang">'+esc(l.en)+' · '+esc(l.native)+'</div>'
    + '</div>'
    + '<div class="pod-r">'
    + '<p>One phrase a day, twenty-two languages, no account and no tracking. Open the phrasebook to hear it and mark it learned.</p>'
    + '<div style="display:flex; gap:8px; flex-wrap:wrap">'
    + '<button class="btn primary" id="podSpeak">'+speakSVG+' Listen</button>'
    + '<button class="btn" id="podOpen">Open phrasebook</button>'
    + '</div></div>';
  document.getElementById("podSpeak").onclick = e => speak(l.phrases[p.k], l.speech, l.en, e.currentTarget);
  document.getElementById("podOpen").onclick = ()=>openDetail(l.id);
  bindHover(document.querySelector(".pod-native"), l.phrases[p.k], l.speech, l.en);
}

/* ---------------- detail ---------------- */
let currentDetail = null;
let levelFilter = 0;
function openDetail(id){
  currentDetail = id;
  const l = byId(id);
  const body = document.getElementById("detailBody");
  const n = learnedCount(id);
  const D = (window.LANG_DETAILS && window.LANG_DETAILS[id]) || {};
  body.innerHTML =
    '<div class="det-native sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.native)+'</div>'
    + '<div class="det-sub"><span class="en">'+esc(l.en)+'</span>'
    + (l.roman.toLowerCase()===l.en.toLowerCase() ? '' : '<span class="roman">'+esc(l.roman)+'</span>') + '</div>'
    + '<div class="det-tags"><span class="tag gold">'+esc(l.family)+'</span><span class="tag">'+esc(l.script)+'</span></div>'
    + (hasVoiceFor(l) ? '' :
        '<div class="nobar">'
        + '<b>No ' + esc(l.en) + ' voice on this device</b>'
        + '<p>Browsers can only speak a language your system has a voice installed for, and ' + esc(l.en) + ' is not one of them here. Nothing is broken — there is simply no engine to use. If another device (a phone, say) does have it, record there and use <b>Export my voice</b> then <b>Import voice file</b> here.</p>'
        + '<div class="vactions">'
        +   '<button class="btn" id="nbRec">Record my voice</button>'
        +   '<button class="btn" id="nbPack">Add a real voice</button>'
        +   '<button class="btn" id="nbPick">Choose another voice</button>'
        +   (approxAvailable(l.speech)
              ? '<button class="btn" id="nbApprox">' + (approxOn(l.speech)
                  ? 'Stop the ' + esc(approxName(l.speech)) + ' voice'
                  : 'Read with ' + esc(approxName(l.speech)) + ' voice') + '</button>'
              : '')
        + '</div>'
        + (approxAvailable(l.speech)
              ? '<p class="nbfoot">The ' + esc(approxName(l.speech)) + ' voice reads this script letter by letter. It is approximate: the letters are right, the pronunciation is not. You can switch this on for every such language at once under <b>Check voices</b>.</p>'
              : '')
        + '</div>')
    + '<p class="det-note">'+esc(l.note)+'</p>'
    + '<dl class="facts">'
    +   '<div class="fact"><dt>Speakers</dt><dd>'+esc(l.speakers)+'</dd></div>'
    +   '<div class="fact"><dt>Main region</dt><dd>'+esc(l.states)+'</dd></div>'
    +   '<div class="fact"><dt>Script</dt><dd>'+esc(l.script)+'</dd></div>'
    +   '<div class="fact"><dt>Direction</dt><dd>'+(l.rtl?'Right to left':'Left to right')+'</dd></div>'
    + '</dl>'
    + (D.status
        ? '<h3 class="sec">Details</h3>'
          + '<dl class="facts">'
          +   '<div class="fact"><dt>Official status</dt><dd>'+esc(D.status)+'</dd></div>'
          +   '<div class="fact"><dt>Branch</dt><dd>'+esc(D.branch)+'</dd></div>'
          +   '<div class="fact"><dt>Related languages</dt><dd>'+esc(D.related)+'</dd></div>'
          +   '<div class="fact"><dt>Dialects</dt><dd>'+esc(D.dialects)+'</dd></div>'
          + '</dl>'
          + '<div class="prose">'
          +   '<h4>Writing system</h4><p>'+esc(D.scriptNote)+'</p>'
          +   '<h4>History</h4><p>'+esc(D.history)+'</p>'
          +   '<h4>Literature</h4><p>'+esc(D.literature)+'</p>'
          + '</div>'
        : '')
    + '<div class="specimen" style="margin-top:24px">'
    +   '<div class="big sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.phrases.hello)+'</div>'
    +   '<div class="cap">Hello · written in '+esc(l.script)+'</div>'
    + '</div>'
    + '<h3 class="sec">Phrasebook</h3>'
    + '<div class="progressline"><div class="bar"><i id="detBar" style="width:'+Math.round(n/PHRASES.length*100)+'%"></i></div><span id="detCount">'+n+' / '+PHRASES.length+'</span></div>'
    + '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0 4px">'
    +   '<button class="btn" id="recOpenBtn" style="padding:8px 14px; font-size:.8rem">'+micSVG+' Record my voice</button>'
    +   '<span class="hint" style="margin:0" id="mineCount"></span>'
    + '</div>'
    + '<div class="lvlchips" id="lvlChips">'
    +   '<button class="chip" data-lvl="0" aria-pressed="'+(levelFilter === 0)+'">All '+PHRASES.length+'</button>'
    +   LEVELS.map(L=>'<button class="chip" data-lvl="'+L.n+'" aria-pressed="'+(levelFilter === L.n)+'">'+esc(L.name)+' '+PHRASES.filter(p=>p.lvl === L.n).length+'</button>').join("")
    + '</div>'
    + '<div id="phrases">'+LEVELS.filter(L=> levelFilter === 0 || L.n === levelFilter).map(L=>{
        const inLevel = PHRASES.filter(p=>p.lvl === L.n);
        if(!inLevel.length) return '';
        return '<h3 class="sec">'+esc(L.name)+'</h3>'
          + '<p class="lvlnote">'+esc(L.note)+'</p>'
          + CATS.map(c=>{
        const items = inLevel.filter(p=>p.cat === c.id);
        if(!items.length) return '';
        return '<h4 class="cat">'+esc(c.label)+'</h4>' + items.map(p=>{
          const on = isLearned(id,p.k);
          const mine = !!mineFor(l.speech, l.phrases[p.k]);
          return '<div class="phrase'+(on?' learned':'')+(mine?' mine':'')+'" data-k="'+p.k+'">'
            + '<span class="pe">'+esc(p.en)+'</span>'
            + '<span class="pn sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.phrases[p.k])+'</span>'
            + '<span class="pa">'
            +   '<button class="iconbtn sp" data-k="'+p.k+'" title="Device voice" aria-label="Listen to '+esc(p.en)+'">'+speakSVG+'</button>'
            +   '<button class="iconbtn rc" data-k="'+p.k+'" title="Record this in your voice" aria-label="Record this in your voice">'+micSVG+'</button>'
            +   '<button class="iconbtn pm" data-k="'+p.k+'" data-sp="'+l.speech+'" title="Play your voice" aria-label="Play your voice"'+(mine?'':' disabled')+'>'+playSVG+'</button>'
            +   '<button class="iconbtn mk'+(on?' on':'')+'" data-k="'+p.k+'" aria-label="Mark learned" aria-pressed="'+on+'">'+checkSVG+'</button>'
            + '</span></div>';
        }).join("");
      }).join("");
      }).join("")+'</div>'
    + '<p class="hint">Point at any phrase to hear it, or use the speaker button. The mic records your own take and plays it back-to-back with the device voice so you can compare. Tick a phrase once you can say it without looking — progress is saved in this browser.</p>'
    + '<h3 class="sec">Quick check</h3>'
    + '<div id="mini"></div>';

  body.querySelectorAll("#lvlChips .chip").forEach(b=>{
    b.onclick = ()=>{ levelFilter = Number(b.dataset.lvl); openDetail(id); };
  });
  const nbRec = document.getElementById("nbRec");
  if(nbRec) nbRec.onclick = ()=> openRecorder(l.speech);
  const nbPack = document.getElementById("nbPack");
  if(nbPack) nbPack.onclick = ()=> openVoice();
  const nbPick = document.getElementById("nbPick");
  if(nbPick) nbPick.onclick = ()=>{
    const code = l.speech;
    closeDetail();
    go("listen");
    setTimeout(()=>{
      const row = [...document.querySelectorAll(".listrow")].find(r=> LANGS[Number(r.dataset.i)].speech === code);
      if(!row) return;
      row.scrollIntoView({ block:"center", behavior:"smooth" });
      row.style.outline = "2px solid var(--gold-bright)";
      setTimeout(()=>{ row.style.outline = ""; }, 2200);
      const sel = row.querySelector(".voicesel");
      if(sel){ sel.focus(); toast("Pick any installed voice for " + l.en + " here."); }
    }, 150);
  };
  const nbA = document.getElementById("nbApprox");
  if(nbA) nbA.onclick = ()=>{
    S.approx = S.approx || {};
    if(S.approx[l.speech]) delete S.approx[l.speech];
    else S.approx[l.speech] = true;
    save();
    const on = S.approx[l.speech];
    openDetail(id);
    if(on) speak(l.phrases.hello, l.speech, l.en, null);
    else toast("Approximate reading off for " + l.en + ".");
  };
  const ro = document.getElementById("recOpenBtn");
  if(ro) ro.onclick = ()=> openRecorder(l.speech);
  const mc = document.getElementById("mineCount");
  if(mc){ const c = countMine(l.speech); mc.textContent = c ? c + " in your voice" : ""; }
  body.querySelectorAll(".phrase .sp").forEach(b=>{
    b.onclick = ()=> speak(l.phrases[b.dataset.k], l.speech, l.en, b);
  });
  body.querySelectorAll(".phrase .rc").forEach(b=>{
    b.onclick = ()=> recordRow(l, b.dataset.k, b);
  });
  body.querySelectorAll(".phrase .pm").forEach(b=>{
    b.onclick = ()=>{ const uri = mineFor(l.speech, l.phrases[b.dataset.k]); if(uri) playClip(uri, b); };
  });
  body.querySelectorAll(".phrase .mk").forEach(b=>{
    b.onclick = ()=>{
      toggleLearned(id, b.dataset.k);
      const on = isLearned(id, b.dataset.k);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
      b.closest(".phrase").classList.toggle("learned", on);
      const c = learnedCount(id);
      document.getElementById("detCount").textContent = c + " / " + PHRASES.length;
      document.getElementById("detBar").style.width = Math.round(c/PHRASES.length*100) + "%";
      render();
    };
  });

  body.querySelectorAll(".phrase").forEach(el=>{
    const k = el.dataset.k;
    bindHover(el.querySelector(".pn"), l.phrases[k], l.speech, l.en);
  });

  document.getElementById("detail").hidden = false;
  document.body.style.overflow = "hidden";
  document.querySelector(".panel").scrollTop = 0;
  renderMini(id);
}
function closeDetail(){
  currentDetail = null;
  document.getElementById("detail").hidden = true;
  document.body.style.overflow = "";
}
document.getElementById("closeDetail").onclick = closeDetail;
document.getElementById("detail").onclick = e => { if(e.target.id === "detail") closeDetail(); };
document.addEventListener("keydown", e => { if(e.key === "Escape") closeDetail(); });

/* ---------------- quiz engine ---------------- */
function shuffle(a){ a = a.slice(); for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }

function buildQuestion(langId, phraseKey, type){
  const lang = byId(langId);
  const ph = PHRASES.find(p=>p.k===phraseKey);
  const answer = lang.phrases[phraseKey];
  const others = shuffle(LANGS.filter(l=>l.id!==langId)).slice(0,3);
  let options, prompt;
  if(type === "toTarget"){
    prompt = 'How do you say <span class="target">' + esc(ph.en) + '</span> in ' + esc(lang.en) + '?';
    options = shuffle([answer].concat(others.map(l=>l.phrases[phraseKey])))
      .filter((v,i,arr)=>arr.indexOf(v)===i);
    while(options.length < 4){
      const extra = LANGS[Math.floor(Math.random()*LANGS.length)].phrases[phraseKey];
      if(options.indexOf(extra) === -1) options.push(extra);
    }
  } else {
    prompt = 'Which language says <span class="target sc-' + lang.scriptKey + '"' + (lang.rtl?' dir="rtl"':'') + '>' + esc(answer) + '</span>?';
    /* skip any language that uses the very same word, so no distractor is also right */
    const pool = shuffle(LANGS.filter(l=>l.id !== langId && l.phrases[phraseKey] !== answer));
    options = shuffle([lang.en].concat(pool.slice(0,3).map(l=>l.en)));
  }
  return {prompt:prompt, answer:answer, options:options, langId:langId, phraseKey:phraseKey,
          scriptKey:lang.scriptKey, rtl:lang.rtl, langEn:lang.en, phraseEn:ph.en, type:type};
}

function mountQuiz(container, q, onDone){
  const letters = ["A","B","C","D"];
  container.innerHTML =
    '<div class="qmeta"><span>Question</span><span id="qtag">'+esc(q.langEn)+'</span></div>'
    + '<div class="qtext">'+q.prompt+'</div>'
    + '<div class="opts" id="opts">'+q.options.map((o,i)=>
        '<button class="opt" data-i="'+i+'"><span class="k">'+letters[i]+'</span>'
        + '<span class="sc-'+(q.type==="toTarget"?q.scriptKey:"")+'"'+(q.type==="toTarget"&&q.rtl?' dir="rtl"':'')+'>'+esc(o)+'</span></button>').join("")+'</div>'
    + '<div class="qfoot"><div class="scorebar" id="sb"></div><button class="btn" id="nextBtn" disabled>Next question</button></div>';

  const opts = container.querySelectorAll(".opt");
  let answered = false;
  opts.forEach(b=>{
    b.onclick = ()=>{
      if(answered) return;
      answered = true;
      const val = q.options[Number(b.dataset.i)];
      const right = val === q.answer;
      opts.forEach(o=>{
        o.disabled = true;
        if(q.options[Number(o.dataset.i)] === q.answer) o.classList.add("correct");
      });
      if(!right) b.classList.add("wrong");
      S.answered++; if(right){ S.correct++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); } else { S.streak = 0; }
      save();
      container.querySelector("#nextBtn").disabled = false;
      container.querySelector("#nextBtn").focus();
      if(onDone) onDone(right);
      if(q.type === "toTarget" && right) speak(q.answer, byId(q.langId).speech, q.langEn, null);
    };
  });
  if(q.type === "toTarget"){
    const tl = byId(q.langId);
    opts.forEach(b=> bindHover(b, q.options[Number(b.dataset.i)], tl.speech, tl.en));
  }
  container.querySelector("#nextBtn").onclick = ()=> onDone ? onDone("next") : null;
}

/* ---------------- practice page ---------------- */
let current = null;
function nextPractice(){
  const l = LANGS[Math.floor(Math.random()*LANGS.length)];
  const p = PHRASES[Math.floor(Math.random()*PHRASES.length)];
  const type = Math.random() < 0.55 ? "toTarget" : "fromTarget";
  current = buildQuestion(l.id, p.k, type);
  const card = document.getElementById("quizcard");
  mountQuiz(card, current, (res)=>{
    if(res === "next"){ nextPractice(); return; }
    updateScore();
  });
  updateScore();
}
function updateScore(){
  const sb = document.getElementById("sb");
  if(!sb) return;
  const acc = S.answered ? Math.round(S.correct/S.answered*100) : 0;
  sb.innerHTML = '<span>Score <b>'+S.correct+'</b>/'+S.answered+'</span>'
    + '<span>Accuracy <b>'+acc+'%</b></span>'
    + '<span>Streak <b>'+S.streak+'</b></span>';
}

/* ---------------- mini quiz in detail ---------------- */
function renderMini(langId){
  const l = byId(langId);
  const p = PHRASES[Math.floor(Math.random()*PHRASES.length)];
  const q = buildQuestion(langId, p.k, "toTarget");
  const host = document.getElementById("mini");
  mountQuiz(host, q, (res)=>{ if(res === "next") renderMini(langId); });
  const sb = host.querySelector("#sb");
  if(sb) sb.innerHTML = '<span>Phrase: <b>'+esc(p.en)+'</b></span>';
}

/* ---------------- progress page ---------------- */
function renderProgress(){
  const total = LANGS.length * PHRASES.length;
  const done = totalLearned();
  const started = LANGS.filter(l=>learnedCount(l.id) > 0).length;
  const acc = S.answered ? Math.round(S.correct/S.answered*100) : 0;
  document.getElementById("progHero").innerHTML =
    '<div class="bigstat"><b>'+done+'</b><span>phrases learned of '+total+'</span></div>'
    + '<div class="bigstat"><b>'+started+'</b><span>languages started</span></div>'
    + '<div class="bigstat"><b>'+acc+'%</b><span>quiz accuracy ('+S.answered+' answered)</span></div>'
    + '<div class="bigstat"><b>'+S.bestStreak+'</b><span>best streak</span></div>';
  document.getElementById("progList").innerHTML = LANGS.map(l=>{
    const n = learnedCount(l.id);
    return '<div class="prow" data-id="'+l.id+'">'
      + '<div class="nm"><span class="sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.native)+'</span> — '+esc(l.en)
      + '<small>'+esc(l.script)+'</small></div>'
      + '<div class="bar"><i style="width:'+Math.round(n/PHRASES.length*100)+'%"></i></div>'
      + '<div class="ct">'+n+'/'+PHRASES.length+'</div></div>';
  }).join("");
  document.getElementById("progList").querySelectorAll(".prow").forEach(r=>{
    r.onclick = ()=>{ go("explore"); openDetail(r.dataset.id); };
  });
}
document.getElementById("resetBtn").onclick = ()=>{
  if(confirm("Clear every phrase you have marked and all quiz scores?")){
    S = {learned:{}, answered:0, correct:0, streak:0, bestStreak:0}; save();
    renderProgress(); render(); toast("Progress cleared.");
  }
};

/* ---------------- navigation ---------------- */
function go(page){
  ["explore","practice","progress","listen","guide"].forEach(p=>{
    document.getElementById("page-"+p).hidden = (p !== page);
  });
  if(page !== "listen") stopTour();
  document.querySelectorAll(".navbtn").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.go === page)));
  window.scrollTo({top:0, behavior:"instant"});
  if(page === "practice"){ nextPractice(); }
  if(page === "progress"){ renderProgress(); }
  if(page === "explore"){ render(); }
  if(page === "listen"){ renderListen(); }
}
document.querySelectorAll("[data-go]").forEach(b=>{
  b.onclick = e => { e.preventDefault(); go(b.dataset.go); };
});


/* ---------------- listen page + tour ---------------- */
function voiceSelectHTML(l){
  const picked = (S.voiceChoice && S.voiceChoice[l.speech]) || "";
  const auto = autoVoice(l.speech);
  let h = '<select class="voicesel" aria-label="Voice for '+esc(l.en)+'">';
  h += '<option value="">Automatic — '+(auto ? esc(auto.name) : 'none found')+'</option>';
  voiceChoices(l.speech).forEach(v=>{
    h += '<option value="'+esc(v.name)+'"'+(picked === v.name ? ' selected' : '')+'>'
       + esc(v.name)+' · '+esc(v.lang)+'</option>';
  });
  h += '</select>';
  return h;
}
function renderListen(){
  const el = document.getElementById("listenList");
  el.innerHTML = LANGS.map((l,i)=>{
    const has = !!getVoice(l.speech) || packHas(l.speech);
    return '<div class="listrow" data-i="'+i+'"'+(has?'':' data-novoice="1"')+'>'
      + '<button class="iconbtn" data-play="'+i+'" title="Play '+esc(l.en)+'" aria-label="Play '+esc(l.en)+'">'+speakSVG+'</button>'
      + '<div style="min-width:0">'
      +   '<div class="lr-native sc-'+l.scriptKey+'"'+(l.rtl?' dir="rtl"':'')+'>'+esc(l.native)+'</div>'
      +   '<div class="lr-meta">'+esc(l.en)+' · '+esc(l.script)+'</div>'
      + '</div>'
      + '<div class="lr-voice">'+(packHas(l.speech)
          ? '<span class="packtag">'+esc(voiceLabel())+' · built in</span>'
          : voiceSelectHTML(l))
        + (countMine(l.speech) ? ' <span class="packtag mine">your voice '+countMine(l.speech)+'</span>' : '')
        + ((!getVoice(l.speech) && approxOn(l.speech)) ? ' <span class="packtag mine">approx · '+esc(approxName(l.speech))+'</span>' : '')
        + '</div>'
      + '<div class="lr-tag">'+esc(l.speakers)+'</div></div>';
  }).join("");
  const vc = document.getElementById("voiceCount");
  const storedLangs = new Set([...VOICE.clips.keys()].map(k => k.split("|")[0]));
  const packLangs = (PACK_META && PACK_META.languages) || [];
  const realLangs = new Set([...packLangs, ...storedLangs]);
  if(vc && realLangs.size){
    const bits = [];
    if(packLangs.length) bits.push(packLangs.length + " baked into this file");
    if(storedLangs.size) bits.push(storedLangs.size + " stored in this browser");
    vc.textContent = 'Real voice available for ' + realLangs.size + ' of these languages (' +
      bits.join(", ") + '), so they play even with no system voices. The rest use your device voices.';
    const intro = document.getElementById("listenIntro");
    if(intro) intro.textContent = 'A guided audio tour. Each language says its own name, then hello. ' +
      realLangs.size + ' of them play from a recorded voice; the others use your device voices, ' +
      'which you can swap in the menu beside each row.';
    return;
  }
  if(vc){
    const n = voices.length;
    vc.textContent = n
      ? n + ' voice' + (n === 1 ? '' : 's') + ' installed on this device. Rows with no matching voice are dimmed until you assign one.'
      : 'This browser is reporting no installed voices, so nothing can play. Try Chrome or Edge on desktop, or add voices in your system settings.';
  }
}
document.getElementById("listenList").addEventListener("change", e=>{
  const sel = e.target.closest(".voicesel");
  if(!sel) return;
  const row = sel.closest(".listrow");
  const l = LANGS[Number(row.dataset.i)];
  S.voiceChoice = S.voiceChoice || {};
  if(sel.value) S.voiceChoice[l.speech] = sel.value;
  else delete S.voiceChoice[l.speech];
  save();
  const has = !!getVoice(l.speech);
  if(has) delete row.dataset.novoice; else row.dataset.novoice = "1";
  if(has){
    const v = getVoice(l.speech);
    toast(l.en + ' will use ' + v.name + '.');
    speak(l.native + ". " + l.phrases.hello, l.speech, l.en, null);
  } else {
    toast("No voice selected for " + l.en + ".");
  }
});
document.getElementById("listenList").onclick = e => {
  const b = e.target.closest("[data-play]");
  if(!b) return;
  const l = LANGS[Number(b.dataset.play)];
  speak(l.native + ". " + l.phrases.hello, l.speech, l.en, b);
};

let tourActive = false, tourI = 0;
function clearPlaying(){ document.querySelectorAll(".listrow.playing").forEach(r=>r.classList.remove("playing")); }
function stopTour(){
  tourActive = false;
  try{ window.speechSynthesis.cancel(); }catch(e){}
  if(currentClip){ try{ currentClip.pause(); }catch(e){} currentClip = null; }
  clearPlaying();
}
function tourStep(){
  if(!tourActive) return;
  if(tourI >= LANGS.length){ tourActive = false; clearPlaying(); toast("That was all twenty-two."); return; }
  const i = tourI++;
  const l = LANGS[i];
  const row = document.querySelector('.listrow[data-i="'+i+'"]');
  if(row){
    row.classList.add("playing");
    if(row.scrollIntoView) row.scrollIntoView({block:"nearest", behavior:"smooth"});
  }
  if(!getVoice(l.speech)){ setTimeout(tourStep, 90); return; }
  speakSeq(l.native + ". " + l.phrases.hello, l.speech, ()=>{
    if(row) row.classList.remove("playing");
    setTimeout(tourStep, 260);
  });
}
function playTour(){
  if(!("speechSynthesis" in window)){ toast("This browser cannot play speech."); return; }
  stopTour();
  tourActive = true; tourI = 0;
  tourStep();
}
document.getElementById("tourPlay").onclick = playTour;
document.getElementById("tourStop").onclick = stopTour;

/* ---------------- voice search ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = document.getElementById("micBtn");
if(!SR){
  micBtn.style.display = "none";
} else {
  let recog = null;
  micBtn.onclick = ()=>{
    if(recog){ try{ recog.stop(); }catch(e){} recog = null; micBtn.classList.remove("rec"); return; }
    recog = new SR();
    recog.lang = "en-IN"; recog.interimResults = false; recog.maxAlternatives = 3;
    recog.onresult = ev=>{
      const said = String(ev.results[0][0].transcript).replace(/[.?!,]+$/,"").trim();
      const input = document.getElementById("q");
      input.value = said; query = said; render();
      const hit = LANGS.filter(matches).length;
      toast(hit ? 'Heard "' + said + '" — ' + hit + ' match' + (hit === 1 ? '' : 'es')
                : 'Heard "' + said + '" — nothing matched. Try a language name.');
    };
    recog.onerror = ev=>{
      micBtn.classList.remove("rec");
      toast(ev.error === "not-allowed" ? "Microphone permission was blocked."
            : ev.error === "no-speech" ? "Nothing heard. Tap the mic and speak."
            : "Voice search did not catch that. Try again.");
    };
    recog.onend = ()=>{ micBtn.classList.remove("rec"); recog = null; };
    try{ recog.start(); micBtn.classList.add("rec"); toast("Listening… say a language name."); }
    catch(e){ micBtn.classList.remove("rec"); recog = null; }
  };
}

/* ---------------- my own voice: record, keep, and use ---------------- */
const REC = { rec:null, chunks:[], active:false, deviceId:"" };

async function refreshDevices(){
  const sel = document.getElementById("recDevice");
  const wrap = document.getElementById("recDevWrap");
  if(!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try{
    const all = await navigator.mediaDevices.enumerateDevices();
    const mics = all.filter(d=>d.kind === "audioinput");
    if(mics.length < 1){ wrap.style.display = "none"; return; }
    const current = REC.deviceId || "";
    sel.innerHTML = mics.map((d,i)=>{
      const label = d.label || ("Microphone " + (i + 1));
      return '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === current ? " selected" : "") + '>' + esc(label) + '</option>';
    }).join("");
    wrap.style.display = mics.length > 1 ? "block" : "none";
  }catch(e){}
}

function blobToDataURI(blob){
  return new Promise(res=>{
    try{
      const fr = new FileReader();
      fr.onload = ()=> res(fr.result);
      fr.onerror = ()=> res(null);
      fr.readAsDataURL(blob);
    }catch(e){ res(null); }
  });
}
function countMine(code){
  let n = 0;
  for(const k of VOICE.clips.keys()){ if(k.indexOf("mine|" + code + "|") === 0) n++; }
  return n;
}
function stopRec(){ if(REC.active && REC.rec){ try{ REC.rec.stop(); }catch(e){} } }

function micDiagnosis(err){
  const name0 = (err && err.name) || "";
  const msg0 = String((err && err.message) || "");
  if(name0 === "SecurityError" || /security origin/i.test(msg0)){
    return { title:"This page has no usable security origin", steps:[
      "The browser reported <b>Invalid security origin</b>. That is what happens when the file is shown inside an app's preview window or a sandboxed frame — it has no real address, so a microphone can never be granted to it.",
      "Open the app in a real browser instead, over <code>http://</code> or <code>https://</code> — for example host the file and open its link in Chrome.",
      "On a phone the quickest way is <b>Record with phone app</b> below: your device's own voice recorder opens, you speak the phrase, and the file comes straight back into the app. No permission is involved at all."
    ]};
  }
  const onFile = location.protocol === "file:";
  if(onFile){
    return { title:"The microphone is blocked because this page was opened from a file", steps:[
      "Browsers refuse microphone access to pages opened straight from disk. It is a security rule, not something the app can override.",
      "Serve the folder instead: open a terminal in it and run <code>python3 -m http.server 8000</code>, then visit <code>http://localhost:8000/bhasha-22-languages.html</code>.",
      "No terminal, or on a phone? Record on any voice-recorder app and bring the file in with <b>Import audio</b> below — that works with no microphone permission at all."
    ]};
  }
  if(name === "NotAllowedError" || name === "PermissionDeniedError"){
    return { title:"Permission was refused", steps:[
      "Click the padlock or microphone icon at the left of the address bar.",
      "Set Microphone to <b>Allow</b>, then reload this page.",
      "Also check your system settings: macOS System Settings → Privacy &amp; Security → Microphone, or Windows Settings → Privacy → Microphone, and make sure the browser itself is switched on there."
    ]};
  }
  if(name === "NotFoundError" || name === "DevicesNotFoundError"){
    return { title:"No microphone was found", steps:["Connect or enable a microphone, then try again."]};
  }
  if(name === "NotReadableError" || name === "TrackStartError"){
    return { title:"The microphone is busy", steps:["Another app or tab is using it. Close that and try again."]};
  }
  return { title:"Recording could not start", steps:[String((err && err.message) || "Unknown error") + " — you can still use <b>Import audio</b> below."]};
}
function showMicHelp(err){
  const box = document.getElementById("recHelp");
  if(!box) return;
  const d = micDiagnosis(err);
  box.innerHTML = "<b>" + esc(d.title) + "</b>" + d.steps.map(x=>"<p>" + x + "</p>").join("");
  box.hidden = false;
}
function hideMicHelp(){
  const box = document.getElementById("recHelp");
  if(box){ box.hidden = true; box.innerHTML = ""; }
}

function pickMime(){
  if(!window.MediaRecorder) return "";
  const types = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/wav"];
  if(typeof MediaRecorder.isTypeSupported !== "function") return "";
  for(let i=0;i<types.length;i++){ if(MediaRecorder.isTypeSupported(types[i])) return types[i]; }
  return "";
}

async function startRec(onDone){
  if(REC.active){ stopRec(); return true; }
  if(!navigator.mediaDevices || !window.MediaRecorder){
    showMicHelp({ name: location.protocol === "file:" ? "file" : "NotFoundError" });
    return false;
  }
  let stream, settled = false;
  const guard = setTimeout(()=>{
    if(!settled) showMicHelp({ name: location.protocol === "file:" ? "file" : "NotAllowedError" });
  }, 5000);
  const constraints = { audio: REC.deviceId ? { deviceId: { exact: REC.deviceId } } : true };
  try{ stream = await navigator.mediaDevices.getUserMedia(constraints); settled = true; clearTimeout(guard); }
  catch(e){
    settled = true; clearTimeout(guard);
    showMicHelp(e);
    toast("Microphone blocked — see the note for how to fix it.");
    return false;
  }
  hideMicHelp();
  try{
    const t0 = stream.getAudioTracks()[0];
    const st = (t0 && t0.getSettings) ? t0.getSettings() : {};
    if(st && st.deviceId) REC.deviceId = st.deviceId;
  }catch(e){}
  refreshDevices();
  const tracks = stream.getAudioTracks();
  if(!tracks.length){
    stream.getTracks().forEach(t=>t.stop());
    showMicHelp({ name:"NotFoundError" });
    toast("That device gave no audio track.");
    return false;
  }
  REC.chunks = []; REC.active = true;
  const mime = pickMime();
  let rec;
  try{ rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
  catch(err){ rec = new MediaRecorder(stream); }
  REC.rec = rec;
  rec.ondataavailable = e=>{ if(e.data && e.data.size) REC.chunks.push(e.data); };
  rec.onstop = async ()=>{
    REC.active = false;
    stream.getTracks().forEach(t=>t.stop());
    if(!REC.chunks.length){
      toast("Nothing was captured — check the microphone is not muted, then try again.");
      if(REC.onEmpty) REC.onEmpty();
      return;
    }
    const blob = new Blob(REC.chunks, { type: (rec.mimeType || "audio/webm") });
    if(blob.size < 200){
      toast("The recording came out empty — the microphone may be muted at system level.");
      if(REC.onEmpty) REC.onEmpty();
      return;
    }
    const uri = await blobToDataURI(blob);
    if(uri) await onDone(uri);
  };
  rec.start();
  toast("Recording… tap again to stop.");
  setTimeout(()=>{ if(rec.state === "recording") rec.stop(); }, 8000);
  return true;
}

/* play my take, then the reference voice, so the two sit back to back */
function compareMine(l, k){
  const text = l.phrases[k];
  const mine = mineFor(l.speech, text);
  if(!mine) return;
  const a = new Audio(mine);
  a.onended = ()=> setTimeout(()=>{
    const ref = refClip(l.speech, text);
    if(ref) playClip(ref, null); else speakDevice(text, l.speech, l.en, null);
  }, 420);
  a.play().catch(()=>{});
}

async function recordRow(l, k, btn){
  if(REC.active){ stopRec(); return; }
  btn.classList.add("rec");
  const ok = await startRec(async uri=>{
    btn.classList.remove("rec");
    hideMicHelp();
    await putClip("mine|" + l.speech + "|" + l.phrases[k], uri);
    document.querySelectorAll('.phrase[data-k="' + k + '"]').forEach(row=>{
      row.classList.add("mine");
      const pm = row.querySelector(".pm");
      if(pm) pm.disabled = false;
    });
    paintVoiceState();
    compareMine(l, k);
  });
  if(!ok){
    btn.classList.remove("rec");
    openRecorder(l.speech);
    showMicHelp({ name: location.protocol === "file:" ? "file" : "NotAllowedError" });
  }
}

/* ---------------- what voices does this machine have ---------------- */
function osHint(){
  const ua = navigator.userAgent || "";
  if(/Windows/i.test(ua)){
    return "<b>Windows:</b> Settings → Time &amp; Language → Language &amp; region → <b>Add a language</b> → e.g. Hindi (India), Gujarati or Marathi → tick the language pack including <b>Speech</b> → install, then restart the browser. Edge often picks these up where Chrome does not.";
  }
  if(/Mac OS X|Macintosh/i.test(ua)){
    return "<b>macOS:</b> System Settings → Accessibility → Spoken Content → <b>System Voice</b> → <b>Manage Voices</b> → tick the Indian voices (Lekha for Hindi, Milena for Marathi and so on), then reload this page.";
  }
  if(/Android/i.test(ua)){
    return "<b>Android:</b> Settings → System → Languages &amp; input → Text-to-speech output → Google TTS → <b>Install voice data</b>, then add each Indian language you need. Google's list includes Odia and Punjabi; Windows and macOS do not.";
  }
  return "<b>Linux:</b> install a speech engine with Indian voices, for example <code>sudo apt install espeak-ng</code>, and restart the browser.";
}

function paintVoiceCheck(){
  const box = document.getElementById("vcBody");
  const n = voices.length;
  let h = '<p class="vchint">' + (n
      ? n + ' voice' + (n === 1 ? '' : 's') + ' reported by this browser.'
      : 'This browser is reporting <b>no voices at all</b>. That is why nothing plays on this machine — it is not the app.') + '</p>';
  h += '<label class="vctoggle"><input type="checkbox" id="approxAll"' + (S.approxAll ? ' checked' : '') + '>'
     + '<span>Read languages that have no voice here using the nearest related voice — approximate, letters only</span></label>';
  h += '<div class="vclist">';
  LANGS.forEach(l=>{
    const v = getVoice(l.speech);
    h += '<div class="vcrow"><span class="vclang">' + esc(l.en) + '</span>'
       + '<span class="' + (v ? 'vcok' : 'vcno') + '">' + (v ? esc(v.name) : 'no voice') + '</span></div>';
  });
  h += '</div>';
  const missing = LANGS.filter(l=> !getVoice(l.speech)).length;
  if(missing){
    const or = LANGS.find(l=>l.speech === "or-IN"), pa = LANGS.find(l=>l.speech === "pa-IN");
    const orMissing = or && !getVoice(or.speech), paMissing = pa && !getVoice(pa.speech);
    h += '<div class="vcsteps">' + missing + ' of the 22 have no voice on this machine. ';
    if(orMissing || paMissing){
      h += '<br><br><b>Odia and Punjabi</b> are the two that Google ships on Android but Windows and macOS do not. '
         + 'On a phone they appear after Settings → Text-to-speech output → Google TTS → <b>install voice data</b>. '
         + 'On a desktop there is no such pack — for those two the realistic options are Sarvam\'s voice pack (it covers both) or your own recordings.';
    }
    h += '<br><br>' + osHint()
       + '<br><br>You can also skip system voices entirely: <b>Add a real voice</b> on the Listen tab records every phrase with a Sarvam key, and <b>Record my voice</b> keeps your own takes. Both play regardless of what the laptop has installed.</div>';
  }
  box.innerHTML = h;
  const cb = document.getElementById("approxAll");
  if(cb) cb.onchange = ()=>{
    S.approxAll = cb.checked; save();
    renderListen(); render();
    toast(cb.checked ? "Approximate reading on for languages without a voice." : "Approximate reading off.");
  };
}
function openVoiceCheck(){
  document.getElementById("vcModal").hidden = false;
  loadVoices();
  paintVoiceCheck();
  setTimeout(paintVoiceCheck, 500);
}
document.getElementById("vcClose").onclick = ()=> document.getElementById("vcModal").hidden = true;
document.getElementById("vcReload").onclick = ()=>{
  voices = [];
  loadVoices();
  paintVoiceCheck();
  setTimeout(()=>{ paintVoiceCheck(); toast(voices.length + " voices found."); }, 700);
};
document.getElementById("vcModal").addEventListener("click", e=>{
  if(e.target.id === "vcModal") e.currentTarget.hidden = true;
});

/* ---------------- microphone self test ---------------- */
async function micSelfTest(){
  const lines = [];
  const add = (ok, text)=> lines.push((ok ? "✓ " : "✗ ") + text);
  const paint = ()=>{
    const box = document.getElementById("recHelp");
    box.hidden = false;
    box.innerHTML = "<b>Microphone check</b><div class='micrep'>" +
      lines.map(x=> "<div class='" + (x.charAt(0) === "✓" ? "ok" : "no") + "'>" + esc(x) + "</div>").join("") +
      "</div>";
  };
  add(window.isSecureContext, "secure context: " + (window.isSecureContext ? "yes" : "no — page is " + location.protocol));
  add(!!navigator.mediaDevices, "navigator.mediaDevices present: " + (!!navigator.