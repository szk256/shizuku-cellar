var F = ['bridgeToken', 'bridgeUrl', 'apiKey', 'model', 'effort', 'auto', 'nextNewTab', 'nextCount', 'autoClose'];
var BOOL = { auto: 1, nextNewTab: 1, autoClose: 1 };
var DEF = { nextCount: '3', nextNewTab: true, autoClose: true, backend: 'bridge', bridgeUrl: 'http://127.0.0.1:8787', bridgeToken: '', apiKey: '', model: 'claude-opus-5-5', effort: 'medium', auto: true };
function $(id) { return document.getElementById(id); }
function msg(t, bad) { var m = $('msg'); m.textContent = t; m.className = bad ? 'err' : 'dim'; }
function backend() { var r = document.querySelector('input[name=backend]:checked'); return r ? r.value : 'bridge'; }
function toggle() { var b = backend(); $('bridgeBox').style.display = b === 'bridge' ? '' : 'none'; $('apiBox').style.display = b === 'api' ? '' : 'none'; }

chrome.storage.local.get('settings', function (o) {
  var s = Object.assign({}, DEF, o.settings || {});
  F.forEach(function (k) { if (BOOL[k]) $(k).checked = !!s[k]; else $(k).value = s[k]; });
  var r = document.querySelector('input[name=backend][value="' + s.backend + '"]'); if (r) r.checked = true;
  toggle();
});
document.querySelectorAll('input[name=backend]').forEach(function (r) { r.onchange = toggle; });
function read() {
  var s = { backend: backend() };
  F.forEach(function (k) { s[k] = BOOL[k] ? $(k).checked : $(k).value.trim(); });
  return s;
}
$('save').onclick = function () { chrome.storage.local.set({ settings: read() }, function () { msg('已保存'); }); };

/* 测试都不产生费用：中转只查健康状态，API 只查模型信息 */
$('test').onclick = function () {
  var s = read();
  msg('测试中…');
  if (s.backend === 'bridge') {
    if (!s.bridgeToken) { msg('先填口令', true); return; }
    fetch(s.bridgeUrl.replace(/\/+$/, '') + '/v1/health', { headers: { 'X-Shizuku-Token': s.bridgeToken } }).then(function (r) {
      if (r.status === 403) { msg('口令不对', true); return; }
      return r.json().then(function (j) { msg(j.ok ? '中转已连上 ✓（是否已登录要等第一次收录才知道）' : '中转出错', !j.ok); });
    }, function () { msg('连不上中转：先双击「启动中转.bat」', true); });
    return;
  }
  if (!s.apiKey) { msg('先填 Key', true); return; }
  fetch('https://api.anthropic.com/v1/models/' + encodeURIComponent(s.model), {
    headers: { 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
  }).then(function (r) {
    if (r.ok) return r.json().then(function (j) { msg('Key 可用 ✓ ' + (j.display_name || s.model) + '（不代表有余额）'); });
    if (r.status === 401) msg('Key 无效', true);
    else if (r.status === 404) msg('这把 Key 用不了这个模型', true);
    else msg('出错：HTTP ' + r.status, true);
  }, function (e) { msg('连不上 api.anthropic.com：' + e.message, true); });
};
