/* 共用脚本：导航、主题、进度 */
(function () {
  const NAV = [
    { href: 'index.html',            label: '首页',        key: 'home' },
    { href: 'pages/roadmap.html',    label: '岗位与路线',  key: 'roadmap' },
    { href: 'pages/kernel.html',     label: 'Linux 内核',  key: 'kernel' },
    { href: 'pages/gpu.html',        label: 'GPU / CUDA',  key: 'gpu' },
    { href: 'pages/virt.html',       label: '虚拟化',      key: 'virt' },
    { href: 'pages/net.html',        label: '计算机网络',  key: 'net' },
    { href: 'pages/cpp.html',        label: 'C / C++',     key: 'cpp' },
    { href: 'pages/python.html',     label: 'Python',      key: 'python' },
    { href: 'pages/sysdebug.html',   label: '调试与性能',  key: 'sysdebug' }
  ];

  // ---- 主题 ----
  // file:// 下部分浏览器会禁用 localStorage（访问即抛异常），统一包一层
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const root = document.documentElement;
  const saved = ls.get('ip-theme');
  if (saved) root.setAttribute('data-theme', saved);
  else if (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) {
    root.setAttribute('data-theme', 'light');
  }

  window.toggleTheme = function () {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    ls.set('ip-theme', next);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = next === 'light' ? '☾' : '☀';
  };

  // ---- 顶部导航 ----
  function renderTopbar() {
    const holder = document.getElementById('topbar');
    if (!holder) return;
    const active = document.body.dataset.page || '';
    const base = holder.dataset.base || '';
    const links = NAV.map(n =>
      `<a href="${base}${n.href}" class="${n.key === active ? 'active' : ''}">${n.label}</a>`
    ).join('');
    const isLight = root.getAttribute('data-theme') === 'light';
    holder.outerHTML = `
      <header class="topbar">
        <a class="brand" href="${base}index.html">
          <span class="brand-dot"></span>Interview&nbsp;Prep
        </a>
        <nav class="nav">
          ${links}
          <a href="${base}quiz/index.html" class="nav-quiz ${active === 'quiz' ? 'active' : ''}">刷题 →</a>
        </nav>
        <button class="icon-btn" id="theme-btn" onclick="toggleTheme()"
                title="切换主题">${isLight ? '☾' : '☀'}</button>
      </header>`;
  }

  // ---- 侧边目录（根据页面内 h2 自动生成） ----
  function renderToc() {
    const holder = document.getElementById('toc');
    if (!holder) return;
    const scope = document.querySelector('.content') || document.body;
    const heads = [...scope.querySelectorAll('h2[id], h3[id]')];
    if (!heads.length) { holder.style.display = 'none'; return; }
    const items = heads.map(h => {
      const lvl = h.tagName === 'H2' ? '' : ' style="padding-left:24px;font-size:12.5px"';
      return `<li><a href="#${h.id}"${lvl}>${h.dataset.toc || h.textContent}</a></li>`;
    }).join('');
    holder.innerHTML = `<h4>本页目录</h4><ul>${items}</ul>`;

    // 高亮当前小节
    const links = [...holder.querySelectorAll('a')];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-70px 0px -70% 0px' });
    heads.forEach(h => obs.observe(h));
  }

  // ---- 阅读进度 ----
  function progressBar() {
    const bar = document.getElementById('read-bar');
    if (!bar) return;
    const upd = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      bar.style.width = (total > 0 ? (h.scrollTop / total) * 100 : 0) + '%';
    };
    document.addEventListener('scroll', upd, { passive: true });
    upd();
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderTopbar();
    renderToc();
    progressBar();
  });
})();
