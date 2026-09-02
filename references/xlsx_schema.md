# Excel 字段规范

第二轮输出 `fb_monitoring_filtered.xlsx`，主要包含：

- `detail`：正式有效记录。
- `manual_review`：通过基本规模/活跃门槛、但仍需要人工裁决的记录。

## 字段顺序

`phase2_collect_details.js` 中的字段数组是权威顺序。`manual_review` 的公共字段必须与 `detail` 保持同序，复核专属字段只允许追加在公共字段之后。

## 核心字段

包括快照日期、地区、语言、游戏名、群名、URL、group ID、成员数、今日帖子、周新增、活跃指数、规模增速、上月是否存在、action、风险、来源、相关性以及地区判定证据。

## 群名约束

`group_name` 必须是群组的可见名称，不得包含 Facebook 本地化界面的头像、个人资料图片或其他已识别的无障碍包装文本。群名清洗必须在语言和地区判断之前完成。

Phase 1/Phase 2 的原始名称、名称来源和清洗原因属于 JSON 审计字段，不要求插入既有 `detail` 公共列。

## GeoNames 审计字段

连续保存 provider、status、source、query、attempted queries、endpoint、error reason、country code、place name、admin1 和 confidence。

## 语义模型审计字段

保存 provider、model、status、trigger、location intent、scope、confidence、candidate places、explicit regions、reason、cache、provider chain 和 fallback reason。

## 人工复核专属字段

保存语言信号、About 所在地、匹配类型、命中短语、负向命中、复核原因、来源查询、查询变体、seed 标记及变体门槛等。它们必须位于公共字段之后。

## 格式

- 活跃指数：`today_posts / group_size`。
- 规模增速：`week_new_fans / (group_size - week_new_fans)`。
- 两列使用 `0.00%`。
- 缺失值保持空白，不用 0 代替未知。
- URL 保持可点击文本格式。

## 已生成工作簿的名称修复

`repair_avatar_name_pollution_xlsx.js` 可生成新的修复副本，并写入 `name_repair_audit` 工作表。该工具不覆盖源工作簿。需要重新计算完整语言/地区证据时，应重新执行 Phase 2。
