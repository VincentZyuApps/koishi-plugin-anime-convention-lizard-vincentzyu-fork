![koishi-plugin-anime-convention-lizard-vincentzyu-fork](https://socialify.git.ci/VincentZyuApps/koishi-plugin-anime-convention-lizard-vincentzyu-fork/image?custom_description=%F0%9F%A6%8E%E2%9C%A8+%E5%9F%BA%E4%BA%8EKoishi+%E7%9A%84%E6%BC%AB%E5%B1%95%E6%9F%A5%E8%AF%A2%E4%B8%8E%E8%AE%A2%E9%98%85%E6%8F%92%E4%BB%B6%EF%BD%9C%E5%AF%B9%E6%8E%A5%E6%97%A0%E5%B7%AE%E5%88%AB%E5%90%8C%E4%BA%BA%E7%AB%99%28allcpp.cn%29%EF%BC%8C%E6%94%AF%E6%8C%81%E5%9F%8E%E5%B8%82%2F%E4%B8%BB%E9%A2%98%E7%AD%89%E5%A4%9A%E7%BB%B4%E6%90%9C%E7%B4%A2%E3%80%81%E5%85%B3%E9%94%AE%E8%AF%8D%E8%AE%A2%E9%98%85%E6%8E%A8%E9%80%81%E3%80%81Puppeteer+%E7%B2%BE%E7%BE%8E%E5%9B%BE%E7%89%87%E6%B8%B2%E6%9F%93%E3%80%81%E8%87%AA%E5%AE%9A%E4%B9%89%E5%AD%97%E4%BD%93%E4%B8%8E%E6%B7%B1%E8%89%B2%E6%A8%A1%E5%BC%8F&description=1&font=Bitter&forks=1&issues=1&language=1&logo=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Ff%2Ff3%2FKoishi.js_Logo.png&name=1&owner=1&pulls=1&stargazers=1&theme=Auto)

# koishi-plugin-anime-convention-lizard-vincentzyu-fork
**anime-convention-lizard-vincentzyu-fork** 是一款针对漫展查询与订阅的 Koishi 插件。对接 **无差别同人站 (www.allcpp.cn)**，通过简单的指令快速查询城市或主题相关的漫展，并提供订阅与管理功能。

[![npm](https://img.shields.io/npm/v/koishi-plugin-anime-convention-lizard-vincentzyu-fork?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-anime-convention-lizard-vincentzyu-fork)
[![npm-download](https://img.shields.io/npm/dm/koishi-plugin-anime-convention-lizard-vincentzyu-fork?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-anime-convention-lizard-vincentzyu-fork)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/VincentZyuApps/koishi-plugin-anime-convention-lizard-vincentzyu-fork)
[![Gitee](https://img.shields.io/badge/Gitee-C71D23?style=for-the-badge&logo=gitee&logoColor=white)](https://gitee.com/vincent-zyu/koishi-plugin-anime-convention-lizard-vincentzyu-fork)


> **上游仓库**：[https://github.com/lizard0126/anime-convention-lizard](https://github.com/lizard0126/anime-convention-lizard)

<p><del>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>259248174</b>   🎉（这个群G了</del> </p> 
<p>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>1085190201</b> 🎉</p>
<p>💡 在群里直接艾特我，回复的更快哦~ ✨</p>



---

## ✨ 特性

- 🔍 **多维查询**：支持按城市名或漫展主题关键词进行搜索。
- 📅 **订阅系统**：订阅感兴趣的关键词，一键获取所有关注城市的漫展动态。
- 🖼️ **精美渲染**：支持通过 Puppeteer 将查询结果渲染为精美图片（可选）。
- 🔤 **自定义字体**：支持加载本地字体文件，让图片渲染更符合你的审美。
- 🚀 **自托管后端**：支持配置自定义后端 API，稳定可靠。

## 🔍 预览
![https://gitee.com/vincent-zyu/koishi-plugin-anime-convention-lizard-vincentzyu-fork/releases/download/preview2/list-preview.png](https://gitee.com/vincent-zyu/koishi-plugin-anime-convention-lizard-vincentzyu-fork/releases/download/preview2/list-preview.png)
![https://gitee.com/vincent-zyu/koishi-plugin-anime-convention-lizard-vincentzyu-fork/releases/download/preview2/detail-preview.png](https://gitee.com/vincent-zyu/koishi-plugin-anime-convention-lizard-vincentzyu-fork/releases/download/preview2/detail-preview.png)

---

## 📦 安装

在 Koishi webui的`插件市场`中搜索插件名`anime-convention-lizard-vincentzyu-fork` 并安装。

或者 Koishi webui的`依赖管理`中搜索npm包名`koishi-plugin-anime-convention-lizard-vincentzyu-fork` 并安装。

或者使用 npm/yarn：

```bash
npm install koishi-plugin-anime-convention-lizard-vincentzyu-fork
yarn add koishi-plugin-anime-convention-lizard-vincentzyu-fork
```

### 🛠️ 前置依赖
- **必须依赖**：`database` (用于存储订阅信息)
- **可选依赖**：`puppeteer` (用于图片渲染功能)
  - 推荐安装：`koishi-plugin-puppeteer` 或 `@shangxueink/koishi-plugin-puppeteer-without-canvas`

---

## ⚙️ 配置说明

### 🔗 后端 API 配置
本插件默认使用作者提供的公共 API。如果你希望自托管后端以获取更稳定的服务，可以前往 [allcpp-search-go](https://github.com/VincentZyu233/allcpp-search-go) 下载二进制文件直接运行，或者从源码自行编译。

📡 **三种请求模式详解**：

#### 🔄 Proxy 模式（远程中转）
- **工作原理**：通过远程中转服务器转发请求到 allcpp.cn
- **适用场景**：不想自托管后端，直接使用作者提供的公共服务
- **配置示例**：
  ```typescript
  priorityMode: 'proxy'
  apiUrl: 'http://xwl.vincentzyu233.cn:51225/search'  // 作者提供的公共API
  ```

#### 🏠 Local 模式（本地直连）
- **工作原理**：直接请求 allcpp.cn 官网，不经过任何中间层
- **适用场景**：追求最直接的访问方式，无需额外部署
- **注意**：此模式为实验性功能，可能受 allcpp.cn 反爬策略影响
- **配置示例**：
  ```typescript
  priorityMode: 'local'
  // 无需配置 apiUrl
  ```

#### 🌍 Distributed 模式（分布式本地后端）
- **工作原理**：请求本地部署的 Go 后端服务，由该后端代理请求 allcpp.cn
- **适用场景**：自托管后端以获得更稳定的服务和更快的响应速度
- **配置步骤**：
  1. 下载并运行 [allcpp-search-go](https://github.com/VincentZyu233/allcpp-search-go) 后端服务
  2. 配置插件指向本地后端地址
- **配置示例**：
  ```typescript
  priorityMode: 'distributed'
  apiUrl: 'http://127.0.0.1:60407/search'  // 本地后端地址（需添加 /search 后缀）
  localServerHost: '0.0.0.0'  // 本地服务器监听地址
  localServerPort: 60407       // 本地服务器监听端口
  ```

💡 **模式选择建议**：
- 新手用户 → 使用默认的 **Proxy 模式**
- 追求稳定性 → 部署本地后端并使用 **Distributed 模式**
- 测试调试 → 可尝试 **Local 模式**

### 🔤 字体设置
你可以手动下载字体文件，并在插件配置项中填写字体的**绝对路径**。

**推荐字体：**
- [落霞孤鹜文楷 LXGW WenKai Mono → *(https://gitee.com/vincent-zyu/koishi-plugin-onebot-info-image/releases/download/font/LXGWWenKaiMono-Regular.ttf)*](https://gitee.com/vincent-zyu/koishi-plugin-onebot-info-image/releases/download/font/LXGWWenKaiMono-Regular.ttf)
- [思源宋体 Source Han Serif SC → *(https://gitee.com/vincent-zyu/koishi-plugin-onebot-info-image/releases/download/font/SourceHanSerifSC-Medium.otf)*](https://gitee.com/vincent-zyu/koishi-plugin-onebot-info-image/releases/download/font/SourceHanSerifSC-Medium.otf)

> 💡 **提示**：如未填写或路径无效，将自动回退为系统默认字体。

---

## 📖 使用方法

### 🔍 漫展查询
| 指令 | 说明 | 示例 |
| :--- | :--- | :--- |
| `漫展 查询 <关键词>` | 查询指定城市或主题的漫展 | `漫展 查询 南京` |
| `漫展 一键查询` | 查询所有已订阅关键词的漫展 | `漫展 一键查询` |
| `漫展 图片查询 <关键词>` | 以图片形式展示查询结果 | `漫展 图片查询 东方` |
| `漫展 一键图片查询` | 以图片形式展示所有订阅结果 | `漫展 一键图片查询` |

### 📌 订阅管理
| 指令 | 说明 | 示例 |
| :--- | :--- | :--- |
| `漫展 订阅 <关键词>` | 订阅指定关键词 | `漫展 订阅 上海` |
| `漫展 取消订阅 <关键词>` | 取消订阅指定关键词 | `漫展 取消订阅 上海` |
| `漫展 取消订阅` | 清空所有订阅 | `漫展 取消订阅` |
| `漫展 订阅列表` | 查看当前订阅的关键词 | `漫展 订阅列表` |

---

## ☕ 原作者留下的
如果这个插件对你有帮助，可以[请我喝杯可乐🥤 *(https://ifdian.net/a/lizard0126)* ](https://ifdian.net/a/lizard0126) 

