/* 刷题引擎：纯前端，无依赖。题库在 data/*.json */
(function () {
  'use strict';

  var LSK_WRONG = 'ip-wrong';      // 错题：["kernel:k-003", ...]
  var LSK_DONE  = 'ip-done';       // 已答过的题：{ "kernel:k-003": 1 }

  var el = {
    pills: document.getElementById('cat-pills'),
    body: document.getElementById('quiz-body'),
    bar: document.getElementById('qp-bar'),
    left: document.getElementById('qp-left'),
    right: document.getElementById('qp-right'),
    sub: document.getElementById('quiz-sub')
  };

  // 题库优先取 data/bundle.js 注入的全局对象。
  // 这样 file:// 直接双击打开也能用（fetch 在 file:// 下会被同源策略拦掉，
  // 但 <script src> 不受限制）。HTTP 环境下没有 bundle 时回退到 fetch。
  var BUNDLE = (typeof window !== 'undefined' && window.__QUIZ_DATA__) || null;

  var INDEX = null;        // 分类元数据
  var cache = {};          // catKey -> questions[]
  var state = null;        // 当前会话

  // ---------- 存储 ----------
  function readJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }
  function getWrong() { return readJSON(LSK_WRONG, []); }
  function markWrong(catKey, qid, isWrong) {
    var list = getWrong();
    var id = catKey + ':' + qid;
    var i = list.indexOf(id);
    if (isWrong && i < 0) list.push(id);
    if (!isWrong && i >= 0) list.splice(i, 1);
    writeJSON(LSK_WRONG, list);
  }
  function markDone(catKey, qid) {
    var d = readJSON(LSK_DONE, {});
    d[catKey + ':' + qid] = 1;
    writeJSON(LSK_DONE, d);
  }

  // ---------- 工具 ----------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // 反引号 → <code>，其余转义
  function fmt(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = r[i]; r[i] = r[j]; r[j] = t;
    }
    return r;
  }
  function levelTag(lv) {
    var map = { '高频': 'red', '中频': 'amber', '低频': 'blue' };
    return '<span class="tag ' + (map[lv] || 'blue') + '">' + esc(lv || '') + '</span>';
  }

  // ---------- 数据加载 ----------
  function loadCat(key) {
    if (cache[key]) return Promise.resolve(cache[key]);
    if (BUNDLE && BUNDLE.questions && BUNDLE.questions[key]) {
      cache[key] = BUNDLE.questions[key];
      return Promise.resolve(cache[key]);
    }
    var meta = INDEX.categories.filter(function (c) { return c.key === key; })[0];
    if (!meta) return Promise.resolve([]);
    return fetch('data/' + meta.file).then(function (r) {
      if (!r.ok) throw new Error(meta.file + ' ' + r.status);
      return r.json();
    }).then(function (d) {
      cache[key] = d.questions || [];
      return cache[key];
    });
  }

  function getIndex() {
    if (BUNDLE && BUNDLE.categories) return Promise.resolve(BUNDLE);
    return fetch('data/index.json').then(function (r) {
      if (!r.ok) throw new Error('index.json ' + r.status);
      return r.json();
    });
  }

  function loadAll() {
    return Promise.all(INDEX.categories.map(function (c) { return loadCat(c.key); }));
  }

  // ---------- 分类药丸 ----------
  function renderPills(activeKey) {
    var html = INDEX.categories.map(function (c) {
      return '<button class="pill' + (c.key === activeKey ? ' active' : '') +
             '" data-cat="' + esc(c.key) + '">' + esc(c.name) +
             ' <span style="opacity:.6">' + c.count + '</span></button>';
    }).join('');
    var wrongN = getWrong().length;
    html += '<button class="pill' + (activeKey === '__wrong' ? ' active' : '') +
            '" data-cat="__wrong">错题本 <span style="opacity:.6">' + wrongN + '</span></button>';
    el.pills.innerHTML = html;
  }

  // ---------- 会话 ----------
  function startSession(key, questions, title, subtitle, chooseCat) {
    state = {
      key: key,
      title: title,
      questions: questions,
      i: 0,
      answers: new Array(questions.length).fill(null),  // 选中的下标
      locked: new Array(questions.length).fill(false),
      reveal: new Array(questions.length).fill(false),  // 未作答时先看解析
      chooseCat: chooseCat || null,
      finished: false
    };
    el.sub.textContent = subtitle || '';
    renderPills(key);
    render();
  }

  function correctCount() {
    var n = 0;
    for (var k = 0; k < state.questions.length; k++) {
      if (state.locked[k] && state.answers[k] === state.questions[k].a) n++;
    }
    return n;
  }
  function answeredCount() {
    return state.locked.filter(Boolean).length;
  }
  // 已作答或已看过解析，都算「这道题过掉了」
  function passedCount() {
    var n = 0;
    for (var k = 0; k < state.questions.length; k++) {
      if (state.locked[k] || state.reveal[k]) n++;
    }
    return n;
  }

  function updateProgress() {
    var total = state.questions.length;
    var done = answeredCount();
    var pct = total ? (done / total) * 100 : 0;
    el.bar.style.width = pct + '%';
    el.left.textContent = '第 ' + (state.i + 1) + ' / ' + total + ' 题';
    el.right.textContent = '已答 ' + done + ' 题 · 正确 ' + correctCount();
  }

  // ---------- 渲染 ----------
  function render() {
    if (state.finished) return renderResult();
    var q = state.questions[state.i];
    var chosen = state.answers[state.i];
    var locked = state.locked[state.i];
    var revealed = state.reveal[state.i];
    var show = locked || revealed;
    var keys = ['A', 'B', 'C', 'D', 'E', 'F'];

    var opts = q.opts.map(function (text, idx) {
      var cls = 'opt';
      if (show) {
        cls += ' locked';
        if (idx === q.a) cls += ' correct';
        else if (locked && idx === chosen) cls += ' wrong';
        else cls += ' dimmed';
      }
      return '<div class="' + cls + '" data-idx="' + idx + '">' +
               '<span class="key">' + keys[idx] + '</span><span>' + fmt(text) + '</span>' +
             '</div>';
    }).join('');

    var explain = '';
    if (show) {
      var head;
      if (locked) head = chosen === q.a ? '✓ 正确' : '✗ 正确答案是 ' + keys[q.a];
      else head = '正确答案是 ' + keys[q.a] + '（已跳过作答）';
      explain = '<div class="explain"><b>' + head + '</b>' +
                '<div style="margin-top:8px">' + fmt(q.exp || '') + '</div></div>';
    }

    var isLast = state.i === state.questions.length - 1;
    var nextLabel = isLast ? '看结果 →' : '下一题 →';
    var nextDisabled = show ? '' : ' disabled style="opacity:.35;pointer-events:none"';

    el.body.innerHTML =
      '<div class="qcard">' +
        '<div class="q-head">' +
          '<span>' + esc(state.title) + '</span>' +
          '<span style="color:var(--border)">|</span>' +
          levelTag(q.level) +
          (q.tags && q.tags.length ? '<span style="opacity:.7">' + q.tags.map(esc).join(' · ') + '</span>' : '') +
        '</div>' +
        '<p class="q-text">' + fmt(q.q) + '</p>' +
        opts + explain +
        '<div class="qnav">' +
          '<button class="btn btn-ghost" data-nav="prev"' + (state.i === 0 ? ' disabled style="opacity:.35;pointer-events:none"' : '') + '>← 上一题</button>' +
          '<button class="btn btn-ghost" data-act="reveal"' + (show ? ' style="display:none"' : '') + '>看解析</button>' +
          '<button class="btn btn-primary" data-nav="next"' + nextDisabled + '>' + nextLabel + '</button>' +
        '</div>' +
      '</div>' +
      renderSheet();

    updateProgress();
    bindCard();
  }

  function renderSheet() {
    var btns = state.questions.map(function (q, idx) {
      var cls = '';
      if (state.locked[idx]) cls = state.answers[idx] === q.a ? 'ok' : 'bad';
      else if (state.reveal[idx]) cls = 'skip';
      if (idx === state.i) cls += ' cur';
      return '<button class="' + cls + '" data-jump="' + idx + '" title="第 ' + (idx + 1) + ' 题">' + (idx + 1) + '</button>';
    }).join('');
    return '<div style="margin-top:22px"><div style="font-size:12px;color:var(--text-faint);margin-bottom:2px">答题卡</div>' +
           '<div class="sheet">' + btns + '</div></div>';
  }

  function bindCard() {
    var opts = el.body.querySelectorAll('.opt');
    for (var k = 0; k < opts.length; k++) {
      opts[k].addEventListener('click', function () {
        choose(parseInt(this.getAttribute('data-idx'), 10));
      });
    }
    var nav = el.body.querySelectorAll('[data-nav]');
    for (var m = 0; m < nav.length; m++) {
      nav[m].addEventListener('click', function () {
        if (this.getAttribute('data-nav') === 'prev') go(-1); else go(1);
      });
    }
    var rev = el.body.querySelector('[data-act="reveal"]');
    if (rev) rev.addEventListener('click', function () {
      if (state.locked[state.i]) return;
      state.reveal[state.i] = true;
      render();
    });
    var jumps = el.body.querySelectorAll('[data-jump]');
    for (var n = 0; n < jumps.length; n++) {
      jumps[n].addEventListener('click', function () {
        state.i = parseInt(this.getAttribute('data-jump'), 10);
        render();
      });
    }
  }

  function choose(idx) {
    if (state.locked[state.i]) return;
    var q = state.questions[state.i];
    var cat = state.chooseCat ? state.chooseCat(state.i) : state.key;
    state.answers[state.i] = idx;
    state.locked[state.i] = true;
    markWrong(cat, q.id, idx !== q.a);
    markDone(cat, q.id);
    render();
  }

  function go(delta) {
    var next = state.i + delta;
    if (next < 0) return;
    if (next >= state.questions.length) {
      if (passedCount() === state.questions.length) { state.finished = true; render(); }
      return;
    }
    state.i = next;
    render();
  }

  function renderResult() {
    var total = state.questions.length;
    var right = correctCount();
    var skipped = 0;
    for (var s = 0; s < total; s++) {
      if (!state.locked[s] && state.reveal[s]) skipped++;
    }
    var pct = total ? Math.round((right / total) * 100) : 0;
    var color = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)';
    var verdict = pct >= 85 ? '这个专题可以过了，只看错题即可。'
               : pct >= 60 ? '基本盘有了，把错题和解析再过一遍。'
               : '这块还比较薄，建议先回去读对应专题，再刷一次。';

    var wrongList = state.questions.filter(function (q, i) {
      return state.locked[i] && state.answers[i] !== q.a;
    });
    var skippedList = state.questions.filter(function (q, i) {
      return !state.locked[i] && state.reveal[i];
    });

    el.bar.style.width = '100%';
    el.left.textContent = '已完成';
    el.right.textContent = right + ' / ' + total;

    function reviewItem(q, tagHtml) {
      return '<details class="qa"><summary>' + tagHtml + fmt(q.q) + '</summary>' +
             '<div style="margin-top:10px;font-size:14px">' +
             '<div style="color:var(--green)">正确答案：' + ['A','B','C','D','E','F'][q.a] + '. ' + fmt(q.opts[q.a]) + '</div>' +
             '<div style="margin-top:8px;color:var(--text-dim)">' + fmt(q.exp || '') + '</div></div></details>';
    }

    var review = '';
    if (wrongList.length || skippedList.length) {
      review = '<div style="margin-top:34px"><div class="sec-head" style="margin-top:0"><h2 style="font-size:16px">需要复盘的题</h2></div>';
      review += wrongList.map(function (q) {
        return reviewItem(q, '<span class="tag red" style="margin-right:6px">答错</span>');
      }).join('');
      review += skippedList.map(function (q) {
        return reviewItem(q, '<span class="tag amber" style="margin-right:6px">看了解析</span>');
      }).join('');
      review += '</div>';
    } else {
      review = '<div class="box ok" style="margin-top:30px"><span class="box-title">全对</span>这套题没有错题，换个专题继续。</div>';
    }

    el.body.innerHTML =
      '<div class="qcard">' +
        '<div class="result-hero">' +
          '<div class="result-score" style="color:' + color + '">' + pct + '<small>%</small></div>' +
          '<div class="result-sub">' + esc(state.title) + ' · 答对 ' + right + ' / ' + total + ' 题</div>' +
          '<div class="breakdown">' +
            '<div><b style="color:var(--green)">' + right + '</b><span>正确</span></div>' +
            '<div><b style="color:var(--red)">' + wrongList.length + '</b><span>错误</span></div>' +
            (skipped ? '<div><b style="color:var(--amber)">' + skipped + '</b><span>看解析</span></div>' : '') +
            '<div><b>' + total + '</b><span>总题数</span></div>' +
          '</div>' +
          '<p style="color:var(--text-dim);margin-top:14px">' + verdict + '</p>' +
          '<div style="display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap">' +
            '<button class="btn btn-primary" data-act="again">再刷一遍</button>' +
            '<button class="btn btn-ghost" data-act="retry-wrong"' + (wrongList.length ? '' : ' disabled style="opacity:.4;pointer-events:none"') + '>只刷错题</button>' +
            '<a class="btn btn-ghost" href="../index.html">回首页</a>' +
          '</div>' +
        '</div>' +
      '</div>' + review;

    el.body.querySelector('[data-act="again"]').addEventListener('click', function () {
      startSession(state.key, shuffle(state.questions), state.title, el.sub.textContent, state.chooseCat);
    });
    el.body.querySelector('[data-act="retry-wrong"]').addEventListener('click', function () {
      if (!wrongList.length) return;
      startSession(state.key, shuffle(wrongList), state.title + ' · 错题',
                   '只包含本次答错的题。', state.chooseCat);
    });
  }

  // ---------- 入口 ----------
  function boot() {
    getIndex().then(function (idx) {
      INDEX = idx;
      var want = null;
      try { want = new URLSearchParams(location.search).get('cat'); } catch (e) {}

      el.pills.addEventListener('click', function (e) {
        var btn = e.target.closest('.pill');
        if (!btn) return;
        var key = btn.getAttribute('data-cat');
        // file:// 下部分浏览器会对 replaceState 抛 SecurityError，忽略即可
        try {
          history.replaceState(null, '', key === '__wrong' ? '?' : '?cat=' + encodeURIComponent(key));
        } catch (e) {}
        open(key);
      });

      if (want && want !== '__wrong') open(want); else open('__wrong');
    }).catch(function (err) {
      el.body.innerHTML = '<div class="empty">题库加载失败：' + esc(err.message) +
        '<br><br>请确认 <code>quiz/data/bundle.js</code> 存在。' +
        '如果刚改过题库，在 interview-prep 目录下执行 <code>python3 build-bundle.py</code> 重新生成。</div>';
    });
  }

  function open(key) {
    if (key === '__wrong') {
      return loadAll().then(function () {
        var wrong = getWrong();
        var qs = [];
        INDEX.categories.forEach(function (c) {
          (cache[c.key] || []).forEach(function (q) {
            if (wrong.indexOf(c.key + ':' + q.id) >= 0) {
              qs.push(Object.assign({}, q, { _cat: c.key }));
            }
          });
        });
        if (!qs.length) {
          state = null;
          renderPills('__wrong');
          el.body.innerHTML = '<div class="empty">错题本是空的。<br>先去刷一个专题，答错的题会自动收进来。</div>';
          el.bar.style.width = '0'; el.left.textContent = '—'; el.right.textContent = '';
          el.sub.textContent = '答错的题会自动收集到这里，可以反复重做。';
          return;
        }
        state = {
          key: '__wrong', questions: qs, i: 0,
          answers: new Array(qs.length).fill(null),
          locked: new Array(qs.length).fill(false),
          reveal: new Array(qs.length).fill(false),
          chooseCat: function (idx) { return qs[idx]._cat; },  // 跨分类时按题所属分类记账
          finished: false
        };
        el.sub.textContent = '来自所有专题的错题，共 ' + qs.length + ' 道。';
        renderPills('__wrong');
        render();
      });
    }

    var meta = INDEX.categories.filter(function (c) { return c.key === key; })[0];
    if (!meta) {
      el.body.innerHTML = '<div class="empty">没有这个分类：' + esc(key) + '</div>';
      return;
    }
    el.body.innerHTML = '<div class="empty">正在加载…</div>';
    loadCat(key).then(function (qs) {
      if (!qs.length) {
        el.body.innerHTML = '<div class="empty">这个分类还没有题目。</div>';
        return;
      }
      startSession(key, shuffle(qs), meta.name, meta.desc || '');
    });
  }

  // 键盘
  document.addEventListener('keydown', function (e) {
    if (!state || state.finished) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var k = e.key.toUpperCase();
    var map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5,
                'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5 };
    if (k in map) {
      var n = state.questions[state.i].opts.length;
      if (map[k] < n) { e.preventDefault(); choose(map[k]); }
    } else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1); }
  });

  boot();
})();
