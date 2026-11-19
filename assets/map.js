/* 知识图谱渲染器（零依赖）
 *
 * 节点是绝对定位的 DOM，连线是内联 SVG 三次贝塞尔曲线。
 * 不 fetch、不引外部库，因此在 file:// 下同样可用。
 *
 * 页面结构：
 *   <div class="mindmap">
 *     <script type="application/json" class="mm-data"> … </script>
 *   </div>
 *
 * 数据：
 *   cfg   { colW, colGap, rowGap, padX, padY, minColW }
 *   nodes [{ id, row, col, w, depth, title, desc, badge }]
 *   links [{ from, to, label, cls }]
 *
 * depth 0..4 → .d0..d4（左边框色）；links.cls 可覆盖连线色（d0 / d1）。
 * node.w 是跨列数，默认 1。
 */
(function () {
  'use strict';

  var DEF = {
    colW: 208, colGap: 36, rowGap: 26,
    padX: 12, padY: 18, minColW: 148
  };
  var SVGNS = 'http://www.w3.org/2000/svg';

  function num(v, d) {
    return (typeof v === 'number' && isFinite(v)) ? v : d;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    }
    return e;
  }

  function init(box) {
    var dataEl = box.querySelector('.mm-data');
    if (!dataEl) return;

    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

    var cfg = data.cfg || {};
    var colW0 = num(cfg.colW, DEF.colW);
    var colGap = num(cfg.colGap, DEF.colGap);
    var rowGap = num(cfg.rowGap, DEF.rowGap);
    var padX = num(cfg.padX, DEF.padX);
    var padY = num(cfg.padY, DEF.padY);
    var minColW = num(cfg.minColW, DEF.minColW);

    var canvas = document.createElement('div');
    canvas.className = 'mm-canvas';
    var svg = svgEl('svg', { 'class': 'mm-links' });
    canvas.appendChild(svg);
    box.appendChild(canvas);

    var items = [];
    var byId = {};
    var cols = 1;
    var maxRow = 0;

    (data.nodes || []).forEach(function (n, i) {
      var el = document.createElement('div');
      el.className = 'mm-node d' + num(n.depth, 1);
      var html = '<b>' + esc(n.title) + '</b>';
      if (n.desc) html += '<span>' + esc(n.desc) + '</span>';
      if (n.badge) html += '<i>' + esc(n.badge) + '</i>';
      el.innerHTML = html;
      canvas.appendChild(el);

      var it = {
        row: num(n.row, i),
        col: num(n.col, 0),
        span: Math.max(1, num(n.w, 1)),
        depth: num(n.depth, 1),
        el: el,
        x: 0, y: 0, w: 0, h: 0
      };
      if (n.id) byId[n.id] = it;
      items.push(it);
      cols = Math.max(cols, it.col + it.span);
      maxRow = Math.max(maxRow, it.row);
    });

    if (!items.length) return;

    var links = (data.links || []).map(function (l) {
      return { a: byId[l.from], b: byId[l.to], label: l.label, cls: l.cls };
    }).filter(function (l) { return l.a && l.b; });

    function layout() {
      // 1. 先定宽 —— 高度要在换行确定后才能量准
      var avail = box.clientWidth;
      var colW = colW0;
      if (avail > 0) {
        var fit = Math.floor((avail - padX * 2 - (cols - 1) * colGap) / cols);
        if (fit < colW) colW = Math.max(minColW, fit);
      }
      items.forEach(function (it) {
        it.w = it.span * colW + (it.span - 1) * colGap;
        it.el.style.width = it.w + 'px';
      });

      // 2. 每行取最高的那个节点当行高
      var rowH = [];
      items.forEach(function (it) {
        rowH[it.row] = Math.max(rowH[it.row] || 0, it.el.offsetHeight);
      });

      // 3. 行基线
      var rowY = [];
      var y = padY;
      for (var r = 0; r <= maxRow; r++) {
        rowH[r] = rowH[r] || 0;
        rowY[r] = y;
        y += rowH[r] + rowGap;
      }
      var totalH = y - rowGap + padY;

      // 4. 落位
      items.forEach(function (it) {
        it.x = padX + it.col * (colW + colGap);
        it.y = rowY[it.row];
        it.h = it.el.offsetHeight;
        it.el.style.left = it.x + 'px';
        it.el.style.top = it.y + 'px';
      });

      var totalW = padX * 2 + cols * colW + (cols - 1) * colGap;
      canvas.style.width = totalW + 'px';
      canvas.style.height = totalH + 'px';
      svg.setAttribute('width', totalW);
      svg.setAttribute('height', totalH);
      svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);

      drawLinks();
    }

    function drawLinks() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      links.forEach(function (l) {
        var A = l.a;
        var B = l.b;
        var acx = A.x + A.w / 2;
        var acy = A.y + A.h / 2;
        var bcx = B.x + B.w / 2;
        var bcy = B.y + B.h / 2;
        var dx = bcx - acx;
        var dy = bcy - acy;
        var horiz = Math.abs(dx) >= Math.abs(dy);
        var x1, y1, x2, y2, d;

        if (horiz) {
          if (dx >= 0) { x1 = A.x + A.w; x2 = B.x; }
          else { x1 = A.x; x2 = B.x + B.w; }
          y1 = acy;
          y2 = bcy;
          var kx = (x2 - x1) * 0.45;
          d = 'M' + x1 + ' ' + y1 +
              'C' + (x1 + kx) + ' ' + y1 + ' ' + (x2 - kx) + ' ' + y2 +
              ' ' + x2 + ' ' + y2;
        } else {
          if (dy >= 0) { y1 = A.y + A.h; y2 = B.y; }
          else { y1 = A.y; y2 = B.y + B.h; }
          x1 = acx;
          x2 = bcx;
          var ky = (y2 - y1) * 0.45;
          d = 'M' + x1 + ' ' + y1 +
              'C' + x1 + ' ' + (y1 + ky) + ' ' + x2 + ' ' + (y2 - ky) +
              ' ' + x2 + ' ' + y2;
        }

        var path = svgEl('path', { d: d });
        var ec = l.cls != null ? String(l.cls) : ('d' + B.depth);
        if (ec === 'd0') path.setAttribute('class', 'mm-edge-d0');
        else if (ec === 'd1') path.setAttribute('class', 'mm-edge-d1');
        svg.appendChild(path);

        if (!l.label) return;

        var pt = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        try {
          var len = path.getTotalLength();
          if (len) pt = path.getPointAtLength(len / 2);
        } catch (e) { /* 老浏览器没有这两个方法，退化到端点中点 */ }

        var t = svgEl('text', {
          x: horiz ? pt.x : pt.x + 7,
          y: horiz ? pt.y - 7 : pt.y,
          'text-anchor': horiz ? 'middle' : 'start',
          'dominant-baseline': 'middle'
        });
        t.textContent = l.label;
        svg.appendChild(t);
      });
    }

    var raf = 0;
    window.addEventListener('resize', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; layout(); });
    });

    // 字体加载会改变换行位置，加载完再排一次
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { layout(); });
    }

    layout();
  }

  function boot() {
    var boxes = document.querySelectorAll('.mindmap');
    for (var i = 0; i < boxes.length; i++) init(boxes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
