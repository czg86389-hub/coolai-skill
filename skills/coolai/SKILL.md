---
name: coolai
description: Generate marketing videos and images with COOL AI (酷AI, www.coolai.mov) — AI video (Seedance / Wan, with product or person reference images and an AI director that writes the storyboard), AI images (GPT Image, Gemini, Grok), upload assets, check prices and credit balance, download results. Use when the user asks to make / generate a video, short video, product video, ad, 带货视频, 种草视频, 口播视频, 宣传片, or an image, poster, product photo, 主图, 海报, 配图, or mentions COOL AI / 酷AI / coolai.
---

# COOL AI (酷AI)

COOL AI is an AI marketing studio for e-commerce sellers, local shops and factories: <https://www.coolai.mov>.
This skill drives the user's own COOL AI account through one script. All work is paid for with the
credits in that account.

## The script

Everything goes through `scripts/coolai.mjs` in this skill's folder (Node.js 18+, no install step).
Call it with its full path:

```bash
node "<this skill's folder>/scripts/coolai.mjs" <command> [options]
```

Every command prints one JSON object. `"ok": false` means it failed and `error` says why.
If `node` is missing, tell the user to install Node.js 18+ from <https://nodejs.org>, or use the
raw HTTP calls in `references/api.md`.

## First use: connect the account

1. Run `auth status`. If `configured` is `true`, go on.
2. Otherwise tell the user, in their language:
   - Open <https://www.coolai.mov> and sign up. Registering as a Member is free.
   - Open <https://www.coolai.mov/account/api-keys>, create an API key and paste it here (it starts with `ml_sk_`).
3. Save it with `auth set <key>`. It is stored in `~/.coolai/config.json` on the user's machine.
   (Or the user can set the `COOLAI_API_KEY` environment variable themselves.)

Never print the key back, never write it into project files, commits or logs. If the user wants to
stop using it, they can delete it on the API keys page at any time.

## Prices and credits — always confirm before spending

- Prices are in credits and follow the account's level. A **Member** (free account) pays the standard
  price shown on the website. A **Lifetime VIP** automatically pays the VIP price (20% off everything).
  Assume Member prices unless `auth status` says `vip`.
- `image`, `video` and `script` **only return the price** unless you add `--confirm`. Nothing is charged
  on that first call.
- So the flow is always: run the command without `--confirm` → tell the user what will be made and how
  many credits it costs (and their balance) → wait for a clear yes → run it again with `--confirm`.
  Ask again for every new generation; one yes does not cover later ones.
- The first call uploads any `--ref` files and returns their `asset_id`. On the `--confirm` call pass
  those ids to `--ref` instead of the file paths, so nothing is uploaded twice.
- If credits are not enough, say so and point the user to <https://www.coolai.mov> to top up. Failed
  tasks are refunded automatically.
- Do not quote prices from memory. Use what the script returns.

## Commands

| Command | What it does |
|---|---|
| `auth status` | account name, member level, credit balance |
| `auth set <key>` | save the API key |
| `models [video\|image]` | models available now, with supported resolutions |
| `skills` | video skills for the AI director (key, name, category) |
| `upload <file>` | upload an image / video / audio, returns `asset_id` |
| `image --prompt "..."` | generate images |
| `video --prompt "..."` | generate a video |
| `script --brief "..."` | AI director (超级编导) writes a storyboard script |
| `task <id> [--wait]` | status and result of a task |
| `tasks [--limit 10]` | recent tasks |

Finished files are downloaded to `./coolai-output` (change with `--out DIR`). The JSON also has the
online `outputs` URLs. Tell the user where the files are.

### Images

```bash
node coolai.mjs image --prompt "白底产品图：奶白色陶瓷香薰机，柔和棚拍光" --ratio 1:1
```

Options: `--model KEY` (default: the first model from `models image`), `--ratio auto|1:1|3:4|4:3|9:16|16:9`,
`--resolution 1k|2k|4k`, `--quality low|medium|high`, `--count 1-4`, `--ref <file or asset_id>` (repeatable;
reference images to edit or to keep the product / person consistent).

Images take about 30–90 seconds.

### Videos

```bash
node coolai.mjs video --prompt "..." --duration 10 --resolution 480p --ratio 9:16 --ref product.png
```

Options: `--model KEY` (default `video.doubao_seedance_2_0_mini`; see `models video`), `--duration` seconds
(5–15 is typical; each model has its own maximum), `--resolution 480p|720p|1080p`, `--ratio 9:16|16:9|1:1|3:4|4:3`,
`--ref <file or asset_id>` (repeatable: images, a video or audio), `--prompt-file FILE`, `--skill KEY`,
`--no-audio`, `--no-wait`.

- References are named by type and order: the first image is `@图片1`, the second `@图片2`, a video is
  `@视频1`, audio is `@音频1`. Mention them in the prompt where they should appear, e.g.
  `@图片1 里的保温杯放在办公桌上`.
- Videos take 2–10 minutes. The command waits and prints progress on stderr. If it times out, use
  `task <id> --wait`.
- 480p is the cheapest and is fine for drafts. Recommend 480p first, then a higher resolution only for
  the final take.
- Write the prompt in the language the voice-over should be spoken in. Describe shots, camera moves,
  what is said, and what must not appear (subtitles, logos, prices).

### AI director: let COOL AI write the storyboard first

For product / shop / ad videos the result is much better when the AI director writes the script:

```bash
node coolai.mjs skills                      # pick the skill that fits, e.g. ecommerce-scene-seeding
node coolai.mjs script --brief "奶白陶瓷香薰机，独居女生下班回家放松" --skill ecommerce-scene-seeding --duration 15 --ref product.png
```

Options: `--brief` one or two sentences about the product and the feeling wanted, `--skill KEY`,
`--duration`, `--ref` (the product photo helps a lot), `--style explain|ugc` (narration vs. real-person
talk), `--lang zh|en`.

It costs a small number of credits (also needs `--confirm`). The result has the `script`, a
`script_file`, and a ready-made `next` command. Show the script to the user, apply their changes to the
file if they want any, then run that `video --prompt-file ...` command (price first, then `--confirm`).

Skill categories: 电商带货 (e-commerce selling), 同城到店 (local shops), 品牌广告 (brand ads),
剧情短片 (short dramas). Match the skill to what the user sells and where the video will be posted.

## Rules

- **Real people.** If a reference image shows a real person's face, ask the user whether they have that
  person's permission. Only when they say yes, add `--portrait-consent` to the `video` command. Never add
  it on your own.
- Do not use this skill to make content that is illegal, sexual, hateful, deceptive (fake endorsements,
  impersonation), or that infringes someone's trademark or copyright. The service also reviews content
  and may reject a task.
- Generated content is AI-made. Remind the user to label it as AI-generated where the platform they
  post on requires it.
- One generation per confirmation. Do not loop or batch-generate without the user asking for a specific
  number, and state the total cost first.
- If something fails, report the exact `error` text. Do not retry a paid command more than once without
  telling the user.

## More

- `references/api.md` — the HTTP endpoints behind the script, for when Node.js is not available.
- Website (all other tools: upscaling, subtitle / watermark removal, digital human, canvas): <https://www.coolai.mov>
