import { readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))
const detailsStyle = 'margin:10px 0;border:1px solid var(--k-color-border, #909399);border-radius:8px;background:var(--k-card-bg, transparent);color:var(--k-text-dark, inherit);overflow:hidden;box-shadow:var(--k-card-shadow, 0 1px 3px rgb(0 0 0 / 12%))'
const summaryStyle = 'padding:9px 12px;background:var(--k-hover-bg, rgba(127, 127, 127, .12));color:var(--k-text-dark, inherit);cursor:pointer;user-select:none'
const detailsBodyStyle = 'padding:2px 14px 8px;border-top:1px solid var(--k-color-divider, rgba(127, 127, 127, .28));background:var(--k-card-bg, transparent);color:var(--k-text-dark, inherit)'
const KOISHI_LOGO_BASE64 = 'data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAABU0lEQVR42p2UQSsFYRSGnxnqLuytKWKpKFkQNsS%2FsOHPWPADLCmxU5S7UzYWNrJR7lYiRF2FeWzOMKZ7mXHqNNP5vvP2nu%2B850CY2lP4X1K31ZbaDm%2BpO%2Bpyp5wfAXVEPfRvO1JHf4AVQGbUh7j4EZ4VkrNCXPVRnf3CUBN1SH2KC28VGOV3ntRhNclZHdcAKYM11QR1oVBOXctzFlNgBTC8qmXxPQEegbVeYApIgJT6tg%2F0AdMp0B%2FBpCabK2AAmAAa%2F2GRBft1oBFPkqTAba7LCiAfQC9wClwAY1HJHepuiO29Yrsf1Dn1uiDU3RTYCtTkl1Leg8k9MB4NGgReI28rV3azgyCz0og01Xl1Uz1QX8uCTELm3UbkTF1VJ9Wr0tn3iBSGdjYG0XivE3VN3VD31PM4a3cc2tIGGI0VkTO7rLxGuiy25ejmjfqsvkSXui62TxaK03td4FXTAAAAAElFTkSuQmCC'

export const usage = `
<h1>漫展查询</h1>
<p>版本：v${pkg.version}</p>

<p>
  <a href="https://www.npmjs.com/package/koishi-plugin-anime-convention-lizard-vincentzyu-fork" target="_blank">
    <img src="https://img.shields.io/npm/v/koishi-plugin-anime-convention-lizard-vincentzyu-fork?style=flat-square&logo=npm" alt="npm version">
  </a>
  <a href="https://npm-stat.com/charts.html?package=koishi-plugin-anime-convention-lizard-vincentzyu-fork" target="_blank">
    <img src="https://img.shields.io/npm/dm/koishi-plugin-anime-convention-lizard-vincentzyu-fork?style=flat-square&logo=npm" alt="npm downloads">
  </a>
  <br>
  <a href="https://github.com/VincentZyuApps/koishi-plugin-anime-convention-lizard-vincentzyu-fork" target="_blank">
    <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub">
  </a>
  <a href="https://gitee.com/vincent-zyu/koishi-plugin-anime-convention-lizard-vincentzyu-fork" target="_blank">
    <img src="https://img.shields.io/badge/Gitee-C71D23?style=for-the-badge&logo=gitee&logoColor=white" alt="Gitee">
  </a>
  <br>
  <a href="https://forum.koishi.xyz/t/topic/12115" target="_blank">
    <img src="https://img.shields.io/badge/Koishi%20Forum-12115-5546A3?style=for-the-badge&logo=${KOISHI_LOGO_BASE64}&logoColor=white" alt="Koishi Forum">
  </a>
  <a href="https://qm.qq.com/q/ZHj33L5cuC" target="_blank">
    <img src="https://img.shields.io/badge/QQ群-1085190201-12B7F5?style=flat-square&logo=qq&logoColor=white" alt="QQ群">
  </a>
</p>

<h2>💬 交流反馈</h2>
<p>🐛 Bug 反馈 / 💡 建议 / 👨‍💻 插件开发交流，欢迎加群：</p>
<p><del>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>259248174</b>   🎉（这个群G了）</del></p>
<p>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>1085190201</b> 🎉</p>
<p>💡 在群里直接艾特我，回复的更快哦~ ✨</p>

<p><code>漫展</code> 对接无差别同人站，支持城市与作品关键词；<code>漫展B</code> 对接 B站会员购，只支持地区活动查询。</p>

<details style="${detailsStyle}">
<summary style="${summaryStyle}"><b>🧭 指令速览</b></summary>
<div style="${detailsBodyStyle}">
<p><b>无差别同人站：</b><code>漫展 查询 南京</code>、<code>漫展 订阅 东方</code>、<code>漫展 一键查询</code>。</p>
<p><b>B站会员购：</b><code>漫展B 查询 北京</code>、<code>漫展B 查询 上海 --scope 演出</code>、<code>漫展B 订阅 南京</code>、<code>漫展B 一键查询</code>。</p>
<p>图片指令启用后可使用 <code>图片查询</code> 与 <code>一键图片查询</code>。查询结果出现编号后，回复编号查看详情；回复 <code>0</code> 取消。</p>
</div>
</details>

<details style="${detailsStyle}">
<summary style="${summaryStyle}"><b>📺 漫展B 范围与限制</b></summary>
<div style="${detailsBodyStyle}">
<p><code>--scope</code> 可选：<b>漫展</b>（默认）、展览、演出、本地生活、全部、自定义。订阅的一键查询使用控制台的默认范围。</p>
<p><b>地区优先：</b>B站会员购不支持作品或主题关键词；请输入北京、南京、朝阳区等地区名称。主题查询请使用 <code>漫展 查询 &lt;关键词&gt;</code>。</p>
<p><b>区县展开：</b><code>--fanout</code> 会查询市辖区并去重，适合北京、上海等大城市，但会增加请求数量。</p>
<p><b>结果限制：</b>会员购单个地区频道最多返回 20 项；插件按开始时间排序、按项目去重，再依控制台上限展示。为保证稳定性，B站图片查询最多展示最早开始的前 10 项；完整结果请使用文本查询。</p>
</div>
</details>

<details style="${detailsStyle}">
<summary style="${summaryStyle}"><b>⚙️ 图片与控制台配置</b></summary>
<div style="${detailsBodyStyle}">
<p><b>Puppeteer：</b>仅图片查询和图片详情需要。启用图片指令后，请确保 Koishi 已加载 Puppeteer 服务。</p>
<p><b>图片设置：</b>默认使用内置 npm 霞鹜文楷；也可改为 Release 等宽版、服务端自定义字体绝对路径或浏览器系统字体。Release 首次生图下载到 Koishi 根目录 <code>data/fonts</code>，不可用时会明确报错。</p>
<p><b>数据连接：</b>两套查询均直接请求数据源，不需要配置本地代理、端口或 API 地址。</p>
</div>
</details>
`
