# 🧿 Jev 裁决台 · Decision Desk

一个纯静态、零构建依赖的决策工具 Web App：把文本决策交给 **Pollinations Jev**（`/alpha/decisions` 端点），并把结构化决策渲染成可操作的 UI。

- **创业点子裁决**：输入创业想法，Jev 用 `choice` 类型在 **Kill / Fix / Ship** 三个标准中裁决，输出裁决卡（结果 + 置信度 + 三选项概率条形图 + 依据说明）。
- **语义过滤器**：粘贴一组头条/评论（每行一条），Jev 用 `score` 类型逐项打 0-100 分，渲染可排序的分数条列表，可一键保留高分项（≥70）。
- **紧急度判断**：输入一段求助/待办文本，Jev 用 `noul` 类型给出 0-1 紧急程度，渲染紧急度仪表盘并给出建议动作。

## 本地运行

无需安装任何依赖，直接用浏览器打开 `index.html` 即可完整体验。

> 未连接钱包时自动进入**演示模式**：预置 3 组示例请求与响应，展示完整 UI 效果，绝不报错阻塞；点击"连接钱包"后即可实时调用 Jev。

## BYOP 说明（为什么需要登录）

`https://gen.pollinations.ai/alpha/decisions` 是 **BYOP（Bring Your Own Pollen）** 付费端点：匿名调用返回 `401`，必须携带你自己的 `sk_` API Key（付费 Pollen）才能实时决策。

本应用采用官方 **fragment flow** 登录：

1. 点击顶栏「连接钱包」，跳转 `https://enter.pollinations.ai/authorize?redirect_uri=当前页面URL&scope=usage&client_id=`
2. 授权完成后回调地址会带上 `#api_key=sk_...`
3. 应用读取 hash 中的 key 后**立即清空地址栏**，key 仅保存在内存中，**绝不写入 localStorage / 落盘**
4. 之后所有 `/alpha/decisions` 请求携带 `Authorization: Bearer sk_...`

**安全提示**：key 只存活于内存，刷新页面即失效，需要重新登录；这也意味着 key 不会在你的磁盘上留下痕迹。

## 请求 / 响应格式

请求体（参照官方 APIDOCS）：

```json
{
  "state": "<背景文本>",
  "questions": {
    "<键>": {
      "type": "choice | score | noul",
      "instructions": "<指令>",
      "criteria": { "kill": "...", "fix": "...", "ship": "..." }
    }
  }
}
```

响应 `answers` 中每项按 `type` 返回：

| type | 字段 |
|---|---|
| `choice` | `choice` + `confidence` + `probabilities`（键值概率映射） |
| `score` | `score`（0-100）+ `legend` + `confidence` |
| `noul` | `noul`（0-1） |

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，上传 `index.html` / `styles.css` / `script.js` / `README.md`（四个文件放在仓库根目录即可）。
2. 打开仓库 **Settings → Pages**，Source 选择 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`。
3. 保存后等待 1-2 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/` 即上线。

> 上线后点击「连接钱包」时，回调的 `redirect_uri` 会自动使用当前线上 URL，无需修改代码。

## 隐私

- 历史决策记录仅保存在**本机 localStorage**，可随时清空。
- API Key 仅存在内存，页面刷新即消失。
- 纯静态三件套，无后端、无埋点、无第三方依赖（仅调用 Pollinations 官方决策 API）。
