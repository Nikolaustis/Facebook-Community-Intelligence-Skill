# 质量检查清单

## 输入与启动

- [ ] index、config、shutdown policy 和所有 candidate JSON 已通过输入验证。
- [ ] JSON 编码可正常读取，UTF-8 BOM 或 UTF-16 不造成解析失败。
- [ ] 后台启动必须产生新的可读进度文件。
- [ ] 启动失败时保存退出码和 stderr 信息。

## Phase 1

- [ ] 每个游戏独立搜索。
- [ ] 主搜索路由无候选时尝试备用 Groups 搜索路由。
- [ ] 不因卡片缺少检索词而在第一轮硬删除 Facebook 返回的群组链接。
- [ ] source query、query variant 和群名来源完整保存。
- [ ] 群名优先采用可见标题/链接，`aria-label` 与图片 `alt` 只作低优先级兜底。
- [ ] 零候选时保存诊断 JSON、HTML 和截图。

## Phase 1.5

- [ ] 在 About/讨论页访问之前完成全部候选的离线预筛。
- [ ] `phase2_collect_details.js` 从原始 `phase1_index.json` 启动时自动执行或复用 Phase 1.5。
- [ ] 原始 Phase 1 索引和候选文件未被覆盖。
- [ ] seed、缺名、截断群名仍进入页面核验。
- [ ] IP-root-only 和 sibling-only 默认不会混入正式第二轮队列。
- [ ] 英文标题可直接连接中文、泰文等非拉丁文字。
- [ ] 拉丁或数字续接不会误命中较短目标，例如 `GAG` 不命中 `GAG2`、`gags`、`9GAG`。

## Phase 2

- [ ] 每个候选完成后写入完整 checkpoint。
- [ ] 群名在预筛、语言识别、地区判断和 XLSX 输出前均经过清洗。
- [ ] About 页有效标题可覆盖低质量的 Phase 1 无障碍标签名称。
- [ ] `group_name` 不包含 `的头像`、`profile picture`、`のプロフィール写真`、`프로필 사진` 等 UI 包装。
- [ ] 多游戏群组按 `group_url + game_name` 分别保留。
- [ ] 同一 URL、同一游戏的重复行只保留最高分记录。

## 语言与地区

- [ ] UI 文案没有被识别为玩家语言。
- [ ] 群名中的明确语言/国家证据未被无关讨论样本覆盖。
- [ ] 同一业务区域内的多个国家证据保留 same-business-region 来源。
- [ ] 风险词先经语义裁决/安全过滤，再决定是否调用 GeoNames。
- [ ] GeoNames 查询不包含游戏名残词、交易词或普通社群词。

## XLSX

- [ ] `detail` 和 `manual_review` 公共列顺序一致。
- [ ] 人工复核专属列位于公共列之后。
- [ ] 活跃指数和规模增速使用百分比格式。
- [ ] 缺失值保持空白。
- [ ] 最终 workbook、summary、collision、audit、debug rows 均存在。

## 完成与关机

- [ ] Chrome 只在最终文件校验后关闭。
- [ ] 默认不关机。
- [ ] 仅在用户当前任务明确要求并通过 verifier 时执行关机。
- [ ] 计划任务完成后清理自身任务定义。
