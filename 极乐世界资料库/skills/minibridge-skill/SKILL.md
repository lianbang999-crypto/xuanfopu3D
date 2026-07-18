# MintBridge - 不用翻墙，一键安装 Mint Blender 插件

> 还在为 GitHub 打不开而烦恼吗？这个 Skill 帮你把 Mint Blender 插件直接送到手上，附完整中文教程，小白也能 3 分钟搞定！

---

## 这是什么插件？

Mint 是一个 AI 生成 3D 资产的平台 (https://mint.gg)，你用文字描述就能生成 3D 模型和 3D 世界场景。而 Mint Blender Addon 让你直接在 Blender 里浏览和导入这些资产，完全不用离开 Blender。

支持的功能包括：账号登录、浏览模型/世界/资产包、一键导入 GLB 模型、通过 Kiri 引擎查看 3DGS Splat 世界。

---

## 前提条件

- Blender 4.2 或更新版本 (https://www.blender.org/download/)
- 一个 Mint 账号 (https://mint.gg 免费注册)
- Python 3.8+（运行安装脚本用）
- Kiri Engine 3DGS Render（可选，仅查看世界 Splat 需要）

---

## 安装三步走

### Step 1 - 获取插件文件

在 QoderWork 里直接说"帮我安装 Mint Blender 插件"即可，它会自动运行安装脚本。

或者手动运行：

```
python install_addon.py
```

脚本会自动从三个来源尝试下载（GitHub API > GitHub 直接链接 > 内置离线包），全程自动校验 SHA256，确保文件安全。即使完全无法访问 GitHub，内置离线包也能保证你一定能装上。

### Step 2 - 在 Blender 中安装

1. 打开 Blender
2. 菜单 `Edit` > `Preferences` > `Add-ons`
3. 点击右上角 `Install...`
4. 选择 `mint_blender_asset_browser-0.1.0.zip`
5. 勾选启用 `Mint Asset Browser`
6. 回到 3D 视图，按 `N` 键打开侧边栏，点击 `Mint` 标签

### Step 3 - 登录并开始使用

1. 点击 `Log In`，浏览器自动打开 Mint 登录页
2. 登录后回到 Blender，点 `Refresh` 刷新
3. 在 Models / Worlds / Packs 之间切换浏览
4. 模型点 `Import GLB` 导入场景，世界点 `View Splat` 查看

---

## 功能详解

### 账号管理

面板顶部是账号区域，三个按钮：`Log In` 登录、`Log Out` 登出、`Refresh` 刷新资产列表。登录状态会持久化，下次打开 Blender 会自动恢复。

### 模型 (Models)

展示你在 Mint 上生成的所有 3D 模型。每个模型有缩略图和名称，点击 `Import GLB` 就能导入。导入时会自动缓存到本地，重复导入不用重新下载。

### 世界 (Worlds)

展示 3D 世界场景。点击 `View Splat` 会导出 PLY 文件并通过 Kiri Engine 导入为 3DGS 对象。导入过程会显示进度：Preparing > Converting > Downloading > Importing。需要 Kiri 插件。

### 资产包 (Packs)

展示你创建的资产集合。点击 `Open Pack` 查看包内所有模型，每个都可以单独导入。

### Splat 控制

导入世界 Splat 后，Active Splat 面板提供：

- `Render Mode` - Kiri 相机更新预览，移动视角时实时渲染
- `Point Cloud` - 可编辑点云模式，支持选择/移动/旋转/缩放
- `Point Size` + `Finer` - 调整点云显示精度
- `Update View` - 手动更新渲染视角
- `Auto Update` - 自动跟随视口变化（每 3 秒检测一次）

---

## 常见问题

**Q: Blender 里看不到 Mint 标签？**
确认 Blender 版本 >= 4.2，去 Add-ons 页面检查插件是否勾选启用。

**Q: 登录时浏览器打开了但没反应？**
在浏览器完成登录后，页面会提示 "Mint authorization complete"，此时回到 Blender 即可。如果长时间无反应，检查网络是否能访问 mint.gg。

**Q: 模型显示 "No durable GLB yet"？**
模型还在处理中，稍等一会儿点 Refresh 刷新再试。

**Q: World Splat 导入时 Blender 卡住了？**
Kiri 导入大场景可能耗时较长，属于正常现象。查看 `~/.cache/mint-blender/logs/kiri-bridge.log` 了解进度。

**Q: 导入的模型位置/大小不对？**
GLB 模型用 G/S/R 快捷键调整。World Splat 会自动校正方向和缩放。

**Q: 在中国大陆无法访问 GitHub？**
这正是 MintBridge 解决的痛点。安装脚本内置离线安装包，无需网络即可获取插件。

---

## 本地存储

插件会在本地存储以下数据，删除对应目录即可清除：

- `~/.cache/mint-blender/` - GLB/PLY/缩略图缓存
- `~/.config/mint-blender/oauth.json` - 登录令牌
- `~/.cache/mint-blender/logs/kiri-bridge.log` - 调试日志

---

## Kiri Engine 安装（可选）

如需查看 World Splat，需额外安装 Kiri Engine 3DGS Render：

1. 从 https://github.com/Kiri-Innovation/3dgs-render-blender-addon 下载 zip
2. 在 Blender 中通过 Add-ons > Install 安装并启用

仅导入 GLB 模型不需要 Kiri。

---

## 相关链接

- Mint 平台: https://mint.gg
- Blender 下载: https://www.blender.org/download/
- Kiri Engine: https://github.com/Kiri-Innovation/3dgs-render-blender-addon
- 插件源码: https://github.com/tamg/mint-blender-addon

---

`#MintBlender` `#Blender插件` `#AI3D` `#3D建模` `#Blender教程` `#MintBridge` `#不用翻墙` `#GitHub替代` `#3DGS` `#AI生成`
