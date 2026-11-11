# COOL AI Skill · 酷AI 技能

让你的 AI 编程助手直接调用 [COOL AI（酷AI）](https://www.coolai.mov) 生成营销视频和图片。
支持 **Claude Code、Codex、WorkBuddy、DeepSeek Harness**，以及其它支持 `SKILL.md` 的工具。

[English](#english)

## 能做什么

- **AI 视频**：一句话或一张产品图生成带货 / 种草 / 口播 / 品牌短片（Seedance、Wan 等模型），可带参考图、参考视频、参考声音
- **超级编导**：19 个行业技能（电商带货、同城到店、品牌广告、剧情短片），AI 先写好分镜脚本再出片
- **AI 图片**：产品主图、海报、配图（GPT Image、Gemini、Grok 等模型），可带参考图改图
- 查余额、查价格、查任务，成片自动下载到本地

每次生成前，助手都会先告诉你要花多少积分，你同意了才会扣。

## 安装

需要 [Node.js 18 或以上](https://nodejs.org)。

**一键安装（推荐）**

```bash
git clone https://github.com/czg86389-hub/coolai-skill.git
```

```bash
bash coolai-skill/install.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File coolai-skill\install.ps1
```

脚本会自动装到本机已有的工具里。只装某一个：`bash install.sh claude`（可选 `claude`、`codex`、`workbuddy`、`dsh`）。

**手动安装**：把 `skills/coolai` 整个文件夹复制到对应目录，然后重启工具。

| 工具 | 目录（Windows 把 `~` 换成 `%USERPROFILE%`） |
|---|---|
| Claude Code | `~/.claude/skills/coolai` |
| Codex | `~/.codex/skills/coolai` |
| WorkBuddy | `~/.workbuddy/skills/coolai` |
| DeepSeek Harness | `~/.dsh/skills/coolai` |
| 其它支持 Agent Skills 的工具 | `~/.agents/skills/coolai` |

Claude Code 也可以用插件方式安装：

```
/plugin marketplace add czg86389-hub/coolai-skill
/plugin install coolai@coolai
```

## 开始使用

1. 打开 <https://www.coolai.mov> 注册账号（普通会员免费注册）。
2. 打开 <https://www.coolai.mov/account/api-keys> 生成一把 API 密钥（`ml_sk_` 开头）。
3. 在助手里说：「用 COOL AI，我的密钥是 ml_sk_…」，或者自己设置环境变量 `COOLAI_API_KEY`。
4. 然后直接提需求，例如：
   - 「用 COOL AI 给这张保温杯图片做一条 10 秒的种草视频」
   - 「用 COOL AI 生成一张双 11 促销海报，竖版」
   - 「COOL AI 还剩多少积分？」

密钥只保存在你自己电脑的 `~/.coolai/config.json` 里，随时可以在网站上作废。

## 计费

按你的 COOL AI 账号扣积分，和在网站上使用完全一样：

- **普通会员**：按网站显示的标准价
- **永久 VIP**：全部功能自动享受会员折扣价

生成失败自动退回积分。

## 命令行直接用

```bash
node skills/coolai/scripts/coolai.mjs help
```

---

## English

Use [COOL AI](https://www.coolai.mov) from your coding agent to generate marketing videos and images.
Works with **Claude Code, Codex, WorkBuddy, DeepSeek Harness** and other tools that load `SKILL.md` skills.

### What it does

- **AI video** from one sentence or one product photo (Seedance, Wan and more), with reference images, video or audio
- **AI director**: 19 industry skills that write the storyboard before the video is made
- **AI images**: product shots, posters, illustrations (GPT Image, Gemini, Grok), with reference images
- Balance, prices, task status; results are downloaded for you

The agent always tells you the credit cost first and only spends after you agree.

### Install

Requires [Node.js 18+](https://nodejs.org).

```bash
git clone https://github.com/czg86389-hub/coolai-skill.git
```

```bash
bash coolai-skill/install.sh
```

Windows: `powershell -ExecutionPolicy Bypass -File coolai-skill\install.ps1`

Or copy the `skills/coolai` folder by hand to `~/.claude/skills/`, `~/.codex/skills/`, `~/.workbuddy/skills/`
or `~/.dsh/skills/`, then restart the tool. Claude Code users can also run
`/plugin marketplace add czg86389-hub/coolai-skill` and `/plugin install coolai@coolai`.

### Get started

1. Sign up at <https://www.coolai.mov> (joining as a Member is free).
2. Create an API key at <https://www.coolai.mov/account/api-keys>.
3. Tell your agent: "Use COOL AI, my key is ml_sk_…", or set `COOLAI_API_KEY` yourself.
4. Ask for what you need: "Use COOL AI to make a 10-second product video from this photo."

### Billing

Credits come from your own COOL AI account, exactly as on the website: Members pay the standard price,
Lifetime VIP members get the VIP discount on everything. Failed tasks are refunded automatically.
