# 抖音视频下载（Douyin Downloader）

一个用于抖音网页视频下载脚本，支持下载当前视频，以及在个人主页中批量扫描后按需勾选下载。

如果这个脚本对你有帮助，欢迎在 GitHub 点一个 Star。

## 功能特性

- 下载当前打开的抖音网页视频
- 在个人主页扫描视频列表后，勾选任意视频批量下载
- 单个下载与批量下载分别使用更清晰的文件命名
- 提供可拖动的侧边下载按钮
- 提供单视频下载进度与批量扫描状态提示


## 最近更新

当前版本：`1.7.50`

### 1.7.50

- 为 `recommend=1` 推荐页新增独立下载解析逻辑，只读取当前页面播放器 `unsafeWindow.player`，避免被 `nextPlayer` 或预加载资源串台。
- 推荐页禁用 performance 预加载 URL 作为当前视频结果，改为当前播放器、独立视频页和详情接口的受控兜底顺序。

### 1.7.49

- 优先使用播放器中的 `downloadUrl`、`videoUrl`、`config.url` 候选地址，减少下载到无声音 video-only 文件的情况。
- 当没有可用的合并 MP4 候选地址时，保留 DASH definition 地址作为兜底。

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
