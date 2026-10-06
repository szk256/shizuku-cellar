/* 名字归一化 + 相似度。和 Cellar 里的 htrNorm / htrScore 是同一套规则，改的时候两边一起改。 */
(function (g) {
  var TR = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sh','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[а-яё]/g, function (c) { return TR[c]; })
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function bi(s) {
    s = s.replace(/ /g, ''); var m = {};
    for (var i = 0; i < s.length - 1; i++) { var b = s.substr(i, 2); m[b] = (m[b] || 0) + 1; }
    if (s.length === 1) m[s] = 1;
    return m;
  }
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a.replace(/ /g, '') === b.replace(/ /g, '')) return 1;
    var A = bi(a), B = bi(b), n = 0, ta = 0, tb = 0, k;
    for (k in A) { ta += A[k]; if (B[k]) n += Math.min(A[k], B[k]); }
    for (k in B) tb += B[k];
    return ta + tb ? 2 * n / (ta + tb) : 0;
  }
  function strip(name, brand) {
    var n = norm(name), b = norm(brand);
    if (b) b.split(' ').forEach(function (w) { if (w.length > 2) n = (' ' + n + ' ').replace(' ' + w + ' ', ' ').trim(); });
    return n || norm(name);
  }
  function brandScore(a, b) {
    a = norm(a).replace(/ /g, ''); b = norm(b).replace(/ /g, '');
    if (!a || !b) return 0.5;
    if (a === b) return 1;
    if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return 0.7;
    return dice(a, b) > 0.8 ? 0.8 : 0;
  }
  function score(r, brand, name) {
    var bs = brandScore(r.brand, brand);
    if (!bs) return 0;
    var ns = Math.max(dice(strip(r.name, r.brand), strip(name, brand)), dice(norm(r.name), norm(name)));
    return ns * (0.55 + 0.45 * bs);
  }
  function best(inv, brand, name) {
    var top = null;
    (inv || []).forEach(function (r) { var s = score(r, brand, name); if (!top || s > top.s) top = { r: r, s: s }; });
    return top && top.s >= 0.45 ? top : null;
  }
  g.ShizukuMatch = { norm: norm, dice: dice, score: score, best: best, brandScore: brandScore };
})(typeof self !== 'undefined' ? self : this);
