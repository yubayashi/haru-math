/* ゲームふうの見た目と演出。ページの record() と showResult() を包むだけで、問題の中身・採点・送信は変えない */
(function () {
  if (typeof record !== 'function' || typeof tracking === 'undefined') return;
  document.body.classList.add('g');

  const lessonId = typeof LESSON_ID !== 'undefined' ? LESSON_ID : location.pathname.split('/').pop();
  const total = () => (typeof TOTAL_Q !== 'undefined' ? TOTAL_Q : Object.keys(tracking).length);
  const solved = () => Object.values(tracking).filter(t => t.correct);
  const coinsNow = () => solved().reduce((s, t) => s + (t.attempts === 1 ? 10 : 5), 0);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ---- 音 ---- */
  let soundOn = store.get('g-sound', true), ac = null;
  function tone(freqs, dur, type, vol) {
    if (!soundOn) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ac.currentTime;
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * dur;
        o.type = type || 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
      });
    } catch (e) {}
  }
  const sfx = {
    ok: () => tone([784, 1175], 0.09),
    ng: () => tone([220, 175], 0.11, 'square', 0.035),
    stage: () => tone([523, 659, 784, 1047], 0.09),
    clear: () => tone([523, 659, 784, 1047, 784, 1047, 1319], 0.12),
  };

  /* ---- 上のバー ---- */
  const hud = document.createElement('div');
  hud.className = 'g-hud';
  hud.innerHTML = '<div class="g-hud-in">' +
    '<span class="g-coinbox" id="g-coinbox">🪙 <b id="g-coins">0</b></span>' +
    '<div class="g-road"><div class="g-fill" id="g-fill"></div><span class="g-runner" id="g-runner">🏃</span><span class="g-goal">🏁</span></div>' +
    '<span>⭐ <b id="g-done">0</b>/' + total() + '</span>' +
    '<button class="g-snd" id="g-snd" title="おと">' + (soundOn ? '🔊' : '🔇') + '</button></div>';
  document.body.prepend(hud);
  document.getElementById('g-snd').onclick = function () {
    soundOn = !soundOn; store.set('g-sound', soundOn); this.textContent = soundOn ? '🔊' : '🔇';
  };
  function updateHud() {
    const n = solved().length, p = Math.min(100, Math.round(n / Math.max(1, total()) * 100));
    document.getElementById('g-coins').textContent = coinsNow();
    document.getElementById('g-done').textContent = n;
    document.getElementById('g-fill').style.width = p + '%';
    document.getElementById('g-runner').style.left = p + '%';
    const cb = document.getElementById('g-coinbox');
    cb.classList.remove('g-bump'); void cb.offsetWidth; cb.classList.add('g-bump');
  }

  /* ---- ステージの札 ---- */
  let stageNo = 0;
  document.querySelectorAll('.page > .card').forEach(card => {
    const tag = document.createElement('span');
    if (card.querySelector('.result-box')) { tag.className = 'g-stage goal'; tag.textContent = 'GOAL 🏁'; }
    else if (card.querySelector('.practice-q')) { tag.className = 'g-stage'; tag.textContent = 'STAGE ' + (++stageNo); }
    else { tag.className = 'g-stage hint'; tag.textContent = 'HINT 💡'; }
    card.prepend(tag);
    const title = card.querySelector('.card-title');
    if (title && title.textContent.indexOf('📚 ことば') === 0) title.textContent = title.textContent.replace('📚 ことば', '🎒 ことばアイテム');
  });
  const badge = document.querySelector('.header .badge');
  if (badge) badge.textContent = 'QUEST ・ ' + badge.textContent;

  /* ---- どの問題に答えたか ---- */
  let lastQ = null;
  ['click', 'keydown', 'input'].forEach(ev => document.addEventListener(ev, e => {
    const q = e.target.closest && e.target.closest('.practice-q');
    if (q) lastQ = q;
  }, true));
  function qOf(id) {
    const fb = document.getElementById(id + '-fb');
    return (fb && fb.closest('.practice-q')) || lastQ;
  }

  let lastSfx = 0;
  function play(fn) { const now = Date.now(); if (now - lastSfx > 150) { lastSfx = now; fn(); } }

  function onSolved(q, first) {
    if (!q) return;
    if (!first) q.dataset.gRetry = '1';
    const f = document.createElement('span');
    f.className = 'g-float'; f.textContent = '+' + (first ? 10 : 5) + '🪙';
    f.style.right = (14 + q.querySelectorAll('.g-float').length * 54) + 'px';
    q.appendChild(f); setTimeout(() => f.remove(), 950);
    play(sfx.ok);
    setTimeout(() => settle(q), 0);   // 1問に 入力が いくつも ある ときは、ぜんぶ 終わってから 判定
  }
  function settle(q) {
    if (q.classList.contains('g-cleared')) return;
    const ins = [...q.querySelectorAll('input[id]')].filter(i => tracking[i.id]);
    if (!ins.every(i => tracking[i.id].correct)) return;
    q.classList.add('g-cleared'); if (q.dataset.gRetry) q.classList.add('g-retry');
    const num = q.querySelector('.q-num'); if (num) num.textContent = '★';
    const card = q.closest('.card');
    if (card && !card.classList.contains('g-stage-clear')) {
      const qs = card.querySelectorAll('.practice-q');
      if (qs.length && [...qs].every(x => x.classList.contains('g-cleared'))) {
        card.classList.add('g-stage-clear'); setTimeout(sfx.stage, 200);
      }
    }
  }
  function onMissed(q) {
    if (!q) return;
    q.classList.remove('g-shake'); void q.offsetWidth; q.classList.add('g-shake');
    play(sfx.ng);
  }

  const origRecord = record;
  window.record = function (id, ok, detail) {
    const already = tracking[id] && tracking[id].correct;
    const r = origRecord(id, ok, detail);
    if (!already) {
      const t = tracking[id], q = qOf(id);
      if (ok && t && t.correct) onSolved(q, t.attempts === 1); else if (!ok) onMissed(q);
      updateHud();
    }
    return r;
  };

  /* ---- 合図のことばを ゲームふうに ---- */
  const YAY = ['ナイス！', 'Boa!', 'いいね！', 'やるね！', 'Fixe!'];
  new MutationObserver(ms => ms.forEach(m => {
    const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (!el || !el.classList || !el.classList.contains('feedback')) return;
    const s = el.textContent;
    if (s.indexOf('⭕ 正解！') === 0) el.textContent = '⭕ ' + YAY[Math.floor(Math.random() * YAY.length)] + s.slice(5);
    else if (s.indexOf('❌') === 0) el.textContent = '💥 おしい！ ' + s.slice(1).trim();
  })).observe(document.body, { subtree: true, childList: true, characterData: true });

  /* ---- ゴール ---- */
  if (typeof showResult === 'function') {
    const origShow = showResult;
    window.showResult = function () {
      origShow();
      const box = document.getElementById('result-box');
      if (!box) return;
      const msg = (document.getElementById('result-msg') || {}).textContent || '';
      const n = total(), first = solved().filter(t => t.attempts === 1).length, coins = coinsNow();
      const rank = first === n ? 'S' : first >= n * 0.8 ? 'A' : first >= n * 0.6 ? 'B' : 'C';
      const best = store.get('g-best', {});
      if (!best[lessonId] || best[lessonId] < coins) { best[lessonId] = coins; store.set('g-best', best); }
      const bank = Object.values(best).reduce((s, v) => s + v, 0);
      box.innerHTML = '<div class="g-clear-t">QUEST CLEAR!</div>' +
        '<div class="g-rank ' + rank + '">' + rank + '</div>' +
        '<div class="g-earn">🪙 ' + coins + ' ゲット ／ ⭐ 一発 ' + first + '/' + n + '</div>' +
        '<div class="msg">' + msg + '</div>' +
        '<div class="g-total">これまでに ためた コイン：🪙 ' + bank + '</div>';
      box.style.display = 'block';
      sfx.clear(); confetti();
    };
  }
  function confetti() {
    const colors = ['#ffcd3c', '#ff5c8a', '#5b8def', '#2ecc71', '#a06cd5', '#ff8a3d'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('div');
      c.className = 'g-conf';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      c.style.animationDelay = (Math.random() * 0.4) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }
  }

  updateHud();
})();
