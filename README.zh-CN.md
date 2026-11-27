# woslicer-dx

[English](README.md) · **中文** · [日本語](README.ja.md) · [한국어](README.ko.md)

基于 wosderge 的 woslicerIII 开发的离线 BMS 音频切片工具。

> **[打开网页版](https://woslicer-dx.pages.dev/)** · 无需安装，音频在本机处理。

![主界面](docs/screenshots/main-ui.png)

## 功能

- 导入 WAV、AIFF、FLAC、Ogg Vorbis、MP3、AAC-LC 和 ALAC。可读取 MKV/MKA 中兼容编码的音频。内部使用 Float32，WAV 切片使用 16 位 PCM。
- 保存和打开 `.wosdx` 工程，导入、导出旧版 `.wos` 设置，通过剪贴板与 BMSE 交换切点。
- 时间轴编辑、吸附、框选、量化、撤销与重做。
- 变速播放、提示音和敲击校准。
- 使用键盘、Xbox 或 YuanCon 控制器录制切点，在 `.wosdx` 工程中保留键号和组合键。
- 通过命令轮盘执行常用命令：手柄按住 LT，键盘按住 R。
- 一个工程可含多条音轨，每条音轨有自己的切点、检测和输出设置。切点可以在音轨间共享和链接。
- 频段显示与自动切点检测。
- 内置 BMHelper：将键音 MIDI 分割为录音序列和 WAVE 定义，切点可应用到时间轴。
- 读写原版 BMHelper beta 4′ 的 `.bmh` 文件。DX 工程保留 Unicode 分割名称。BMH 导出沿用原版 CP932 字符替换规则，名称变化时显示警告。
- 中、英、日、韩四种界面语言。“关于”显示版本、提交和构建日期。

## 运行

从 [Releases](https://github.com/gumi-conqueror/woslicer-dx/releases) 或 [Actions 附件](https://github.com/gumi-conqueror/woslicer-dx/actions/workflows/build.yml)下载对应系统的软件包：

| 平台 | 格式 | 使用方式 |
| --- | --- | --- |
| Windows | .zip | 解压后直接运行。需要已安装 WebView2 |
| Linux | .deb / .AppImage | 安装 deb 或运行 AppImage |
| macOS | .dmg | 打开磁盘映像，将应用拖入“应用程序” |
| Web | .zip | 解压后作为静态网站托管 |

桌面版以 Windows x64 为主，其他 Windows 架构、Linux 和 macOS 软件包在可用时提供。文件在本机处理，运行时无需联网。

## 操作

桌面版工程保存音频绝对路径，打开时自动关联可用文件。文件移动后使用“重新关联音频”，网页版需手动关联。工作区显示恢复和音频加载进度。

**帮助 → 使用帮助与快捷键** 包含操作步骤、鼠标操作、快捷键和敲击校准说明，可离线查看。

## 项目链接

[变更日志](CHANGELOG.zh-CN.md) · [开发文档](docs/README.md) · [参与开发](CONTRIBUTING.md)

## 许可与署名

[MIT](LICENSE) · [致谢](NOTICE)
