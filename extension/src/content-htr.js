/* htreviews.org 页面上运行：读你正在看的这一页 + 标出库存里有的料。
   不翻页、不点「加载更多」、不发任何额外请求。 */
(function () {
  /* 扩展更新后会往已开着的页面再注入一份新脚本。用页面上的记号认「现在是谁」：
     旧的那份发现自己不是最新的就彻底闭嘴（不响应 N、不画条、不报断开），新的接手，不用刷新页面。 */
  var ME = String(Math.random());
  Array.prototype.forEach.call(document.querySelectorAll('.shz-bar,.shz-chip'), function (n) { n.remove(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-shz]'), function (a) { delete a.dataset.shz; });
  document.documentElement.dataset.shzInst = ME;
  function mine() { return document.documentElement.dataset.shzInst === ME; }
  var M = self.ShizukuMatch;
  var inv = [], settings = {};

  function segs(u) {
    try { return new URL(u, location.href).pathname.split('/').filter(Boolean).map(decodeURIComponent); }
    catch (e) { return []; }
  }
  /* /tobaccos/<品牌> 或 /tobaccos/<品牌>/<系列>：上面列着这个品牌的烟料，读下来给 Cellar 配网址 */
  function isBrandOrLine(u) { var s = segs(u); return s[0] === 'tobaccos' && (s.length === 2 || s.length === 3) && !/^(new|top|search|page)$/.test(s[1]); }
  function isItem(u) { var s = segs(u); return s[0] === 'tobaccos' && s.length >= 4 && !/^(new|top|search|page)$/.test(s[1]); }
  function slugName(s) { return String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function clean(u) { try { var x = new URL(u, location.href); return x.origin + x.pathname.replace(/\/+$/, ''); } catch (e) { return u; } }

  /* ── 从 Cellar 跳过来：地址里带 #shizuku-q=…&shizuku-sid=… ──
     记住「这个标签页是来找哪一款的」，之后在这个标签页里收录的烟料页直接对应到那一款。 */
  var TKEY = 'shizuku-target';
  function target() {
    try { var t = JSON.parse(sessionStorage.getItem(TKEY) || 'null'); return t && Date.now() - t.at < 30 * 60e3 ? t : null; }
    catch (e) { return null; }
  }
  /* 候选清单打开的页（#shizuku-cand）：收录结果回到 Cellar 的候选清单，不进待确认、不配库存 */
  var CKEY = 'shizuku-cand';
  function isCand() { try { return sessionStorage.getItem(CKEY) === clean(location.href); } catch (e) { return false; } }
  function takeHash() {
    var h = new URLSearchParams(location.hash.slice(1)), q = h.get('shizuku-q'), sid = h.get('shizuku-sid');
    if (h.has('shizuku-cand')) {
      try { sessionStorage.setItem(CKEY, clean(location.href)); } catch (e) {}
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    if (!q && !sid) return;
    try { sessionStorage.setItem(TKEY, JSON.stringify({ sid: sid ? +sid : null, q: q || '', at: Date.now() })); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search);   // 把参数从地址栏去掉
    if (q) fillSearch(q, 0);
  }
  function fillSearch(q, tries) {
    // 网站首页的搜索框是 input.search_text；找不到就退回到任何搜索类输入框
    var inp = document.querySelector('input.search_text') || document.querySelector('input[type=search]') ||
      document.querySelector('input[placeholder*="табак" i],input[placeholder*="поиск" i]');
    if (!inp) { if (tries < 10) setTimeout(function () { fillSearch(q, tries + 1); }, 300); else searchHint(q); return; }
    var wrap = inp.closest('[data-open]'); if (wrap) wrap.setAttribute('data-open', '1');
    // 不把光标放进搜索框：否则接着按 N 会变成往框里打字
    var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;   // 让页面自己的脚本也能察觉到变化
    set.call(inp, q);
    ['input', 'keyup', 'change'].forEach(function (t) { inp.dispatchEvent(new Event(t, { bubbles: true })); });
    searchHint(q);
  }
  function searchHint(q) {
    var t = target(), who = t && t.sid ? inv.find(function (r) { return r.sid === t.sid; }) : null;
    var b = document.createElement('div'); b.className = 'shz-bar shz-top';
    var s = document.createElement('span');
    s.textContent = '正在找：' + (who ? who.brand + ' · ' + who.name + (who.sub ? '（' + who.sub + '）' : '') : q) + '　点进它的页面会自动对应到这一款';
    b.appendChild(s);
    var c = document.createElement('button'); c.textContent = '复制搜索词';
    c.onclick = function () { navigator.clipboard.writeText(q).then(function () { c.textContent = '已复制'; }); };
    b.appendChild(c);
    b.appendChild(nextBtn());
    var x = document.createElement('button'); x.textContent = '×'; x.onclick = function () { b.remove(); };
    b.appendChild(x);
    document.body.appendChild(b);
  }

  /* ── 一键下一款（按 N 或点「下一款 →」）──
     下一款由 Cellar 同步过来的库存名单算：跳过已收录 / 待确认 / 标了「没有」的（done），
     12 小时内按 N 去过的也先跳过；从品牌页配到网址的（link）优先，直接打开那一页。
     每一页都是你按键才打开的，扩展不会自己往下翻。 */
  function cmp(a, b) { return (a.brand || '').localeCompare(b.brand || '') || (a.name || '').localeCompare(b.name || ''); }
  /* 没配上网址的料：不再用英文名搜（俄罗斯品牌的口味名多半只有俄文，网站搜不到），而是打开它的品牌页；
     品牌页读到烟料列表后，后台会让 Claude 把这个品牌还没对上的料逐个对应，下次按 N 就能直达。
     品牌页地址从同品牌已收录 / 已配上的料的网址推出来；推不出来就只用品牌名搜。 */
  function brandSlugOf(b) {
    for (var i = 0; i < inv.length; i++) {
      var r = inv[i]; if (r.brand !== b) continue;
      var m = /\/tobaccos\/([^\/#?]+)/.exec(r.url || r.link || ''); if (m) return m[1];
    }
    return '';
  }
  function urlFor(r) {
    if (r.link) return r.link + '#shizuku-sid=' + r.sid;
    var s = brandSlugOf(r.brand);
    if (s) return location.origin + '/tobaccos/' + s;   // 品牌页不带 sid：在这页点进别的料时不能硬套成这一款
    return location.origin + '/#shizuku-q=' + encodeURIComponent(r.brand);
  }
  /* 扩展被刷新 / 更新后，已经开着的页面里这份脚本就断开了，调用 chrome.* 会直接抛错。
     以前这种情况什么都不显示，看起来像「按了没反应」；现在明确告诉你刷新这一页。 */
  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  /* 扩展后台闲置 30 秒会休眠，叫醒的那一下偶尔会丢消息（lastError）。扩展还在就隔一会儿重发，最多 3 次 */
  function msg(m, cb, tries) {
    tries = tries || 0;
    if (!alive()) { deadNotice(); return; }
    try {
      chrome.runtime.sendMessage(m, function (r) {
        if (chrome.runtime.lastError) {
          if (alive() && tries < 3) setTimeout(function () { msg(m, cb, tries + 1); }, 800 * (tries + 1));
          else if (alive()) flash('扩展没响应（' + chrome.runtime.lastError.message + '），再按一次试试');
          else deadNotice();
          return;
        }
        if (cb) cb(r);
      });
    } catch (e) { if (!alive()) deadNotice(); }
  }
  function deadNotice() {
    if (!mine()) return;
    var b = document.createElement('div'); b.className = 'shz-bar shz-top'; b.style.background = '#b3261e';
    b.textContent = 'Shizuku 扩展刚更新过，这个页面里的旧连接断了：按 F5 刷新这一页再按 N';
    document.body.appendChild(b); setTimeout(function () { b.remove(); }, 8000);
  }
  function goNext() {
    if (!alive()) { deadNotice(); return; }
    try { goNext2(); } catch (e) { if (!alive()) deadNotice(); else flash('下一款出错：' + e.message); }
  }
  function goNext2() {
    chrome.storage.local.get(['visited', 'visitedBrand', 'lastSid'], function (o) {
      // visited：按 N 直达打开过的；visitedBrand：为它开过品牌页的（等它配上网址后可以再给，配不上就先跳过）
      var vis = o.visited || {}, visB = o.visitedBrand || {}, now = Date.now(), cur = target();
      [vis, visB].forEach(function (m) { for (var k in m) if (now - m[k] > 12 * 3600e3) delete m[k]; });
      var todo = inv.filter(function (r) {
        return !r.done && !r.url && !vis[r.sid] && !(visB[r.sid] && !r.link) && !(cur && cur.sid === r.sid);
      }).sort(cmp);
      if (!todo.length) { alert(inv.length ? 'Shizuku：全部扫完了 ✓（没配上网址的，去它的品牌 / 系列页逛一下再按 N）' : 'Shizuku：还没同步库存，先打开一次 Cellar'); return; }
      var last = inv.find(function (r) { return r.sid === o.lastSid; });
      // 一次开几款（设置里定，最多 5）。没网址的同品牌料共用一个品牌页，不重复开
      var want = Math.max(1, Math.min(5, +(settings.nextCount || 3))), urls = [], names = [];
      var after = function (list) { return last ? list.find(function (r) { return cmp(r, last) > 0; }) : list[0]; };
      while (urls.length < want && todo.length) {
        var linked = todo.filter(function (r) { return r.link; });
        var r = after(linked) || linked[0] || after(todo) || todo[0];
        last = r; todo = todo.filter(function (x) { return x !== r; });
        var u = urlFor(r);
        if (r.link) { vis[r.sid] = now; urls.push(u); names.push(r.name); continue; }
        // 品牌页：同品牌没网址的一并记上，这一批里不再重复开
        inv.forEach(function (x) { if (x.brand === r.brand && !x.done && !x.url && !x.link) visB[x.sid] = now; });
        todo = todo.filter(function (x) { return x.brand !== r.brand || x.link; });
        if (urls.indexOf(u) < 0) { urls.push(u); names.push(r.brand + ' 品牌页'); }
      }
      chrome.storage.local.set({ visited: vis, visitedBrand: visB, lastSid: last.sid }, function () {
        if (settings.nextNewTab === false) { location.href = urls[0]; return; }
        msg({ type: 'open-tabs', urls: urls }, function (res) {
          if (!res || res.error) { flash('没能打开新标签页：' + ((res && res.error) || '扩展没响应')); return; }
          flash('已在后台打开 ' + res.n + ' 个：' + names.join('、'));
        });
      });
    });
  }
  function flash(msg) {
    var n = document.createElement('div'); n.className = 'shz-bar shz-top'; n.textContent = msg;
    document.body.appendChild(n); setTimeout(function () { n.remove(); }, 3000);
  }
  function nextBtn() { var b = document.createElement('button'); b.textContent = '下一款 → (N)'; b.onclick = function () { if (mine()) goNext(); }; return b; }
  document.addEventListener('keydown', function (e) {
    if (!mine() || (e.key !== 'n' && e.key !== 'N') || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) {   // 在打字时不算
      if (!t.dataset.shzHint) { t.dataset.shzHint = '1'; flash('光标在输入框里，N 会被当成打字。点一下页面空白处再按 N'); }
      return;
    }
    e.preventDefault(); goNext();
  }, true);

  /* ── 读当前页 ── */
  function capture() {
    var d = document, A = Array.prototype.slice;
    var meta = {};
    A.call(d.querySelectorAll('meta[name],meta[property]')).forEach(function (m) { meta[m.getAttribute('name') || m.getAttribute('property')] = m.content; });
    var ld = A.call(d.querySelectorAll('script[type="application/ld+json"]')).map(function (s) { try { return JSON.parse(s.textContent); } catch (e) { return null; } }).filter(Boolean);
    var h1 = d.querySelector('h1');
    var s = segs(location.href);
    // 上级链接 = 面包屑，品牌名直接从这里拿，比 slug 准
    var path = new URL(location.href).pathname.replace(/\/+$/, ''), anc = [];
    A.call(d.querySelectorAll('a[href]')).forEach(function (a) {
      var p; try { p = new URL(a.href).pathname.replace(/\/+$/, ''); } catch (e) { return; }
      if (p !== path && path.indexOf(p + '/') === 0 && /^\/tobaccos\/./.test(p)) anc.push({ p: p, t: (a.innerText || '').trim() });
    });
    anc.sort(function (a, b) { return a.p.length - b.p.length; });
    var images = [];
    A.call(d.images).forEach(function (im) {
      var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      if (!im.currentSrc && !im.src) return;
      if (w < 100 || h < 100 || images.length >= 30) return;
      images.push({ src: im.currentSrc || im.src, alt: (im.alt || '').slice(0, 120), w: w, h: h });
    });
    if (meta['og:image'] && !images.some(function (m) { return m.src === meta['og:image']; }))
      images.unshift({ src: meta['og:image'], alt: 'og:image', w: 0, h: 0 });
    var root = d.querySelector('main') || d.body;
    var tg = target();
    return {
      targetSid: tg ? tg.sid : null,
      url: clean(location.href), title: d.title, h1: h1 ? h1.innerText.trim() : '', meta: meta, ld: ld,
      guessBrand: (anc[0] && anc[0].t) || slugName(s[1]), guessLine: (anc[1] && anc[1].t) || '', guessName: slugName(s[s.length - 1]),
      images: images, text: (root.innerText || '').slice(0, 150000), at: new Date().toISOString()
    };
  }

  function listItems() {
    var byU = {}, out = [];
    Array.prototype.slice.call(document.querySelectorAll('a[href]')).forEach(function (a) {
      if (!isItem(a.href)) return;
      var u = clean(a.href), s = segs(u), t = (a.innerText || '').replace(/\s+/g, ' ').trim();
      var it = byU[u];
      if (!it) { it = byU[u] = { u: u, n: '', b: slugName(s[1]), r: null }; out.push(it); }
      if (t.length > it.n.length && t.length < 120) it.n = t;
      if (it.r == null) {
        var row = a.closest('li,tr,article,[class*=item],[class*=card],[class*=row]');
        var m = row && (row.innerText || '').match(/(?:^|\s)(\d[.,]\d{1,2})(?=\s|$)/);
        if (m) it.r = parseFloat(m[1].replace(',', '.'));
      }
    });
    out.forEach(function (it) { if (!it.n) it.n = slugName(segs(it.u).pop()); });
    return out;
  }
  function listInfo() {
    var p = location.pathname, h1 = document.querySelector('h1');
    return {
      url: clean(location.href),
      title: ((h1 && h1.innerText) || document.title || p).trim().slice(0, 80),
      kind: /\/new\b/.test(p) ? 'new' : /hall-of-fame/.test(p) ? 'fame' : /^\/reviews/.test(p) ? 'reviews'
        : isBrandOrLine(location.href) ? (segs(location.href).length === 2 ? 'brand' : 'line') : /^\/tobaccos/.test(p) ? 'rating' : 'other',
      at: new Date().toISOString(), items: listItems()
    };
  }

  /* ── 库存标注 ── */
  function own(brand, name, url) {
    for (var i = 0; i < inv.length; i++) if (inv[i].url && inv[i].url === url) return { r: inv[i], s: 1 };
    var b = M.best(inv, brand, name);
    return b && b.s >= 0.82 ? b : null;
  }
  function chip(text, cls, title) {
    var c = document.createElement('span');
    c.className = 'shz-chip ' + (cls || ''); c.textContent = text; if (title) c.title = title;
    return c;
  }
  function markLinks() {
    if (!inv.length) return;
    Array.prototype.slice.call(document.querySelectorAll('a[href]')).forEach(function (a) {
      if (a.dataset.shz || !isItem(a.href) || !(a.innerText || '').trim()) return;
      a.dataset.shz = '1';
      var s = segs(a.href), o = own(slugName(s[1]), a.innerText.trim(), clean(a.href));
      if (o) a.appendChild(chip('✓ 有' + (o.r.loc ? ' ' + o.r.loc : ''), 'own', o.r.brand + ' · ' + o.r.name));
    });
  }
  var bar = null;
  function itemBar(state) {
    if (!isItem(location.href)) { if (bar && !isBrandOrLine(location.href)) { bar.remove(); bar = null; } return; }
    var cap = { b: '', n: '' }, h1 = document.querySelector('h1'), s = segs(location.href);
    cap.n = h1 ? h1.innerText.trim() : slugName(s[s.length - 1]); cap.b = slugName(s[1]);
    var tg = target(), o = null;
    if (tg && tg.sid) {
      var tr = inv.find(function (r) { return r.sid === tg.sid; });
      // 品牌对不上：这一页不是来找的那款（搜完又点进了别的），丢掉这个目标
      if (tr && !M.brandScore(tr.brand, cap.b)) { try { sessionStorage.removeItem(TKEY); } catch (e) {} tr = null; }
      if (tr) o = { r: tr, s: 1, target: true };
    }
    if (!o && inv.length) o = own(cap.b, cap.n, clean(location.href));
    if (!bar) { bar = document.createElement('div'); bar.className = 'shz-bar'; document.body.appendChild(bar); }
    bar.innerHTML = '';
    var t = document.createElement('b'); t.textContent = 'Shizuku'; bar.appendChild(t);
    if (!inv.length) bar.appendChild(chip('先打开一次 Cellar 同步库存', 'warn'));
    else if (o) bar.appendChild(chip((o.target ? '→ 对应到：' : '✓ 你有：') + o.r.brand + ' · ' + o.r.name + (o.r.loc ? ' · ' + o.r.loc : ''), 'own',
      o.target ? '从 Cellar 跳过来找的这一款；如果这页不是它，点「不是这款」' : ''));
    if (o && o.target) {
      var nb = document.createElement('button'); nb.textContent = '不是这款';
      nb.onclick = function () { try { sessionStorage.removeItem(TKEY); } catch (e) {} refresh(); };
      bar.appendChild(nb);
    }
    else bar.appendChild(chip('库存里没有', 'none'));
    var st = { queued: '排队中…', processing: 'Claude 处理中…', done: '已收录 ✓', error: '出错：' }[state && state.status] || '';
    if (st) bar.appendChild(chip(st + (state.status === 'error' ? state.error : ''), state.status));
    var btn = document.createElement('button');
    btn.textContent = state && state.status === 'done' ? '重新收录' : '收录';
    btn.onclick = function () { send(true); };
    bar.appendChild(btn);
    bar.appendChild(nextBtn());
  }

  function send(force) {
    var cap = capture();
    if (isCand()) cap.targetSid = null;   // 候选不是库存里的料
    msg({ type: 'enqueue', capture: cap, force: !!force, kind: isCand() ? 'cand' : 'item' }, function (r) {
      // 找到了就算完成，这个标签页之后再逛的页面不再强行对应到它
      if (cap.targetSid && r && !r.existed) { try { sessionStorage.removeItem(TKEY); } catch (e) {} }
      refresh();
      // 页面内容已经交给后台了，按 N 开出来的标签页可以关掉（后台照样处理）；你自己开的标签页不动
      if (!force && settings.autoClose !== false) setTimeout(function () { chrome.runtime.sendMessage({ type: 'close-me' }); }, 1500);
    });
  }
  function refresh() {
    if (!alive()) return;
    chrome.storage.local.get(['jobs'], function (o) {
      var jobs = o.jobs || {}, u = clean(location.href);
      if (isBrandOrLine(u)) brandBar(jobs[u + '#brand'] || null);
      else itemBar(jobs[u] || null);
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
    if (msg.type === 'page-info') reply({ item: isItem(location.href), list: !isItem(location.href) && listItems().length > 0, url: clean(location.href), name: (document.querySelector('h1') || {}).innerText || document.title });
    else if (msg.type === 'capture-now') { send(true); reply({ ok: true }); }
    else if (msg.type === 'save-list') { chrome.runtime.sendMessage({ type: 'save-list', list: listInfo() }, reply); return true; }
  });
  chrome.storage.onChanged.addListener(function (ch) {
    if (ch.inv) { inv = ch.inv.newValue || []; Array.prototype.forEach.call(document.querySelectorAll('[data-shz]'), function (a) { delete a.dataset.shz; var c = a.querySelector('.shz-chip'); if (c) c.remove(); }); markLinks(); }
    if (ch.settings) settings = ch.settings.newValue || {};
    if (ch.jobs || ch.inv) refresh();
  });

  /* 页面是单页应用的话 URL 会变但不刷新，用轮询 + DOM 变化兜底 */
  var lastUrl = '', autoTimer = null, brandTimer = null, mo, listN = 0;
  function onPage() {
    var u = clean(location.href);
    if (u !== lastUrl) {
      lastUrl = u; clearTimeout(autoTimer); clearTimeout(brandTimer); listN = 0;
      if (isItem(u) && settings.auto !== false) autoTimer = setTimeout(function () { send(false); }, 2500);   // 等评论渲染完
      if (isBrand(u) && settings.auto !== false) brandTimer = setTimeout(function () { sendBrand(false); }, 3000);   // 品牌说明：每个品牌一次
    }
    // 品牌 / 系列页：链接变多了（比如你往下滚、展开了更多）就再存一次，免费，不经过 Claude
    if (isBrandOrLine(u)) {
      var n = listItems().length;
      if (n > listN) { listN = n; clearTimeout(autoTimer); autoTimer = setTimeout(function () {
        msg({ type: 'save-list', list: listInfo() }, function () { refresh(); });
      }, 1500); }
    }
    markLinks(); refresh();
  }
  function isBrand(u) { var s = segs(u); return isBrandOrLine(u) && s.length === 2; }
  /* 品牌页：除了读网址，还把整页交给 Claude 整理成品牌说明（每个品牌一次，要重做点按钮） */
  function sendBrand(force) {
    if (!alive()) { deadNotice(); return; }
    msg({ type: 'enqueue', kind: 'brand', capture: capture(), force: !!force }, function () { refresh(); });
  }
  function brandBar(job) {
    if (!bar) { bar = document.createElement('div'); bar.className = 'shz-bar'; document.body.appendChild(bar); }
    bar.innerHTML = '';
    var t = document.createElement('b'); t.textContent = 'Shizuku'; bar.appendChild(t);
    var own = 0; Array.prototype.forEach.call(document.querySelectorAll('a[data-shz] .shz-chip.own'), function () { own++; });
    if (listN) bar.appendChild(chip('已读取这一页 ' + listN + ' 款的网址' + (inv.length ? '，其中你有 ' + own + ' 款' : ''), 'done'));
    if (isBrand(location.href)) {
      var st = { queued: '品牌说明排队中…', processing: '品牌说明整理中…', done: '品牌说明已收录 ✓', error: '品牌说明出错：', cancelled: '品牌说明已取消' }[job && job.status] || '';
      if (st) bar.appendChild(chip(st + (job.status === 'error' ? job.error : ''), job.status));
      var b = document.createElement('button'); b.textContent = job && job.status === 'done' ? '重新整理品牌说明' : '整理品牌说明';
      b.onclick = function () { sendBrand(true); };
      bar.appendChild(b);
    }
    bar.appendChild(nextBtn());
  }
  chrome.storage.local.get(['inv', 'settings'], function (o) {
    inv = o.inv || []; settings = o.settings || {};
    takeHash();
    window.addEventListener('hashchange', takeHash);
    onPage();
    var t = null;
    mo = new MutationObserver(function () {
      if (!mine() || !alive()) { mo.disconnect(); return; }   // 旧脚本：停手
      clearTimeout(t); t = setTimeout(onPage, 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();
