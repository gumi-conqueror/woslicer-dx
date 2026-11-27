# woslicer-dx

[English](README.md) · [中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md)

wosderge の woslicerIII を基にした、BMS 向けオフライン音声分割ツール。

> **[Web 版を開く](https://woslicer-dx.pages.dev/)** · インストール不要。音声は端末内で処理。

![メイン画面](docs/screenshots/main-ui.png)

## 機能

- WAV、AIFF、FLAC、Ogg Vorbis、MP3、AAC-LC、ALAC の読み込み。MKV/MKA 内の対応形式の音声も読み込み可能。内部処理は Float32、区間ごとの WAV 出力は 16-bit PCM。
- `.wosdx` プロジェクトの保存・読み込み、旧形式 `.wos` 設定の入出力。BMSE とはクリップボードで分割点を交換。
- スナップ、範囲選択、クオンタイズ、元に戻す／やり直しを備えたタイムライン編集。
- 速度を変えた試聴、合図音、入力タイミングの補正。
- キーボード、Xbox、YuanCon コントローラーで分割点を記録。キー番号と同時押しを `.wosdx` に保存。
- コマンドホイールでよく使うコマンドを実行。コントローラーは LT、キーボードは R を長押し。
- 1 プロジェクトに複数のオーディオトラック。トラックごとに分割点、検出、出力設定を保持。分割点はトラック間で共有・リンク可能。
- 周波数帯域の表示と分割点の自動検出。
- 内蔵 BMHelper で鍵盤音用 MIDI パートを録音シーケンスと WAVE 定義に分割。分割点を時間軸に適用可能。
- 原版 BMHelper beta 4′ の `.bmh` ファイルの読み書きに対応。DX プロジェクトは Unicode の分割名を保持。BMH 出力では原版の CP932 文字置換を適用し、名前が変わる場合は警告を表示。
- 英語・中国語・日本語・韓国語の UI。「バージョン情報」にバージョン、コミット、ビルド日時を表示。

## 実行

[Releases](https://github.com/gumi-conqueror/woslicer-dx/releases) または [Actions の成果物](https://github.com/gumi-conqueror/woslicer-dx/actions/workflows/build.yml)から、使用する OS 向けのパッケージをダウンロード。

| プラットフォーム | 形式 | 使い方 |
| --- | --- | --- |
| Windows | .zip | ZIP を展開して起動。WebView2 が必要 |
| Linux | .deb / .AppImage | deb をインストール、または AppImage を実行 |
| macOS | .dmg | ディスクイメージを開き、アプリを「アプリケーション」にドラッグ |
| Web | .zip | 展開して静的サイトとして配信 |

主要なデスクトップ版は Windows x64。その他の Windows アーキテクチャ、Linux、macOS 向けは提供可能な場合に同梱。ファイルは端末内で処理し、オフラインで動作する。

## 操作

デスクトップ版のプロジェクトは音源の絶対パスを保存し、開くときに利用可能なファイルを自動で再接続する。ファイルを移動した場合は「音源を再接続」を使用。ブラウザー版では手動での再接続が必要。作業の復元中や音源の読み込み中は、作業領域の上部に進行状況を表示。

**ヘルプ → 使い方とショートカット** に操作手順、マウス操作、キー一覧、入力補正の方法を掲載。オフラインで参照可能。

## プロジェクト情報

[変更履歴](CHANGELOG.md) · [開発資料（英語）](docs/README.md) · [開発への参加（英語）](CONTRIBUTING.md)

## ライセンスと謝辞

[MIT](LICENSE) · [謝辞・使用ソフトウェア](NOTICE)
