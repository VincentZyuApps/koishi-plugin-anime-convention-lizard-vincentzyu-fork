# B站会员购接口说明

`漫展B` 使用 B站会员购的网页接口查询地区活动。该接口不是公开稳定 SDK；实现按当前网页请求行为整理，需容忍字段和限制变化。

## 列表接口

```text
GET https://show.bilibili.com/api/ticket/project/listV2
```

插件请求参数：

| 参数 | 含义 | 当前行为 |
| --- | --- | --- |
| `version` | 网页接口版本 | 固定 `134` |
| `page` | 页码 | 固定 `1` |
| `pagesize` | 返回数量 | 固定 `20` |
| `area` | 六位行政区划代码 | 由 `src/area.ts` 解析地区名 |
| `filter` | 网页筛选字段 | 固定空字符串 |
| `platform` | 平台 | 固定 `web` |
| `p_type` | 请求频道 | `展览`、`演出`、`本地生活`；混合流不传此项 |

请求带 JSON `Accept`、会员购页面 `Referer` 与浏览器 `User-Agent`。

### 已知接口限制

- `pagesize` 大于 `20` 会被接口拒绝。
- `page=2` 当前会重复第一页，插件因此只请求第一页。
- `filter` 当前未观察到稳定筛选效果，体裁筛选在插件本地完成。
- 每个“地区 + 频道”最多得到 20 项；`--fanout` 可展开市辖区并合并去重。

## 详情接口

```text
GET https://show.bilibili.com/api/ticket/project/getV2
```

参数：

| 参数 | 含义 |
| --- | --- |
| `version` | 固定 `134` |
| `id`、`project_id` | 活动项目 ID |
| `requestSource` | 固定 `pc-new` |

列表不稳定提供嘉宾信息。用户回复序号查看详情时，插件才调用详情接口，将 `data.guests` 补入详情输出和图片，避免列表查询产生 N+1 请求。

## 范围、频道与体裁

| 指令范围 | 请求频道 | 本地体裁过滤 |
| --- | --- | --- |
| `漫展` | 展览、混合 | 漫展、Only同人展、IP展览、其他展览 |
| `展览` | 展览 | 不过滤 |
| `演出` | 演出 | 不过滤 |
| `本地生活` | 本地生活 | 不过滤 |
| `全部` | 展览、演出、本地生活、混合 | 不过滤 |
| `自定义` | 控制台配置 | 控制台配置；留空则不按体裁过滤 |

所有结果按 `start_unix` 升序排序，再按 `project_id` 去重，并受 `biliMaxResults` 限制。B站的默认范围为 `漫展`，订阅只保存地区，不保存范围。

## 字段转换

| B站字段 | 插件字段 | 说明 |
| --- | --- | --- |
| `project_id`、`id` | `projectId` | 去重与详情查询 ID |
| `project_name` | `name` | 活动名称 |
| `city`、`district_name` | `location` | 地区展示 |
| `venue_name` | `address` | 场馆名称 |
| `start_time`、`end_time` | `time` | 活动时间 |
| `third_category_name` | `category`、`tag` | 体裁与标签 |
| `wish`、`wish_text` | `wannaGoCount` | 想去人数 |
| `cover` | `appLogoPicUrl` | `//` 开头地址补为 HTTPS |
| `jump_url` | `url` | 售票链接；缺失时使用会员购详情页 |

## 失败边界

- 一个频道请求失败会记录警告并继续合并其他频道；全部频道失败才报告查询失败。
- 地区无法映射为六位行政区划代码时不会发送请求，会提示使用地区名。
- B站结果为空时，可尝试更大地区、`--fanout` 或 `--scope 全部`。
