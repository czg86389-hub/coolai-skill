# COOL AI Skill

[简体中文](README.md) | **English**

Use [COOL AI](https://www.coolai.mov) from your AI coding agent to generate marketing videos and images.
Works with **Claude Code, Codex, WorkBuddy, DeepSeek Harness** and other tools that load `SKILL.md` skills.

## What it does

- **AI video**: turn one sentence or one product photo into a selling, lifestyle, talking-head or brand short (Seedance, Wan and more), with reference images, video or audio
- **AI director**: 19 industry skills (e-commerce, local shops, brand ads, short dramas) that write the storyboard before the video is made
- **AI images**: product shots, posters and illustrations (GPT Image, Gemini, Grok and more), with reference images for editing
- Balance, prices and task status; finished files are downloaded for you

Before every generation the agent tells you the credit cost, and only spends after you agree.

## Install

Requires [Node.js 18 or later](https://nodejs.org).

### One-step install (recommended)

```bash
git clone https://github.com/czg86389-hub/coolai-skill.git
```

macOS / Linux / Git Bash:

```bash
bash coolai-skill/install.sh
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File coolai-skill\install.ps1
```

The installer adds the skill to every supported tool it finds. To install for one tool only:
`bash install.sh claude` (choose `claude`, `codex`, `workbuddy` or `dsh`).

### Manual install

Copy the whole `skills/coolai` folder to the matching directory, then restart the tool.

| Tool | Directory (on Windows replace `~` with `%USERPROFILE%`) |
|---|---|
| Claude Code | `~/.claude/skills/coolai` |
| Codex | `~/.codex/skills/coolai` |
| WorkBuddy | `~/.workbuddy/skills/coolai` |
| DeepSeek Harness | `~/.dsh/skills/coolai` |
| Other Agent Skills tools | `~/.agents/skills/coolai` |

### As a Claude Code plugin

```
/plugin marketplace add czg86389-hub/coolai-skill
/plugin install coolai@coolai
```

## Get started

1. Sign up at <https://www.coolai.mov> (joining as a Member is free).
2. Create an API key at <https://www.coolai.mov/account/api-keys> (it starts with `ml_sk_`).
3. Tell your agent: "Use COOL AI, my key is ml_sk_…", or set the `COOLAI_API_KEY` environment variable yourself.
4. Then ask for what you need, for example:
   - "Use COOL AI to make a 10-second lifestyle video from this thermos photo"
   - "Use COOL AI to generate a vertical Black Friday poster"
   - "How many COOL AI credits do I have left?"

The key is stored only on your own computer in `~/.coolai/config.json`, and you can revoke it on the website at any time.

## Billing

Credits come from your own COOL AI account, exactly as on the website:

- **Member**: the standard price shown on the website
- **Lifetime VIP**: the VIP discount on every feature, applied automatically

Failed tasks are refunded automatically.

## Use it from the command line

You can also run the script without an AI agent:

```bash
node skills/coolai/scripts/coolai.mjs help
```

| Command | What it does |
|---|---|
| `auth status` | account, member level, credit balance |
| `auth set <key>` | save the API key |
| `models [video\|image]` | models available now |
| `skills` | video skills for the AI director |
| `upload <file>` | upload an image, video or audio file |
| `image --prompt "..."` | generate images |
| `video --prompt "..."` | generate a video |
| `script --brief "..."` | let the AI director write a storyboard |
| `task <id> [--wait]` | status and result of a task |
| `tasks` | recent tasks |

Without `--confirm`, `image`, `video` and `script` only return the price and charge nothing.

## Troubleshooting

- **"API key missing, wrong or revoked"**: check at <https://www.coolai.mov/account/api-keys> that the key is still enabled, or create a new one and set it again.
- **Not enough credits**: top up on the website, or try 480p and a shorter duration first.
- **The agent does not see the skill after installing**: restart the tool, and make sure the path is `…/skills/coolai/SKILL.md` with no extra folder level.
- **More tools** (upscaling, subtitle and watermark removal, digital human, canvas and more) are on the website: <https://www.coolai.mov>
