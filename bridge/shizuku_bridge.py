"""Shizuku 本地中转：让扩展用你的 Claude 订阅（Claude Code）处理收录的页面，不用 API Key。

运行:  双击「启动中转.bat」，或  python shizuku_bridge.py
只监听 127.0.0.1，并且每个请求都要带口令（第一次运行时生成，存在 token.txt）。
Claude 在一个空的临时目录里运行，所有工具都关掉：它只能读我们给它的文字、回 JSON，碰不到你的文件。
"""
import glob
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST, PORT = '127.0.0.1', 8787
HERE = Path(__file__).resolve().parent
TOKEN_FILE = HERE / 'token.txt'
TIMEOUT = 600          # 单页最长 10 分钟
LOCK = threading.Lock()  # 一次只跑一页，免得把订阅额度一下子用光

# Claude 现在在干什么：Cellar 的状态指示器读这个（GET /v1/status）
STATUS_LOCK = threading.Lock()
STATUS = {'current': None, 'waiting': [], 'recent': []}   # current/waiting: {id,label,kind,since}；recent: {label,kind,ok,secs,at,error}
_sid = [0]


def status_add(label, kind):
    with STATUS_LOCK:
        _sid[0] += 1
        job = {'id': _sid[0], 'label': label, 'kind': kind, 'since': time.time()}
        STATUS['waiting'].append(job)
        return job


def status_start(job):
    with STATUS_LOCK:
        STATUS['waiting'] = [j for j in STATUS['waiting'] if j['id'] != job['id']]
        job['started'] = time.time()
        STATUS['current'] = job


def status_done(job, ok, error=''):
    with STATUS_LOCK:
        if STATUS['current'] and STATUS['current']['id'] == job['id']:
            STATUS['current'] = None
        STATUS['waiting'] = [j for j in STATUS['waiting'] if j['id'] != job['id']]
        t0 = job.get('started') or job['since']
        STATUS['recent'].insert(0, {'label': job['label'], 'kind': job['kind'], 'ok': ok, 'secs': round(time.time() - t0),
                                    'at': time.time(), 'error': error[:200]})
        del STATUS['recent'][10:]


def find_claude():
    """优先用环境变量；其次 PATH；最后找 Claude 桌面版自带的、版本号最新的那个。"""
    p = os.environ.get('SHIZUKU_CLAUDE')
    if p and Path(p).exists():
        return p
    p = shutil.which('claude')
    if p:
        return p
    # 桌面 App 自带的 Claude Code 在 claude-code\<版本>\claude.exe，新版本是 claude-code\<版本>\<编号>\claude.exe；
    # 商店版的文件实际在 Packages\Claude_*\LocalCache 下，普通程序在 Roaming 里看不到，两处都找
    roots = [os.path.join(os.environ.get('APPDATA', ''), 'Claude', 'claude-code')] + \
        glob.glob(os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Packages', 'Claude_*', 'LocalCache', 'Roaming', 'Claude', 'claude-code'))
    cands = []
    for r in roots:
        cands += glob.glob(os.path.join(r, '*', 'claude.exe')) + glob.glob(os.path.join(r, '*', '*', 'claude.exe'))

    def ver(path):
        parts = [x.lower() for x in Path(path).parts]
        name = Path(path).parts[parts.index('claude-code') + 1]   # claude-code 下面那一层就是版本号
        try:
            v = tuple(int(x) for x in name.split('.'))
        except ValueError:
            v = (0,)
        return (v, os.path.getmtime(path))   # 同版本取最新写入的
    return max(cands, key=ver) if cands else None


def claude_exe():
    """桌面 App 自动更新会把旧版本挪走，每次用之前确认还在，不在就重新找。"""
    global CLAUDE
    if not CLAUDE or not Path(CLAUDE).exists():
        CLAUDE = find_claude()
        if CLAUDE:
            print('Claude Code 位置变了，改用：', CLAUDE, flush=True)
    return CLAUDE


def load_token():
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text(encoding='utf-8').strip()
    t = secrets.token_urlsafe(24)
    TOKEN_FILE.write_text(t, encoding='utf-8')
    return t


CLAUDE = find_claude()
TOKEN = load_token()

# 和 Cellar 交换数据的目录：shizuku/data（Cellar 数据）和 shizuku/data/patches（给 Cellar 的修改包）
DATA = HERE.parent / 'data'
PATCHES = DATA / 'patches'
PATCHES.mkdir(parents=True, exist_ok=True)


def write_json(path, obj):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')
    tmp.replace(path)   # 先写临时文件再替换，读的人不会读到写了一半的


def run_claude(system, prompt, schema, model, effort):
    exe = claude_exe()
    if not exe:
        raise RuntimeError('找不到 Claude Code（claude.exe）')
    args = [exe, '-p',
            '--model', model,
            '--effort', effort,
            '--tools', '',
            '--strict-mcp-config',
            '--no-session-persistence',
            '--output-format', 'json',
            '--system-prompt', system,
            '--json-schema', json.dumps(schema, ensure_ascii=False)]
    with tempfile.TemporaryDirectory(prefix='shizuku_') as cwd:
        proc = subprocess.run(args, input=prompt, capture_output=True, text=True, encoding='utf-8',
                              cwd=cwd, timeout=TIMEOUT,
                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    out = (proc.stdout or '').strip()
    try:
        res = json.loads(out)
    except json.JSONDecodeError:
        raise RuntimeError(('Claude Code 没有返回 JSON：' + (out or proc.stderr or '').strip())[:400])
    if res.get('is_error'):
        msg = str(res.get('result') or res.get('terminal_reason') or '未知错误')
        if 'login' in msg.lower():
            msg = 'Claude Code 没登录：双击「登录 Claude.bat」，用你的 Pro 账号 /login 一次'
        raise RuntimeError(msg[:400])
    data = res.get('structured_output')
    if data is None:
        try:
            data = json.loads(res.get('result') or '')
        except json.JSONDecodeError:
            raise RuntimeError('结果不是 JSON：' + str(res.get('result'))[:300])
    used = next(iter(res.get('modelUsage') or {}), model)
    u = res.get('usage') or {}
    return {'result': data, 'model': used,
            'usage': {'in': u.get('input_tokens'), 'out': u.get('output_tokens'), 'usd': 0, 'subscription': True}}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _allowed(self):
        # 普通网页也能往 localhost 发请求，所以：网页来源一律拒绝 + 必须带口令
        origin = self.headers.get('Origin', '')
        if origin and not origin.startswith('chrome-extension://'):
            return False
        return secrets.compare_digest(self.headers.get('X-Shizuku-Token', ''), TOKEN)

    def _body(self):
        return json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('utf-8'))

    def do_GET(self):
        if not self._allowed():
            return self._send(403, {'error': '口令不对'})
        if self.path == '/v1/health':
            return self._send(200, {'ok': True, 'claude': claude_exe(), 'busy': LOCK.locked()})
        if self.path == '/v1/status':
            with STATUS_LOCK:
                now = time.time()
                cur = STATUS['current']
                return self._send(200, {'ok': True, 'now': now,
                                        'current': dict(cur, secs=round(now - cur.get('started', cur['since']))) if cur else None,
                                        'waiting': [dict(j, secs=round(now - j['since'])) for j in STATUS['waiting']],
                                        'recent': STATUS['recent']})
        if self.path == '/v1/patches':
            # Claude（这个对话里的我）写给 Cellar 的修改包：Cellar 预览、你点「应用」才生效
            out = []
            for f in sorted(PATCHES.glob('*.json')):
                try:
                    out.append({'name': f.name, 'patch': json.loads(f.read_text(encoding='utf-8'))})
                except (OSError, json.JSONDecodeError) as e:
                    out.append({'name': f.name, 'error': str(e)})
            return self._send(200, {'ok': True, 'patches': out})
        return self._send(404, {'error': 'not found'})

    def do_POST(self):
        if not self._allowed():
            return self._send(403, {'error': '口令不对'})
        if self.path == '/v1/state':
            # Cellar 的完整数据：存到 data/cellar_state.json，Claude 直接读这个文件
            write_json(DATA / 'cellar_state.json', self._body())
            return self._send(200, {'ok': True})
        if self.path == '/v1/raw':
            write_json(DATA / 'htr_raw.json', self._body())   # 扩展里存的原始页面（一次全部）
            return self._send(200, {'ok': True})
        if self.path == '/v1/raw-item':
            # 每处理完一页就存一份：data/raw/<网址的哈希>.json，同一页再收录会覆盖
            req = self._body()
            name = hashlib.sha1(str(req.get('url', '')).encode('utf-8')).hexdigest()[:16]
            (DATA / 'raw').mkdir(exist_ok=True)
            write_json(DATA / 'raw' / (name + '.json'), req)
            return self._send(200, {'ok': True})
        if self.path == '/v1/patch-done':
            req = self._body()
            f = PATCHES / Path(str(req.get('name', ''))).name   # 只取文件名，防止路径穿越
            if f.suffix == '.json' and f.exists():
                (PATCHES / 'done').mkdir(exist_ok=True)
                tag = 'applied' if req.get('applied') else 'rejected'
                f.replace(PATCHES / 'done' / f'{f.stem}.{tag}{f.suffix}')
            return self._send(200, {'ok': True})
        if self.path != '/v1/process':
            return self._send(404, {'error': 'not found'})
        job = None
        try:
            req = self._body()
            job = status_add(str(req.get('label') or '处理一页'), str(req.get('kind') or 'page'))
            with LOCK:
                status_start(job)
                print(f"处理中：{req.get('label', '')}  ({req.get('model')}/{req.get('effort')})", flush=True)
                out = run_claude(req['system'], req['prompt'], req['schema'],
                                 req.get('model') or 'opus', req.get('effort') or 'medium')
            print('  完成', flush=True)
            status_done(job, True)
            self._send(200, out)
        except subprocess.TimeoutExpired:
            if job: status_done(job, False, '超过 10 分钟没出结果')
            self._send(504, {'error': '超过 10 分钟没出结果'})
        except Exception as e:  # 把原因原样交给扩展显示
            print('  出错：', e, flush=True)
            if job: status_done(job, False, str(e))
            self._send(500, {'error': str(e)})

    def log_message(self, fmt, *a):
        pass


if __name__ == '__main__':
    if not CLAUDE:
        sys.exit('找不到 Claude Code。装了 Claude 桌面版的话，设置环境变量 SHIZUKU_CLAUDE 指向 claude.exe。')
    if '--login' in sys.argv:
        # 打开交互界面让你登录一次；登录信息由 Claude Code 自己保存，中转之后直接用
        exe = claude_exe()
        print('使用：', exe)
        print('进去后输入  /login  ，选订阅账号登录（会打开浏览器）；完成后输入  /exit  退出。\n')
        sys.exit(subprocess.call([exe]))
    # Python 的 HTTPServer 默认允许端口复用，在 Windows 上会让两个中转同时占着 8787、请求发给旧的那个。
    # 关掉复用：已经有一个在跑时，这里直接报错退出
    ThreadingHTTPServer.allow_reuse_address = False
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        print('8787 端口已经有一个中转在运行了：先关掉旧的那个窗口，再启动这个。')
        input('按回车退出')
        sys.exit(1)
    print('Shizuku 中转已启动  http://%s:%d' % (HOST, PORT))
    print('Claude Code：', CLAUDE)
    print('口令（填到扩展设置里）：', TOKEN)
    print('Cellar 数据同步到：', DATA)
    print('这个窗口开着就行，关掉就停。')
    server.serve_forever()
