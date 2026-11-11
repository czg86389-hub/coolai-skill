---
name: coolai
description: Generate marketing videos and images with COOL AI (酷AI, www.coolai.mov) — AI video (Seedance / Wan, 19 video skills with an AI director, 超越爆款 beat-the-viral, 深度复刻 deep replica), AI images and 18 image skill packs (商详套图 product detail sets, 种草图文 lifestyle post sets, 品牌 IP 形象 mascot sets, 白底图 white-background shots, 换脸, 服装上身 try-on, 分镜 storyboards and more), upload assets, check prices and credits, download results. Use when the user asks to make / generate a video, short video, product video, ad, 带货视频, 种草视频, 口播视频, 宣传片, or an image, poster, product photo, 主图, 详情图, 商详套图, 套图, 种草图, 海报, 配图, or mentions COOL AI / 酷AI / coolai.
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

## Pick the right tool first

COOL AI has purpose-built skills. Using the matching one gives far better results than a plain
prompt, so **match the request to a skill before generating**:

| The user wants | Use |
|---|---|
| 商详套图 / 详情图 / 主图套图 / product detail page images | `imageset --pack ecommerce-image-set` |
| 种草图文 / 小红书、抖音笔记配图 / lifestyle post images | `imageset --pack social-image-set` |
| 品牌 IP 形象 / 吉祥物 / mascot | `imageset --pack ip-mascot-set` |
| 白底图, 换脸, 服装上身, 模特试用, 换背景, 精修, 分镜图… | `image --pack <id>` (see `packs`) |
| A free-form image or poster | `image --prompt` |
| A product / shop / brand / story video | `script --skill <key>` then `video` (see `skills`) |
| "Make one like this viral video" (超越爆款) | `viral` then `video` |
| "Same moves and shots, but my product / person" (深度复刻) | `replica` |
| A free-form video | `video --prompt` |

If the request names a skill (商详套图, 种草图文, 场景种草, 反转短剧, 深度复刻 …), use that skill. Do not
fall back to plain `image` / `video` with a prompt you wrote yourself. If you are unsure which skill
fits, run `packs` or `skills` and tell the user which one you picked and why.

## Prices and credits — always confirm before spending

- Prices are in credits and follow the account's level. A **Member** (free account) pays the standard
  price shown on the website. A **Lifetime VIP** automatically pays the VIP price (20% off everything).
  Assume Member prices unless `auth status` says `vip`.
- `image`, `video`, `script`, `viral`, `replica` and `imageset-generate` **only return the price** unless
  you add `--confirm`. Nothing is charged on that first call. `imageset` (writing the plan) is free.
- So the flow is always: run the command without `--confirm` → tell the user what will be made, with
  which skill and model, and how many credits it costs (and their balance) → wait for a clear yes → run it
  again with `--confirm`. Ask again for every new generation; one yes does not cover later ones.
- The first call uploads any files and returns their `asset_id`. On the `--confirm` call pass those ids
  instead of the file paths, so nothing is uploaded twice.
- If credits are not enough, say so and point the user to <https://www.coolai.mov> to top up. Failed
  tasks are refunded automatically.
- Do not quote prices from memory. Use what the script returns.

## Commands

| Command | What it does |
|---|---|
| `auth status` / `auth set <key>` | account, member level, credit balance / save the API key |
| `models [video\|image]` | models available now, with supported resolutions |
| `packs` | image skill packs: id, what it does, its image slots, and modules for set packs |
| `styles` | art styles and theme colours (ids for `--style` / `--color`) |
| `skills` | video skills for the AI director (key, name, category) |
| `upload <file>` | upload an image / video / audio, returns `asset_id` |
| `image` | one image: free-form, or with a skill pack |
| `imageset` → `imageset-generate` | a whole image set: plan first (free), then generate |
| `script` | AI director writes a storyboard script for a video skill |
| `video` | generate a video |
| `viral` | 超越爆款: break down a hit video and write a better script |
| `replica` | 深度复刻: copy a reference video's moves and shots |
| `task <id> [--wait]` / `tasks` | status and result of a task / recent tasks |

Finished files are downloaded to `./coolai-output` (change with `--out DIR`). The JSON also has the
online `outputs` URLs. Tell the user where the files are.

## Images

### Image sets: 商详套图, 种草图文, 品牌 IP 形象

One product photo in, a full set of designed images out (titles, selling points and layout included).
This is a two-step flow and step 1 is free:

```bash
# 1) plan (free): the service studies the product and writes one prompt per image
node coolai.mjs imageset --pack ecommerce-image-set --slot product=chair.png \
     --modules hero=1,scene=2,detail=1 --lang 中文 --ratio 3:4 --prompt "墨绿绒布躺椅，可调靠背，侧边收纳袋"
# → set_id, plan (each row: module + prompt), quote

# 2) after the user agrees to the cost
node coolai.mjs imageset-generate <set_id> --confirm
```

- `--pack`: `ecommerce-image-set` (default), `social-image-set` or `ip-mascot-set`.
- `--modules key=count,...`: which images to make. Run `packs` for the keys of each pack, for example
  product detail: `hero` 首图, `scene` 场景图, `pain_point` 痛点图, `selling_point` 卖点图, `detail` 细节图,
  `usage` 用法图, `package` 包装图, `cta` 收尾图, `ingredient` 成分图, `structure` 结构图,
  `comparison` 对比图, `size` 尺码图. Map what the user asked for to these keys (主图 → `hero`).
  Leave it out to use the pack's default set. At most 16 images per set.
- `--slot product=<file>` is required for the product and lifestyle sets (repeat for more angles).
  The product set also takes `--slot person=` and `--slot background=`. For the mascot set a
  reference image is optional.
- `--lang`: text on the images: `中文` (default), `英文`, `无文案` (no text), `泰语`, `马来语`,
  `巴西葡萄牙语`, `不限`. Use `无文案` when the user wants clean images without text.
- `--prompt`: product facts the service cannot see in the photo (material, functions, sizes, audience,
  brand name) and any wishes like "首图不要纯白背景". `--ratio` (default `3:4`), `--style` / `--color`
  (ids from `styles`), `--model`.
- Show the user the plan in a short list (which image, what it will show) with the total cost. If
  they want to change one image: `imageset-edit <set_id> --row N --prompt "<full new prompt>"` (free),
  then generate.
- Planning takes 1–3 minutes, generating about 1 minute per image. `imageset-generate <set_id>` can be
  run again at any time to check progress and download.

### One image with a skill pack

```bash
node coolai.mjs packs                               # pick the pack and read its slots
node coolai.mjs image --pack product-white-background --slot product=photo.jpg --ratio 1:1
node coolai.mjs image --pack change-cloth --slot model=model.jpg --slot cloth=dress.jpg
```

Each pack has named image slots (`packs` lists them and which are required). Give every required
slot with `--slot key=<file or asset_id>`; `--ref` is shorthand for the first slot. `--prompt` is
optional with a pack and adds extra wishes.

### Free-form image

```bash
node coolai.mjs image --prompt "竖版双 11 促销海报，无线耳机，霓虹科技感" --ratio 3:4
```

Options: `--model KEY` (default: the first model from `models image`), `--ratio auto|1:1|3:4|4:3|9:16|16:9`,
`--resolution 1k|2k|4k`, `--quality low|medium|high`, `--count 1-4`, `--ref <file or asset_id>` (repeatable),
`--style` / `--color`. Images take about 30–90 seconds.

## Videos

### With a video skill (best for product, shop, brand and story videos)

```bash
node coolai.mjs skills                      # 19 skills in 4 categories; pick the one that fits
node coolai.mjs script --brief "奶白陶瓷香薰机，独居女生下班回家放松" --skill ecommerce-scene-seeding --duration 15 --ref product.png
# show the script, then run the `next` command it returns:
node coolai.mjs video --prompt-file <script_file> --duration 15 --skill ecommerce-scene-seeding --ref <asset_id>
```

Categories: 电商带货 (e-commerce: 口播带货, 促销转化, 场景种草, 痛点解决, 功能演示), 同城到店 (local shops),
品牌广告 (brand ads), 剧情短片 (short dramas: 对话, 反转, 悬念, 情绪, 产品植入). `script` options: `--brief`
one or two sentences about the product and the feeling wanted, `--skill KEY`, `--duration`, `--ref` (the
product photo helps a lot), `--style explain|ugc` (narration vs. real-person talk), `--lang zh|en`. It
costs a small number of credits and needs `--confirm`. Apply the user's edits to the script file if
they want changes, then make the video.

### 超越爆款 — beat a viral video

```bash
node coolai.mjs viral --video hit.mp4 --ref myproduct.png --duration 15 --scene commerce
```

Breaks down the reference video (up to 60 seconds) shot by shot, then writes a new script for the
user's own product. Options: `--ref` product images, `--scene commerce|local|home_service|education`,
`--lang zh|en`, `--note "extra wishes"`. Returns `script`, `script_file`, `breakdown_file` and a `next`
`video` command. Show the script, then make the video (price first, then `--confirm`).

### 深度复刻 — deep replica

```bash
node coolai.mjs replica --video dance.mp4 --person me.jpg --prompt "保持原视频动作和运镜，人物换成@人物1"
```

Keeps the reference video's moves, camera and pacing and swaps in the user's material:
`--product`, `--person`, `--background` (images, 8 in total at most, referred to in the prompt as
`@商品1`, `@人物1`, `@背景1`), `--voice` (one audio file). `--sound original` (keep the reference
sound, default) `| ai | mute`. `--duration` should match the reference video (4–60 s). Also `--model`,
`--resolution`, `--ratio`.

### Free-form video

```bash
node coolai.mjs video --prompt "..." --duration 10 --resolution 480p --ratio 9:16 --ref product.png
```

Options for every `video`: `--model KEY` (default `video.doubao_seedance_2_0_mini`; see `models video`),
`--duration` seconds (5–15 is typical; each model has its own maximum), `--resolution 480p|720p|1080p`,
`--ratio 9:16|16:9|1:1|3:4|4:3`, `--ref <file or asset_id>` (repeatable: images, a video or audio),
`--prompt-file FILE`, `--skill KEY`, `--no-audio`, `--no-wait`.

- References are named by type and order: the first image is `@图片1`, the second `@图片2`, a video is
  `@视频1`, audio is `@音频1`. Mention them in the prompt where they should appear.
- Videos take 2–10 minutes. The command waits and prints progress on stderr. If it times out, use
  `task <id> --wait`.
- 480p is the cheapest and is fine for drafts. Recommend 480p first, then a higher resolution only for
  the final take.
- Write the prompt in the language the voice-over should be spoken in.

## Rules

- **Real people.** If a reference image or video shows a real person's face, ask the user whether they
  have that person's permission. Only when they say yes, add `--portrait-consent` (`video`, `replica`).
  Never add it on your own. For face-swap and try-on packs, the same question applies before generating.
- **Other people's videos.** `viral` and `replica` are for learning from a reference and making the
  user's own video. Do not use them to copy someone's video for re-posting as-is.
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
- Website tools not in this skill yet (upscaling, subtitle / watermark removal, digital human, viral
  remix, editor, canvas): <https://www.coolai.mov>
