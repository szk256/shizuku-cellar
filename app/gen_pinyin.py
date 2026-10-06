"""生成拼音表（给「拼音搜中文名」用）：GB2312 里的 6763 个常用汉字 → 不带声调的拼音，按拼音分组压缩成一行字符串。
输出 pinyin_table.js（var PY_TABLE="a:阿啊…|ai:哀…"），由 build 前手动贴进 cellar.src.html 的 PYTABLE 标记里。
用法：python gen_pinyin.py   （需要 pip install pypinyin）"""
from pathlib import Path
from pypinyin import lazy_pinyin, Style

chars = []
for hi in range(0xB0, 0xF8):          # GB2312 一级 + 二级汉字区
    for lo in range(0xA1, 0xFF):
        try:
            c = bytes([hi, lo]).decode('gb2312')
        except UnicodeDecodeError:
            continue
        chars.append(c)
groups = {}
for c in chars:
    py = lazy_pinyin(c, style=Style.NORMAL, errors='ignore')
    if py and py[0].isalpha():
        groups.setdefault(py[0].replace('ü', 'v'), []).append(c)
line = '|'.join(k + ':' + ''.join(v) for k, v in sorted(groups.items()))
out = Path(__file__).parent / 'pinyin_table.js'
out.write_text('var PY_TABLE="' + line + '";', encoding='utf-8')
print(len(chars), 'chars', len(groups), 'syllables', len(line.encode('utf-8')) // 1024, 'KB')
