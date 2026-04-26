# 抖音视频下载（Douyin Downloader）

一个用于抖音网页视频下载脚本，支持下载当前视频，以及在个人主页中批量扫描后按需勾选下载。

## 功能特性

- 下载当前打开的抖音网页视频
- 在个人主页扫描视频列表后，勾选任意视频批量下载
- 单个下载与批量下载分别使用更清晰的文件命名
- 提供可拖动的侧边下载按钮
- 提供单视频下载进度与批量扫描状态提示


## 最近更新

当前版本：`1.7.48`

### 1.7.48

- Fixed recommendation feed downloads by reading the active page player through `unsafeWindow.player.curDefinition`.
- Added alternate URL retry for player definitions and rejected tiny/error responses before saving files.
- Fixed liked/favorite/history modal downloads by using the scoped active player before stale document/cache entries.
- Kept profile batch download limited to actual profile work grids, so `user/self` feed tabs continue to behave as single-video pages.

### 1.7.25

- 带 `modal_id` 的页面在单视频下载时，优先使用按目标视频 ID 命中的缓存记录
- 减少喜欢、收藏、推荐和精选页面继续落到 demo 视频的问题

### 1.7.24

- 带 `modal_id` 的喜欢页、收藏页和个人页弹层，在无精确命中记录时优先使用当前文档解析结果
- 修复部分 `user/self` 页面仍回退到服务端 demo 视频的问题

## 安装

先安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。

然后通过 Greasy Fork 安装脚本：

[安装 抖音视频下载（Douyin Downloader）](https://greasyfork.org/zh-CN/scripts/574899-douyin-downloader)

## 使用方式

### 单个视频下载

1. 打开任意抖音视频页面
2. 点击右侧悬浮下载按钮
3. 等待左侧状态提示完成后开始下载

### 个人主页批量下载

1. 打开任意抖音个人主页
2. 点击右侧悬浮下载按钮
3. 等待脚本扫描并解析主页视频
4. 在弹出的批量窗口中勾选需要下载的视频
5. 点击 `Download selected` 开始下载

### 按钮位置调整

- 按住右侧悬浮按钮拖动，可以调整按钮位置

## 反馈

如发现 Bug 或希望增加功能，欢迎提交 Issue 或 PR：

- GitHub: https://github.com/W-ArcherEmiya/TikTok-downloader.git
