# COOL AI Skill · 酷AI 技能

**简体中文** | [English](README.en.md)

让你的 AI 编程助手直接调用 [COOL AI（酷AI）](https://www.coolai.mov) 生成营销视频和图片。
支持 **Claude Code、Codex、WorkBuddy、DeepSeek Harness**，以及其它支持 `SKILL.md` 的工具。

## 能做什么

- **AI 视频**：一句话或一张产品图生成带货 / 种草 / 口播 / 品牌短片（Seedance、Wan 等模型），可带参考图、参考视频、参考声音
- **超级编导**：19 个行业技能（电商带货、同城到店、品牌广告、剧情短片），AI 先写好分镜脚本再出片
- **AI 图片**：产品主图、海报、配图（GPT Image、Gemini、Grok 等模型），可带参考图改图
- 查余额、查价格、查任务，成片自动下载到本地

每次生成前，助手都会先告诉你要花多少积分，你同意了才会扣。

## 安装

需要 [Node.js 18 或以上](https://nodejs.org)。

### 一键安装（推荐）

```bash
git clone https://github.com/czg86389-hub/coolai-skill.git
```

macOS / Linux / Git Bash：

```bash
bash coolai-skill/install.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File coolai-skill\install.ps1
```

脚本会自动装到本机已有的工具里。只装某一个：`bash install.sh claude`（可选 `claude`、`codex`、`workbuddy`、`dsh`）。

### 手动安装

把 `skills/coolai` 整个文件夹复制到对应目录，然后重启工具。

| 工具 | 目录（Windows 把 `~` 换成 `%USERPROFILE%`） |
|---|---|
| Claude Code | `~/.claude/skills/coolai` |
| Codex | `~/.codex/skills/coolai` |
| WorkBuddy | `~/.workbuddy/skills/coolai` |
| DeepSeek Harness | `~/.dsh/skills/coolai` |
| 其它支持 Agent Skills 的工具 | `~/.agents/skills/coolai` |

### Claude Code 插件方式

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

不通过 AI 助手也可以直接运行脚本：

```bash
node skills/coolai/scripts/coolai.mjs help
```

| 命令 | 作用 |
|---|---|
| `auth status` | 账号、会员级别、积分余额 |
| `auth set <密钥>` | 保存 API 密钥 |
| `models [video\|image]` | 当前可用的模型 |
| `skills` | 超级编导的视频技能列表 |
| `upload <文件>` | 上传图片 / 视频 / 音频 |
| `image --prompt "..."` | 生成图片 |
| `video --prompt "..."` | 生成视频 |
| `script --brief "..."` | 超级编导写分镜脚本 |
| `task <任务号> [--wait]` | 查看任务状态和结果 |
| `tasks` | 最近的任务 |

`image`、`video`、`script` 不加 `--confirm` 只报价、不扣积分。

## 常见问题

- **提示密钥无效**：到 <https://www.coolai.mov/account/api-keys> 确认密钥没有被停用或删除，或重新生成一把再设置。
- **积分不足**：到网站充值，或先用 480p、较短时长试。
- **装好后助手不认识这个技能**：重启工具；确认路径是 `…/skills/coolai/SKILL.md`，没有多套一层文件夹。
- **更多功能**（画质增强、字幕 / 水印擦除、数字人、画布等）请到网站使用：<https://www.coolai.mov>
