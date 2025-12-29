## 发布到npm
```powershell
# 确保插件文件夹的名称是*anime-convention-lizard-vincentzyu-fork*, 没有koishi-plugin 前缀，然后:
cd G:\GGames\Minecraft\shuyeyun\qq-bot\koishi-dev\koishi-dev-3
yarn
yarn dev
yarn build anime-convention-lizard-vincentzyu-fork

$Env:HTTP_PROXY = "http://127.0.0.1:7890"
$Env:HTTPS_PROXY = "http://127.0.0.1:7890"
Invoke-WebRequest -Uri "https://www.google.com" -Method Head -UseBasicParsing
npm login --registry https://registry.npmjs.org
# 在浏览器里面登录npm，去邮件里面收验证码
npm run pub anime-convention-lizard-vincentzyu-fork -- --registry https://registry.npmjs.org
npm dist-tag add koishi-plugin-anime-convention-lizard-vincentzyu-fork@3.0.1+beta.2-20251230 latest --registry https://registry.npmjs.org

npm view koishi-plugin-anime-convention-lizard-vincentzyu-fork
npm-stat.com
```