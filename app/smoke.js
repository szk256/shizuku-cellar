/* Cellar 冒烟测试：在测试副本里跑（不要在你真正用的 Cellar 里跑——它会改数据）。
   用法：页面里 <script src="smoke.js"> 之后 await window.smoke()，返回 {ok, fails, log}。 */
window.smoke = async function () {
  var log = [], fails = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(e.message); });
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var cards = function () { return document.querySelectorAll('#im .card').length; };
  async function step(name, fn) {
    try { var v = await fn(); log.push(name + ': ' + (v === undefined ? 'ok' : JSON.stringify(v).slice(0, 160))); }
    catch (e) { fails.push(name + ': ' + e.message); }
  }
  function must(cond, msg) { if (!cond) throw new Error(msg); }

  await step('页面切换', async function () {
    for (const p of ['index', 'editor', 'stats', 'cellar', 'htr', 'index']) { gotoPage(p); await sleep(150); }
  });
  await step('索引全量', function () { clearFilter(); must(cards() === db.length, cards() + ' != ' + db.length); return cards(); });
  await step('左边栏四个视角', function () {
    var o = {};
    ['brand', 'rate', 'str', 'ax'].forEach(function (v) { sbSetView(v); o[v] = document.querySelectorAll('#sbl > div').length; must(o[v] > 0, v + ' 空'); });
    return o;
  });
  await step('品牌筛选', function () { sbSetView('brand'); var b = db[0].brand; sbPick({ k: 'brand', v: b }); var n = cards(); must(n === db.filter(function (r) { return r.brand === b; }).length, '数量不对'); sbSetView('ax'); return b + ' ' + n; });
  await step('评分筛选 + 加权排序', function () {
    document.getElementById('af-minr').value = '4.5'; afHtSet();
    document.getElementById('sort1').value = 'wr'; applyFilter();
    var n = cards(); clearFilter(); return n;
  });
  await step('浓度筛选', function () { afHt.su = [3]; applyFilter(); var n = cards(); clearFilter(); return n; });
  await step('详情窗', function () { dtlOpen(db[3]); var t = document.getElementById('dtl').innerText; must(t.length > 20, '空'); return t.slice(0, 40); });
  await step('编辑器保存', function () {
    jumpToEditor(db[3].brand, db[3].name);
    var el = document.getElementById('f-ln'); var old = el.value; el.value = 'TEST-LINE'; edDirty(); edSave();
    must(db.some(function (r) { return r.line === 'TEST-LINE'; }), '没存上'); undo(); return old;
  });
  await step('数据检查', function () { var r = runCheck(); return { hard: r.hard.length, soft: r.soft.length }; });
  await step('柜位：新增柜子 / 挪区 / 合并 / 拆开 / 撤销', function () {
    var n0 = cellar.cabs.length; celAddCab(); var id = cellar.cabs[cellar.cabs.length - 1].id;
    var r = db[0], z = celZoneOf(r), from = (celIx().place[z] || [''])[0] || '';
    celZoneMove(z, from, id + ':1');
    var loc = celOf(r); must(loc && loc.cab.id === id && loc.l === 1, '区挪过去后这罐的位置不对');
    must(celCount(id, 1) > 0, '层里数量是 0');
    gotoPage('cellar'); must(document.querySelectorAll('.cel-cab3 .czg').length > 0, '柜子页没画出区块');
    var other = Object.keys(celIx().items).filter(function (k) { return k !== z; })[0];
    celZoneMerge(z, other); var mk = cellar.merges[cellar.merges.length - 1].key;
    must(celZoneOf(r) === mk, '合并后区不对'); celZoneSplit(mk); must(celZoneOf(r) === z, '拆开后区不对');
    celMoveOne(r.sid, id + ':2'); must(celOf(r).l === 2 && celOf(r).own, '单独指定不生效'); celMoveOne(r.sid, '');
    celFind = r.name; renderCellar(); must(document.querySelectorAll('.jar.hit').length > 0, '找不到时没点亮'); celFind = '';
    for (var u = 0; u < 7; u++) undo();
    gotoPage('index'); clearFilter(); must(cellar.cabs.length === n0, '撤销后柜子数不对：' + cellar.cabs.length);
    return id + ' ' + loc.code;
  });
  await step('手气', function () { luckyMode = 'thin'; luckyRoll(); luckyMode = 'affinity'; luckyRoll(); return picklist.length; });
  await step('配方面板', function () {
    plClear(); clearFilter();
    var cs = document.querySelectorAll('#im .card .card-add'); must(cs.length > 3, '卡片上没有 ＋');
    cs[0].click(); cs[1].click(); cs[2].click();
    must(picklist.length === 3, '＋ 没加进去：' + picklist.length);
    cApplyRatio(C_RATIOS[3][1]);
    var sum = picklist.reduce(function (a, p) { return a + cPct(p); }, 0); must(Math.abs(sum - 100) < 0.6, '比例合计 ' + sum);
    cSmart(); sum = picklist.reduce(function (a, p) { return a + cPct(p); }, 0); must(Math.abs(sum - 100) < 0.6, '按强度后合计 ' + sum);
    var pi = document.querySelector('#c-rows .ci'); pi.value = 70; pi.dispatchEvent(new Event('change'));
    sum = picklist.reduce(function (a, p) { return a + cPct(p); }, 0); must(Math.abs(sum - 100) < 0.6, '改一条后合计 ' + sum);
    must(document.getElementById('c-over').innerText.indexOf('浓度') > -1, '没有概览');
    var _p = window.prompt; window.prompt = function () { return '测试配方'; };
    var n0 = (htr.recipes || []).length; plFavSave(); window.prompt = _p;
    must(htr.recipes.length === n0 + 1, '没收藏上'); plClear(); plFavLoad(0); must(picklist.length === 3, '收藏载入不对');
    htr.recipes.shift(); plCopy();
    for (var t = 0; t < 30; t++) { luckyMode = 'affinity'; luckyRoll();
      must(picklist.filter(function (p) { return pwOf(p) === 3; }).length <= 1, '随机配方里出现两个霸道料'); }
    luckyMode = 'thin'; drawRoll(); must(drawSet.length === 3, '灵感三条'); drawToPick();
    plClear(); return 'ok';
  });
  await step('备份菜单', function () { bkMenu(); must(document.getElementById('bk-menu').classList.contains('open'), '没打开'); document.body.click(); });
  await step('设置页 / Claude 页', function () {
    for (const p of ['cfg', 'claude']) gotoPage(p);
    gotoPage('cfg'); must(document.querySelectorAll('.cfg-sec').length >= 7, '设置页分组不全');
    var a0 = cfg('acc'); cfgSet('acc', '#e07a9a'); must(getComputedStyle(document.body).getPropertyValue('--acc').trim() === '#e07a9a', '强调色没生效'); cfgSet('acc', a0);
    var h0 = cfg('askHist'); cfgSet('askHist', 0); must(askContext('x').indexOf('## 之前的对话') < 0, '对话轮数 0 还带了历史'); cfgSet('askHist', h0);
    gotoPage('claude'); must(document.getElementById('ck-side').innerText.indexOf('改动记录') > -1, 'Claude 页没有改动记录');
    gotoPage('index');
  });
  await step('HTReviews 页', function () { gotoPage('htr'); var t = document.getElementById('phi').innerText; must(t.length > 50, '空'); gotoPage('index'); return t.length; });
  return { ok: !fails.length && !errs.length, fails: fails, errs: errs, log: log };
};
