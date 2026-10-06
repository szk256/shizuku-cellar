# Shizuku Cellar

一个**单文件 HTML** 的水烟烟料库存管理器，配一个 Chrome 扩展和一个本地中转，让 **Claude** 帮你整理数据：翻译、总结评论、校对库存，直接改你的数据，并且每一处修改都能撤销。

> A single-file HTML inventory manager for hookah tobacco, with a Chrome extension and a local bridge that lets Claude read, translate and tidy your collection — every change it makes is logged and undoable. UI is in Chinese.

## 有意思的地方

- **单文件应用**：`Cellar.html` 双击就能打开，不用服务器也不用安装。数据嵌在文件里，同时存在浏览器本地。
- **用你自己的 Claude**：扩展可以走两条路
  - **本地中转**（`bridge/`）：在本机调用你已经装好的 Claude Code，只监听 `127.0.0.1`，每个请求要带口令，Claude 在空的临时目录里跑，工具全部关闭。
  - **API Key**：在扩展设置里填你自己的 Anthropic API Key。
- **改动可撤销**：Claude 的修改会自动应用，同时逐条记进日志，可以一条一条撤销；也可以按类别设成"先问我"。
- **柜位**：网格式的多个柜子，每层可以分 2～4 段，每个烟罐都画出来。
- **口味分类树**、按票数加权的评分排序、拼音搜中文名。

## 目录

```
app/          cellar.src.html（程序本体）、build.py（生成 Cellar.html）
extension/    Chrome 扩展（MV3），esbuild 打包
bridge/       本地中转（Python，只用标准库）
examples/     虚构的示例数据
data/         你自己的数据放这里（已被 .gitignore 忽略）
```

## 快速开始

需要 Python 3.9+；扩展需要 Node 18+。

```bash
python app/build.py
```

生成根目录的 `Cellar.html`，直接用浏览器打开。`data/cellar_state.json` 不存在时用 `examples/` 里的示例数据；`--empty` 生成空白版。

### 扩展

```bash
cd extension && npm install && npm run build
```

在 `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」→ 选 `extension/dist`。要让扩展连上本地打开的 `Cellar.html`，还要在扩展详情里打开「允许访问文件网址」。

### 本地中转（可选）

需要本机装好并登录 [Claude Code](https://claude.com/claude-code)。

```bash
python bridge/shizuku_bridge.py
```

第一次运行会生成 `bridge/token.txt`，把里面的口令填进扩展设置。找不到 `claude` 的话，用环境变量 `SHIZUKU_CLAUDE` 指定 `claude.exe` 的路径。

## 关于 HTReviews

扩展只处理**你自己在浏览器里打开的** htreviews.org 页面，不爬站，也不自动点击或翻页。本仓库不包含该网站的任何内容。请遵守该网站的使用条款。

## 注意

- 这是个人项目，按原样提供，不保证维护。
- 用中转或 API 产生的 Claude 用量算在你自己的账户上，请自行确认符合 Anthropic 的使用条款。

## License

[MIT](LICENSE)
