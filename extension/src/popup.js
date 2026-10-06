function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
var ST = { queued: '排队中', processing: '处理中…', done: '已完成', error: '出错', cancelled: '已取消' };
var tabId = null;

function render() {
  chrome.storage.local.get(['jobs', 'settings', 'inv', 'invAt', 'visited'], function (o) {
    var lost = lostList(o), lb = document.getElementById('lost');
    document.getElementById('lostRow').style.display = lost.length || lb.disabled ? '' : 'none';
    if (!lb.disabled) { lb.textContent = '找回漏掉的 ' + lost.length + ' 款'; lb.title = lost.map(function (r) { return r.brand + ' · ' + r.name; }).join('\n'); }
    var s = o.settings || {}, w = [];
    if (s.backend === 'api' ? !s.apiKey : !s.bridgeToken) w.push((s.backend === 'api' ? '还没填 API Key' : '还没填中转口令') + '，<a href="options.html" target="_blank">去设置</a>');
    if (!(o.inv || []).length) w.push('还没同步库存：打开一次 Cellar 文件（并在扩展管理页打开「允许访问文件网址」）');
    document.getElementById('warn').innerHTML = w.map(function (x) { return '<div class="warn">' + x + '</div>'; }).join('');

    var jobs = Object.values(o.jobs || {}).sort(function (a, b) { return (b.doneAt || b.at) - (a.doneAt || a.at); });
    var pend = jobs.filter(function (j) { return j.status === 'done' && !j.deliveredAt; }).length;
    var nq = jobs.filter(function (j) { return j.status === 'queued'; }).length, nc = jobs.filter(function (j) { return j.status === 'cancelled'; }).length;
    document.getElementById('qClear').textContent = '清空队列（' + nq + '）'; document.getElementById('qClear').disabled = !nq;
    document.getElementById('qResume').textContent = '全部恢复（' + nc + '）'; document.getElementById('qResume').style.display = nc ? '' : 'none';
    var usd = jobs.reduce(function (a, j) { return a + ((j.usage && j.usage.usd) || 0); }, 0);
    document.getElementById('sum').textContent = (pend ? pend + ' 条待送进 Cellar · ' : '') + '累计约 $' + usd.toFixed(2) + ' · 库存 ' + (o.inv || []).length + ' 条';
    document.getElementById('expInfo').textContent = document.getElementById('expInfo').textContent || ('已存 ' + jobs.filter(function (j) { return j.capture; }).length + ' 页原文');
    document.getElementById('jobs').innerHTML = jobs.slice(0, 15).map(function (j) {
      var r = j.result || {};
      var name = j.type === 'list' ? '📋 ' + j.name + '（' + ((j.list && j.list.items.length) || 0) + ' 条）'
        : j.type === 'brand' ? '🏷 品牌说明：' + (r.brand || j.name.replace(/^品牌 /, ''))
        : j.type === 'cand' ? '🛒 候选：' + (r.brand ? r.brand + ' · ' : '') + (r.name || j.name.replace(/^候选 /, ''))
        : j.type === 'map' ? '🔗 ' + j.name + (r.matches ? '（对上 ' + r.matches.filter(function (m) { return m.u && m.confidence !== '低'; }).length + ' / ' + r.matches.length + '）' : '')
        : (r.brand ? r.brand + ' · ' : '') + (r.name || j.name || j.url);
      return '<div class="job ' + j.status + '"><div class="jn">' + esc(name) + (r.name_zh ? ' <span class="dim">' + esc(r.name_zh) + '</span>' : '') + '</div>'
        + '<div class="jm"><span class="st">' + ST[j.status] + '</span>'
        + (j.error ? ' <span class="err">' + esc(j.error) + '</span>' : '')
        + (j.usage ? ' <span class="dim">' + (j.usage.subscription ? '订阅' : '$' + j.usage.usd.toFixed(3)) + '</span>' : '')
        + (j.status === 'done' ? (j.deliveredAt ? ' <span class="dim">已入 Cellar</span>' : ' <span class="pend">待送</span>') : '')
        + (j.status === 'error' || j.status === 'cancelled' ? ' <button data-retry="' + esc(j.url) + '">' + (j.status === 'error' ? '重试' : '恢复') + '</button>' : '')
        + ' <button data-del="' + esc(j.url) + '" class="x">删</button></div></div>';
    }).join('') || '<div class="dim">还没有收录。</div>';
  });
}

document.addEventListener('click', function (e) {
  var t = e.target;
  if (t.dataset.retry) chrome.runtime.sendMessage({ type: 'retry', url: t.dataset.retry }, render);
  if (t.dataset.del) chrome.runtime.sendMessage({ type: 'delete', url: t.dataset.del }, render);
  if (t.id === 'exp') exportRaw();
  if (t.id === 'syncRaw') { t.textContent = '同步中…'; chrome.runtime.sendMessage({ type: 'sync-raw' }, function (r) {
    t.textContent = '同步到电脑给 Claude';
    document.getElementById('expInfo').textContent = r && r.ok ? '已同步 ' + r.n + ' 页 → shizuku\\data\\htr_raw.json' : '同步失败：' + ((r && r.error) || '扩展没响应');
  }); }
  if (t.id === 'lost') recoverLost();
  if (t.id === 'qClear') chrome.runtime.sendMessage({ type: 'cancel-queued' }, function (r) { document.getElementById('qInfo').textContent = '已取消 ' + ((r && r.n) || 0) + ' 款（原始页面还在）'; render(); });
  if (t.id === 'qResume') chrome.runtime.sendMessage({ type: 'resume-cancelled' }, function (r) { document.getElementById('qInfo').textContent = '已恢复 ' + ((r && r.n) || 0) + ' 款'; render(); });
  if (t.id === 'rep' && confirm('把已收录的全部按新规则重新交给 Claude 处理？\n每款都会用一次额度；结果会自动更新到 Cellar 里。')) {
    chrome.runtime.sendMessage({ type: 'reprocess-all' }, function (r) { document.getElementById('repInfo').textContent = '已重新排队 ' + ((r && r.n) || 0) + ' 款'; render(); });
  }
  if (t.id === 'cap') chrome.tabs.sendMessage(tabId, { type: 'capture-now' }, function () { setTimeout(render, 300); });
  if (t.id === 'lst') chrome.tabs.sendMessage(tabId, { type: 'save-list' }, function (r) {
    t.textContent = r && r.n != null ? '已保存 ' + r.n + ' 条' : '保存失败'; render();
  });
});

/* 漏掉的 = 按 N 打开过（visited）、但 Cellar 说还没做（!done）、队列里也没有指向它的那一页。
   以前几个标签页同时提交会互相覆盖，丢掉的就是这些。放回去 = 从 visited 里删掉，并从头开始找，下一次按 N 先轮到它们。 */
function lostList(o) {
  var vis = o.visited || {}, inv = o.inv || [], jobs = Object.values(o.jobs || {});
  var inQueue = {};
  jobs.forEach(function (j) { if (j.capture && j.capture.targetSid != null) inQueue[j.capture.targetSid] = 1; if (j.matchSid != null) inQueue[j.matchSid] = 1; });
  return inv.filter(function (r) { return vis[r.sid] && !r.done && !r.url && !inQueue[r.sid]; });
}
function recoverLost() {
  chrome.storage.local.get(['visited', 'inv', 'jobs'], function (o) {
    var lost = lostList(o), vis = o.visited || {};
    lost.forEach(function (r) { delete vis[r.sid]; });
    chrome.storage.local.set({ visited: vis, lastSid: null }, function () {
      document.getElementById('lost').textContent = '已放回 ' + lost.length + ' 款，去 HTReviews 按 N';
      document.getElementById('lost').disabled = true;
    });
  });
}

/* 把收录过的烟料页原文 + Claude 结果存成一个 JSON 文件，以后重新打标或交给 Claude Code 批量处理时用 */
function exportRaw() {
  chrome.storage.local.get('jobs', function (o) {
    var items = Object.values(o.jobs || {}).filter(function (j) { return j.type === 'item' && j.capture; }).map(function (j) {
      return { url: j.url, at: j.at, doneAt: j.doneAt, status: j.status, targetSid: j.capture.targetSid, model: j.model, effort: j.effort,
        capture: j.capture, result: j.result || null };
    });
    var lists = Object.values(o.jobs || {}).filter(function (j) { return j.type === 'list'; }).map(function (j) { return j.list; });
    var brands = Object.values(o.jobs || {}).filter(function (j) { return j.type === 'brand' && j.capture; }).map(function (j) { return { url: j.url.replace(/#brand$/, ''), capture: j.capture, result: j.result || null }; });
    var blob = new Blob([JSON.stringify({ k: 'shizuku-htr-raw', v: 1, at: new Date().toISOString(), items: items, brands: brands, lists: lists })], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shizuku_htr_raw_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    document.getElementById('expInfo').textContent = items.length + ' 页 · ' + Math.round(blob.size / 1024) + ' KB → 下载文件夹';
  });
}

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  var tab = tabs[0], here = document.getElementById('here');
  tabId = tab && tab.id;
  if (!tab || !/^https:\/\/htreviews\.org\//.test(tab.url || '')) { here.innerHTML = '<div class="dim">在 htreviews.org 的页面上点开这里可以收录。</div>'; return; }
  chrome.tabs.sendMessage(tabId, { type: 'page-info' }, function (info) {
    if (chrome.runtime.lastError || !info) { here.innerHTML = '<div class="dim">刷新一下这个页面再试。</div>'; return; }
    var h = '<div class="h">当前页</div><div class="jn">' + esc(info.name) + '</div><div class="row">';
    if (info.item) h += '<button id="cap" class="ac">收录这一页（交给 Claude）</button>';
    if (info.list) h += '<button id="lst" class="ac">保存这张列表</button>';
    if (!info.item && !info.list) h += '<span class="dim">这一页不是烟料页也不是列表。</span>';
    here.innerHTML = h + '</div>';
  });
});
chrome.storage.onChanged.addListener(render);
render();
