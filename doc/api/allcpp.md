# Allcpp 接口说明

`漫展` 命令直接请求无差别同人站，不经过插件自建代理。

## 列表接口

```text
GET https://www.allcpp.cn/allcpp/event/eventMainListV2.do
```

插件固定携带以下查询参数：

| 参数 | 含义 | 当前值 |
| --- | --- | --- |
| `time` | 时间范围 | `8` |
| `sort` | 排序方式 | `1` |
| `keyword` | 城市或主题关键词 | 用户输入 |
| `pageNo` | 页码 | `1` |
| `pageSize` | 单次返回数量 | 普通查询 `10` |

请求会带 `Origin: https://cp.allcpp.cn`、`Referer: https://cp.allcpp.cn/` 和浏览器 `User-Agent`，以符合站点网页请求上下文。

## 字段转换

列表响应的 `result.list` 会转换为插件通用的活动字段：

| Allcpp 字段 | 插件字段 | 说明 |
| --- | --- | --- |
| `id` | `id` | 活动 ID |
| `name` | `name` | 已取消活动会追加 `(已取消)` |
| `provName`、`cityName`、`areaName` | `location` | 以空格连接 |
| `enterAddress` | `address` | 场馆或地址 |
| `enterTime`、`startTime` | `time` | 优先使用时间戳 |
| `appLogoPicUrl` | `appLogoPicUrl` | 相对地址补上 Allcpp CDN 前缀 |
| `wannaGoCount`、`circleCount`、`doujinshiCount` | 同名统计字段 | 用于文字与图片详情 |

活动详情链接固定拼接为：

```text
https://www.allcpp.cn/allcpp/event/event.do?event=<id>
```

## 失败边界

- Allcpp 接口错误或网络错误会返回查询失败提示，不影响已有订阅数据。
- 搜索结果为空时显示“未找到相关漫展信息”。
- 站点接口为第三方非稳定契约，字段变更时应优先更新 `src/api/allcpp.ts` 的 `RawEvent` 与 `parseEvent()`。
