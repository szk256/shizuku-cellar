// 并发测试：模拟 3 个标签页同时把页面交给后台，确认一条都不丢、关标签页前会确认已入队。
// 用法: node build.mjs && cp dist/background.js dist/background.mjs && node test_queue.mjs && rm dist/background.mjs
//（Node 要 .mjs 后缀才按 ES 模块加载；测完删掉，别打包进扩展）
const delay = () => new Promise((r) => setTimeout(r, Math.random() * 20));   // 存储读写都有随机延迟，制造竞争
const area = () => {
  const data = {};
  return {
    get: async (k) => { await delay(); const o = {}; (Array.isArray(k) ? k : [k]).forEach((x) => { if (x in data) o[x] = JSON.parse(JSON.stringify(data[x])); }); return o; },
    set: async (o) => { await delay(); Object.assign(data, JSON.parse(JSON.stringify(o))); },
    _data: data,
  };
};
let listener = null, removed = [];
globalThis.self = globalThis;
globalThis.chrome = {
  storage: { local: area(), session: area() },
  runtime: { onMessage: { addListener: (f) => { listener = f; } }, onInstalled: { addListener: () => {} }, getPlatformInfo: (cb) => cb && cb({}) },
  tabs: { create: async () => ({ id: Math.floor(Math.random() * 1e6) }), remove: async (id) => { removed.push(id); } },
};
await chrome.storage.local.set({ settings: { backend: 'bridge', bridgeToken: '' } });   // 没口令 → 处理会立即报错，测的是排队不是 Claude
await import('./dist/background.mjs');
const send = (msg, tab) => new Promise((r) => listener(msg, { tab }, r));

const caps = [1, 2, 3].map((i) => ({ url: `https://htreviews.org/tobaccos/b/l/item-${i}?x=1`, h1: 'item ' + i, text: 't' + i }));
const res = await Promise.all(caps.map((c) => send({ type: 'enqueue', capture: c })));
await new Promise((r) => setTimeout(r, 500));
const jobs = (await chrome.storage.local.get('jobs')).jobs;
const urls = Object.keys(jobs).sort();
console.log('入队回执', res.map((x) => x.status).join(','));
console.log('队列里', urls.length, '条', urls.map((u) => u.split('/').pop()).join(','), '状态', Object.values(jobs).map((j) => j.status).join(','));

// 关标签页：只关扩展开的、且已经入队的
const o = await send({ type: 'open-tabs', urls: ['https://htreviews.org/a', 'https://htreviews.org/b'] }, { index: 0, windowId: 1 });
const opened = (await chrome.storage.session.get('opened')).opened;
const r1 = await send({ type: 'close-me' }, { id: opened[0], url: caps[0].url });             // 已入队 → 关
const r2 = await send({ type: 'close-me' }, { id: opened[1], url: 'https://htreviews.org/tobaccos/b/l/not-queued' });   // 没入队 → 不关
const r3 = await send({ type: 'close-me' }, { id: 424242, url: caps[1].url });                // 不是扩展开的 → 不关
console.log('开了', o.n, '个；关：已入队', r1.ok, '没入队', r2.ok, '自己开的', r3.ok, '实际关掉', removed.length, '个');
// 清空队列：只动排队中的；恢复：已取消的回到队列
await chrome.storage.local.set({ jobs: { a: { url: 'a', status: 'queued', capture: {} }, b: { url: 'b', status: 'queued', capture: {} }, c: { url: 'c', status: 'done', capture: {} }, d: { url: 'd', status: 'processing', capture: {}, startedAt: 1 } } });
const cq = await send({ type: 'cancel-queued' });
const st1 = Object.values((await chrome.storage.local.get('jobs')).jobs).map((j) => j.url + ':' + j.status).sort().join(',');
const rs = await send({ type: 'resume-cancelled' });
console.log('清空', cq.n, '款 →', st1, '；恢复', rs.n, '款');
// 品牌页：网址列表（list）和品牌说明（brand）同一个地址，要各存各的
await chrome.storage.local.set({ jobs: {} });
const bu = 'https://htreviews.org/tobaccos/darkside';
await Promise.all([
  send({ type: 'save-list', list: { url: bu, title: 'Darkside', kind: 'brand', items: [{ u: bu + '/core/x', n: 'x', b: 'Darkside' }] } }),
  send({ type: 'enqueue', kind: 'brand', capture: { url: bu, h1: 'Darkside', text: 'about' } }),
]);
const bj = (await chrome.storage.local.get('jobs')).jobs;
const brandOk = bj[bu] && bj[bu].type === 'list' && bj[bu + '#brand'] && bj[bu + '#brand'].type === 'brand';
console.log('品牌页两份任务：', Object.keys(bj).map((k) => k.replace(bu, '…') + '=' + bj[k].type).join(', '));
// 配网址：系列页读到列表、这个品牌还有没网址的料 → 排一个 #map 任务，只带这个品牌没对上的料
await chrome.storage.local.set({ jobs: {}, inv: [
  { sid: 1, brand: 'Original Virginia', name: 'Melted Milk', sub: '焦糖奶油' },
  { sid: 2, brand: 'Original Virginia', name: 'Gin', sub: '金酒', link: 'https://htreviews.org/tobaccos/original-virginia/x/dzhin' },
  { sid: 3, brand: 'Original Virginia', name: 'Done one', done: true },
  { sid: 4, brand: 'Darkside', name: 'Other brand' }] });
const lu = 'https://htreviews.org/tobaccos/original-virginia/original';
const lr = await send({ type: 'save-list', list: { url: lu, title: 'Original', kind: 'line', items: [{ u: lu + '/toplenoe-moloko', n: 'Топлёное молоко', b: 'Original Virginia' }] } });
const mj = (await chrome.storage.local.get('jobs')).jobs[lu + '#map'];
const mapOk = lr.map === 'queued' && mj && mj.type === 'map' && mj.capture.inv.map((r) => r.sid).join() === '1';
console.log('配网址任务：', lr.map, '，带上的库存 sid =', mj && mj.capture.inv.map((r) => r.sid).join());
const pass = mapOk && brandOk && urls.length === 3 && r1.ok && !r2.ok && !r3.ok && removed.length === 1
  && cq.n === 2 && st1 === 'a:cancelled,b:cancelled,c:done,d:processing' && rs.n === 2;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
