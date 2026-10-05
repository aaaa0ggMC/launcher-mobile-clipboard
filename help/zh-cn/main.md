# 移动剪贴板

> 最后更新：2026-10-06

手机上的输入法（比如讯飞离线模式）会禁用自带剪贴板，复制过的东西等于凭空消失。
移动剪贴板把系统剪贴板变成一条**无限瀑布流**：复制过的文字自动落进历史，随时翻、随时
重新复制。历史分**普通**和**私密**两个互相隔离的水槽，私密内容 AI 读取必须先经你授权。

> 一句话上手：在手机上复制一段文字 → 回到 Cockpit → 打开「移动剪贴板」，
> 它已经在最上面了；点卡片上的复制图标就能重新写回系统剪贴板。

## 能做什么

- **无限瀑布流**：卡片按新→旧铺满多列，滚到底自动续页；置顶的永远在最前。
- **双水槽**：`normal` 对 AI 透明；`private` 标记为敏感，AI 读取 / 修改 / 删除 / 清空前都要授权。
- **自动捕获**：界面可见时轮询系统剪贴板，复制的内容自动入历史（安卓 App 默认开，桌面默认关）。
- **疑似凭据自动归私密**：纯数字验证码、带 `password` / `token` 字样、长随机串会自动进 private。
- **整理**：搜索、置顶、编辑、普通 ↔ 私密互移、删除、清空某个水槽。

## 界面速览

| 区域        | 位置     | 说明                                             |
| ----------- | -------- | ------------------------------------------------ |
| 水槽切换    | 工具栏   | 「普通 / 私密」切换当前瀑布流                    |
| 搜索        | 工具栏   | 在当前水槽里按子串筛选                           |
| 捕获 / 新建 | 工具栏   | 捕获 = 读一次系统剪贴板；新建 = 手输一段文本     |
| 卡片        | 页面主体 | 每条记录一张卡，悬停出现复制 / 置顶 / 移动 / 编辑 / 删除 |
| 更多菜单    | 工具栏   | 显示 / 遮挡私密、切换模糊、刷新、清空、设置      |

## 常见操作

### 捕获剪贴板

点工具栏的 **捕获**（或快捷键，见下）读一次系统剪贴板并写入历史。开启「后台自动捕获」后
不需要手动点：界面可见时每 1.5 秒检查一次，内容变了就自动记下。

> 手机后台限制：Android 10+ 只允许**前台**应用读剪贴板，所以复制之后要切回 Cockpit。
> 回到前台的瞬间会自动捕获一次，不会漏。

### 普通 ↔ 私密

- 自动捕获默认写 `normal`；把「自动捕获写入」设成 `private` 就全部进私密。
- 任意卡片点锁形图标即可在两个水槽之间搬运。
- 私密内容默认模糊，点一下卡片或工具栏「显示私密内容」查看。

### 找回后复制

点卡片上的复制图标 → 文本回到系统剪贴板，然后去任意应用粘贴即可。

## 隐私与 AI

- `launcher-mobile-clipboard.private` 是 **敏感** scope：AI 读取 / 写入 / 删除 private 内容时，
  命令注册表会先弹授权窗口，你在窗口里选「允许本次 / 本次执行都允许 / 关闭前都允许」。
- 界面里私密卡片带 `v-privacy` 标签：AI 的快照与截图按标签脱敏，**与你是否点开明文无关**。
- 普通水槽不做限制——介意的东西请放私密水槽。

## 命令行

```bash
launcher-mobile-clipboard.list --sink normal --limit 50          # 列历史（私有 sink 需授权）
launcher-mobile-clipboard.append --text "hello" --sink normal    # 新增一条
launcher-mobile-clipboard.update --id <id> --pinned true         # 置顶 / 改文本 / 换水槽
launcher-mobile-clipboard.delete --id <id>
launcher-mobile-clipboard.clear --sink private
launcher-mobile-clipboard.config-get                              # 读配置
launcher-mobile-clipboard.config-set --config '{"autoCapture":true}'
launcher-mobile-clipboard.stats
launcher-mobile-clipboard.system-read                             # 读主进程系统剪贴板
```

## 常见问题

**点了捕获说「剪贴板是空的」？** 手机上先确认切回了前台（Android 限制后台读剪贴板）；
浏览器里 `navigator.clipboard` 只在 `https` / `localhost` 等安全上下文可用，局域网 `http`
下需要用安卓 App 或桌面端。

**历史存在哪？** `~/.config/LinuxCockpit/launcher-mobile-clipboard/history.json`（本机磁盘）。
数据不加密，介意凭据长期留存的话请定期清空私密水槽。
