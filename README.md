# Shizuku Cellar

一个**单文件 HTML** 的水烟烟料库存管理器，配一个 Chrome 扩展和一个本地中转，让 **Claude** 帮你整理数据：翻译、总结评论、校对库存，直接改你的数据，并且每一处修改都能撤销。

> A single-file HTML inventory manager for hookah tobacco, with a Chrome extension and a local bridge that lets Claude read, translate and tidy your collection — every change it makes is logged and undoable. UI is in Chinese.

## 有意思的地方

- **单文件应用**：`Cellar.html` 双击就能打开，不用服务器也不用安装。数据嵌在文件里，同时存在浏览器本地。
- **用你自己的 Claude**：扩展可以走两条路
  - **API Key**（默认，推荐）：在扩展设置里填你自己的 Anthropic API Key，按量付费。
  - **本地中转**（`bridge/`，仅供个人使用）：在本机调用你自己已登录的 Claude Code。只监听 `127.0.0.1`，每个请求要带口令；Claude 在空的临时目录里跑，工具全部关闭。详见下面的[合规说明](#合规说明)。
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

然后在扩展设置里填你的 API Key（在 [Claude Console](https://platform.claude.com/) 创建）。

### 本地中转（可选，仅供个人使用）

用之前请先读[合规说明](#合规说明)。需要本机装好并**用你自己的账号**登录 [Claude Code](https://claude.com/claude-code)。

```bash
python bridge/shizuku_bridge.py
```

第一次运行会生成 `bridge/token.txt`，把里面的口令填进扩展设置，并把「用什么处理」改成「本地中转」。找不到 `claude` 的话，用环境变量 `SHIZUKU_CLAUDE` 指定 `claude.exe` 的路径。

## 合规说明

本项目和 Anthropic 没有任何关联，也没有得到 Anthropic 的认可。Claude 是 Anthropic 的商标。

- **API Key 模式**是 Anthropic 给第三方工具推荐的方式：用量按你自己的 Key 计费。
- **本地中转**是为作者个人在自己电脑上使用而写的。它的工作方式是：
  - 原样调用官方的 `claude` 程序，不修改它，也不绕过它；
  - 登录走 Anthropic 自己的流程（`--login` 只是打开 `claude`）；
  - **不读取、不保存、不转发**任何 Claude 账号的凭证或 OAuth token；
  - 只在本机运行，不对外提供服务；一次只处理一个请求。
- 但请注意：
  - Anthropic 规定，订阅（Free / Pro / Max）的登录方式**只用于 Claude Code 和 Anthropic 自家应用的正常个人使用**；第三方开发者不得代用户走订阅凭证。
  - 自 2026 年 4 月起，第三方工具产生的用量会从「额外用量」里扣，不算在订阅额度内。
  - 本项目这种"调用本机官方 CLI"的方式是否算第三方工具，官方没有明确说法。**请自行阅读条款并自行判断，后果自负。**不确定就用 API Key。
- 参考：[Claude Code 法律与合规](https://code.claude.com/docs/en/legal-and-compliance) · [Anthropic 使用政策](https://www.anthropic.com/legal/aup) · [消费者条款](https://www.anthropic.com/legal/consumer-terms)

请不要把本地中转部署成给别人用的服务，也不要把它改成能读取或分享账号凭证的样子。

## 关于 HTReviews

扩展只处理**你自己在浏览器里打开的** htreviews.org 页面，不爬站，也不自动点击或翻页。本仓库不包含该网站的任何内容。请遵守该网站的使用条款。

## 注意

- 这是个人项目，按原样提供，不保证维护。
- 用 API 或中转产生的 Claude 用量都算在你自己的账户上。

## License

[MIT](LICENSE)
