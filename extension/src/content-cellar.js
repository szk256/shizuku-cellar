/* 本地 Shizuku Cellar 页面上运行：把收录好的结果送进去，把库存名单带回来。
   需要在 chrome://extensions 里给本扩展打开「允许访问文件网址」。
   每份脚本有自己的编号（inst）。扩展更新后后台会往这一页再注入一份新的：
   旧的那份发现自己失效就说一声 dead 然后闭嘴，新的发 hello 接上——Cellar 按编号认最新的，不用刷新页面。 */
(function () {
  var inst = String(Math.random()), gone = false;
  function post(o) { if (gone) return; o.k = 'shizuku-ext'; o.from = 'ext'; o.inst = inst; window.postMessage(o, '*'); }
  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  function die() { if (gone) return; post({ type: 'dead' }); gone = true; window.removeEventListener('message', onMsg); }
  /* 后台闲置会休眠，叫醒的那一下偶尔丢消息：扩展还在就重发，最多 3 次；真失效才说 dead */
  function send(msg, cb, tries) {
    tries = tries || 0;
    if (!alive()) { die(); return; }
    try {
      chrome.runtime.sendMessage(msg, function (r) {
        if (chrome.runtime.lastError) {
          if (!alive()) { die(); return; }
          if (tries < 3) { setTimeout(function () { send(msg, cb, tries + 1); }, 800 * (tries + 1)); return; }
          if (cb) cb({ ok: false, error: '扩展没响应：' + chrome.runtime.lastError.message });
          return;
        }
        if (cb) cb(r);
      });
    } catch (e) { if (!alive()) die(); else if (cb) cb({ ok: false, error: e.message }); }
  }
  var ready = false;

  function onMsg(e) {
    if (e.source !== window || !e.data || e.data.k !== 'shizuku-ext' || e.data.from !== 'page') return;
    var d = e.data;
    if (d.type === 'hello') { ready = true; post({ type: 'hello' }); deliver(); }
    else if (d.type === 'ping') { if (alive()) post({ type: 'pong' }); else die(); }
    else if (d.type === 'inventory') send({ type: 'inventory', items: d.items });
    else if (d.type === 'ack') send({ type: 'delivered', urls: d.urls });
    else if (d.type === 'state') send({ type: 'sync-state', state: d.state }, function (r) { post({ type: 'state-saved', ok: !!(r && r.ok), error: r && r.error }); });
    else if (d.type === 'patches?') send({ type: 'get-patches' }, function (r) { post({ type: 'patches', ok: !!(r && r.ok), patches: (r && r.patches) || [], error: r && r.error }); });
    else if (d.type === 'bridge?') send({ type: 'bridge-status' }, function (r) { post(Object.assign({ type: 'bridge' }, r || { ok: false, error: '扩展没响应' })); });
    else if (d.type === 'ask') send({ type: 'ask', q: d.q, ctx: d.ctx, label: d.label, kind: d.kind, model: d.model, effort: d.effort }, function (r) { post({ type: 'answer', id: d.id, ok: !!(r && r.ok), result: r && r.result, model: r && r.model, error: r && r.error }); });
    else if (d.type === 'ext-settings?' || d.type === 'ext-settings-set') send(d.type === 'ext-settings?' ? { type: 'get-settings' } : { type: 'set-settings', patch: d.patch }, function (r) { post({ type: 'ext-settings', ok: !!(r && r.ok), settings: r && r.settings, error: r && r.error }); });
    else if (d.type === 'patch-done') send({ type: 'patch-done', name: d.name, applied: d.applied });
    else if (d.type === 'open') send({ type: 'open-tabs', urls: d.urls }, function (r) { post({ type: 'opened', id: d.id, n: r && r.n, error: r && r.error }); });   // Cellar 的「下一款」：后台新标签页打开
  }
  window.addEventListener('message', onMsg);

  function deliver() {
    if (!ready || !alive()) return;
    chrome.storage.local.get('jobs', function (o) {
      var jobs = o.jobs || {}, out = [];
      for (var k in jobs) {
        var j = jobs[k];
        if (j.status === 'done' && !j.deliveredAt) out.push({ url: j.url, type: j.type, result: j.result, list: j.list, model: j.model, effort: j.effort, usage: j.usage, matchSid: j.matchSid, matchScore: j.matchScore, at: j.doneAt });
      }
      if (out.length) post({ type: 'deliver', entries: out });
    });
  }
  try { chrome.storage.onChanged.addListener(function (ch) { if (ch.jobs && alive()) deliver(); }); } catch (e) {}
  post({ type: 'hello' });   // 页面先加载完 / 扩展更新后重新注入：靠这一下让 Cellar 认出新的这份
})();
