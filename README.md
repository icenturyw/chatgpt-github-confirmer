# ChatGPT GitHub Confirmer

> ChatGPT 中 GitHub 文件操作确认弹窗的自动批准浏览器扩展。

[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue)](https://chromewebstore.google.com/)

---

## 简介 / Introduction

ChatGPT 的 GitHub Action 功能（创建/更新文件）会弹出确认对话框。本扩展可以：

- 自动检测 ChatGPT 页面中的 GitHub 确认弹窗
- 根据配置的仓库、分支、文件规则自动批准
- 首次手动批准后只记住当前匹配规则，避免意外扩大到整仓库
- 在页面右下角显示浮动状态条，提示是否即将自动确认
- 支持 `Alt+Shift+Y` 快捷键手动确认
- 默认初始化为本仓库 `icenturyw/chatgpt-github-confirmer`，可在面板或选项页调整

---

## 安装 / Install

1. 打开 Chrome: `chrome://extensions/`
2. 开启开发者模式（Developer mode）
3. 点击“加载已解压的扩展程序”（Load unpacked）
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

在扩展详情页点击 “Extension options” 进入：

- 添加/删除细粒度规则（仓库、分支、文件）
- 分支留空或设为 `*` 表示匹配任意分支
- 文件留空或设为 `*` 表示匹配该仓库任意文件
- 保存时会跳过不符合 `owner/repository` 格式的无效规则

### 键盘快捷键 / Keyboard Shortcut

默认快捷键：`Alt+Shift+Y`，可前往 `chrome://extensions/shortcuts` 自定义。

---

## 默认规则 / Default Rule

首次安装时会初始化一条仓库级规则，后续用户删除或修改后不会被内容脚本反复写回。

| 配置项 | 值 |
|--------|-----|
| 仓库 | `icenturyw/chatgpt-github-confirmer` |
| 分支 | 任意 |
| 文件 | 任意 |

---

## 安全与行为说明 / Safety Notes

- “记住规则”只保存当前匹配到的仓库、分支、文件范围；只有规则本身是仓库级通配时，才会形成仓库级信任。
- 确认按钮兜底查找会排除 `Cancel`、`Deny`、`Details` 等按钮，降低误点详情按钮或拒绝按钮的概率。
- 快捷键消息发送失败时会静默忽略普通的“接收端不存在”场景，避免在非 ChatGPT 页面产生无用错误。

---

## 项目结构 / Project Structure

| 文件 | 说明 |
|------|------|
| `manifest.json` | 扩展清单（Manifest V3） |
| `content.js` | 内容脚本：检测弹窗、规则匹配、自动点击、浮动 UI |
| `background.js` | 后台服务：管理安装初始化、监听键盘快捷键 |
| `popup.html` / `popup.js` | 弹出面板 UI 与仓库级配置 |
| `options.html` / `options.js` | 选项页 UI 与细粒度规则配置 |

---

## 版本记录 / Changelog

### 1.2.1

- 修复内容脚本仍会写回旧默认仓库的问题
- 内容脚本仅在配置不存在时初始化默认仓库，避免用户删除规则后被反复恢复
- 自动确认按钮兜底匹配排除详情按钮，进一步降低误点风险

### 1.2.0

- 默认仓库从旧项目统一调整为 `icenturyw/chatgpt-github-confirmer`
- 初始化逻辑不再在用户删除规则后反复写回默认仓库
- 手动记住规则时不再自动放大为整仓库信任
- 选项页保存时会规范化并跳过无效仓库规则
- 确认按钮兜底匹配排除详情按钮，降低误点击风险

---

## 许可 / License

MIT
