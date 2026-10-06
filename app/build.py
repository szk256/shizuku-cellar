"""生成 ../Cellar.html：拿 cellar.src.html（程序本体，直接改这个文件），
把 ../data/cellar_state.json（Cellar 最近一次同步到电脑的数据）嵌进去当「内置数据」。
这样 Cellar.html 自带最新数据：换电脑、清了浏览器数据也能直接打开。
data/ 里还没有数据时，改用 ../examples/cellar_state.example.json（虚构的示例）。

用法:  python build.py            # 用 data/，没有就用示例
       python build.py --empty    # 不嵌任何数据，生成一个空白的 Cellar
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / 'cellar.src.html'
OUT = HERE.parent / 'Cellar.html'
STATE = HERE.parent / 'data' / 'cellar_state.json'
EXAMPLE = HERE.parent / 'examples' / 'cellar_state.example.json'

VARS = {'DATA': 'BUILTIN_DATA', 'AXES': 'BUILTIN_AXES', 'ROLES': 'ROLES_DEFAULT', 'LOGS': 'BUILTIN_LOGS',
        'PREFS': 'BUILTIN_PREFS', 'STAMP': 'BUILTIN_STAMP', 'BRANDS': 'BUILTIN_BRANDS', 'IGNORE': 'BUILTIN_IGNORE',
        'LAYOUT': 'BUILTIN_LAYOUT', 'HTR': 'BUILTIN_HTR'}


def put(html, tag, val):
    re_ = re.compile(r'/\*<<<' + tag + r'\*/[\s\S]*?/\*' + tag + r'>>>\*/')
    if not re_.search(html):
        return html   # 新版删掉了这一块（比如角色、配方记录），就不嵌
    js = json.dumps(val, ensure_ascii=False).replace('</', '<\\/')   # 防止数据里的 </script> 提前结束脚本
    return re_.sub(lambda m: '/*<<<' + tag + '*/var ' + VARS[tag] + '=' + js + ';/*' + tag + '>>>*/', html, count=1)


def main():
    html = SRC.read_text(encoding='utf-8')
    state = None if '--empty' in sys.argv else STATE if STATE.exists() else EXAMPLE
    if state and state.exists():
        print('数据来源：', state.name)
        s = json.loads(state.read_text(encoding='utf-8'))
        d = s['d']
        for tag, key in [('DATA', 'db'), ('AXES', 'axTree'), ('ROLES', 'roles'), ('LOGS', 'logs'), ('PREFS', 'prefs'),
                         ('BRANDS', 'brands'), ('IGNORE', 'ignore'), ('LAYOUT', 'layout'), ('HTR', 'htr')]:
            if key in d:
                html = put(html, tag, d[key])
        html = put(html, 'STAMP', s.get('t', ''))
        print('嵌入数据：', len(d.get('db', [])), '条，', s.get('t'))
    OUT.write_text(html, encoding='utf-8', newline='\n')
    v = re.search(r"APP_VERSION='([^']+)'", html)
    print('写出', OUT, len(html), '字符', 'v' + (v.group(1) if v else '?'))


if __name__ == '__main__':
    main()
