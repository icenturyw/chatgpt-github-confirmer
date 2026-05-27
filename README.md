# ChatGPT GitHub Confirmer

> ChatGPT 中 GitHub 文件操作确认弹窗的自动批准浏览器扩展
> 一款 Chrome 扩展，自动批准 ChatGPT 中 GitHub 文件创建/更新的确认弹窗。

[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue)](https://chromewebstore.google.com/)

---

## 简介 / Introduction

ChatGPT 的 GitHub Action 功能（创建/更新文件）会弹出确认对话框。本扩展可以：

- 自动检测 ChatGPT 页面中的 GitHub 确认弹窗
- 根据配置的仓库、分支、文件规则自动批准
- 首次手动批准后记住规则，后续自动点击
- 在页面右下角显示浮动状态条，提示是否即将自动确认
- 支持 `Alt+Shift+Y` 快捷键手动确认

---

## 安装 / Install

1. 打开 Chrome: `chrome://extensions/`
2. 开启开发者模式（Developer mode）
3. 点击"加载已解压的扩展程序"（Load unpacked）
4. 选择本项目文件夹

修改代码后，在 `chrome://extensions/` 中重新加载扩展。

---

## 使用方法 / Usage

### 快速面板（Popup）

点击工具栏扩展图标打开面板：

- **Auto-allow all repositories** — 开启后自动批准所有检测到的 GitHub 确认弹窗
- **仓库列表** — 添加 `owner/repository` 格式的仓库，仅对这些仓库自动批准
- **Clear remembered approvals** — 清除已记住的信任规则

### 选项页（Options Page）

在扩展详情页点击"Extension options"进入：

- 添加/删除细粒度规则（仓库、分支、文件）
- 分支留空或设为 `*` 表示匹配任意分支
- 文件设为 `*` 表示匹配该仓库任意文件

### 键盘快捷键 / Keyboard Shortcut

默认快捷键：`Alt+Shift+Y`，可前往 `chrome://extensions/shortcuts` 自定义。

---

## 默认规则 / Default Rule

| 配置项 | 值 |
|--------|-----|
| 仓库 | `*`（可通过面板配置） |
| 分支 | 任意 |
| 文件 | 任意 |

---

## 项目结构 / Project Structure

| 文件 | 说明 |
|------|------|
| `manifest.json` | 扩展清单（Manifest V3） |
| `content.js` | 内容脚本：检测弹窗、自动点击、浮动 UI |
| `background.js` | 后台服务：管理安装初始化、监听键盘快捷键 |
| `popup.html` / `popup.js` | 弹出面板 UI |
| `options.html` / `options.js` | 选项页 UI |

---

## 许可 / License

MIT
