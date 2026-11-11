# COOL AI HTTP API (what `scripts/coolai.mjs` calls)

Base URL: `https://www.coolai.mov`
Auth header on every call: `Authorization: Bearer ml_sk_...` (the member's API key from
<https://www.coolai.mov/account/api-keys>). JSON bodies use `Content-Type: application/json`.
Errors come back as `{"detail": {"message": "...", "reason": "..."}}` with a 4xx status
(401 = bad key, 402 = not enough credits).

Prefer the script. Use these only when Node.js is not available. The same rule applies: get the
quote, tell the user the cost, and only create the task after they agree.

## Account

```bash
curl -s https://www.coolai.mov/api/v1/auth/me -H "Authorization: Bearer $COOLAI_API_KEY"
```

Fields: `display_name`, `member_level` (`vip` or `member`), `member_rate` (0.8 for VIP, 1 for Member), `credits`.

## Models and video skills (no auth needed)

```bash
curl -s https://www.coolai.mov/api/v1/model-routes/public      # .video.models[] / .image.models[] → key, display_name, resolutions, max_duration
curl -s https://www.coolai.mov/api/v1/video-creator/skills      # .items[] → skill_key, label, category.label, description
```

Skip models with `"enabled": false` or `"admin_only": true`.

## Upload a reference file (3 steps)

```bash
# 1) ask for an upload slot
curl -s -X POST https://www.coolai.mov/api/v1/assets/upload-policy \
  -H "Authorization: Bearer $COOLAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"filename":"product.png","mime":"image/png","size":123456}'
# → {"asset_id":"<uuid>","upload_url":"...","method":"PUT","headers":{...}}

# 2) send the bytes to upload_url (relative URLs are relative to the base URL)
curl -s -X PUT "<upload_url>" -H "Authorization: Bearer $COOLAI_API_KEY" -H "Content-Type: image/png" --data-binary @product.png

# 3) finish
curl -s -X POST https://www.coolai.mov/api/v1/assets/complete \
  -H "Authorization: Bearer $COOLAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"asset_id":"<uuid>"}'
```

The file is then available as `/media/uploads/<asset_id>`.

## Quote (no charge)

`POST /api/v1/credits/quote` with the same body you would send to create the task.
Response: `estimated_credits` (what this account pays), `list_credits` (Member price),
`vip_credits` (Lifetime VIP price), `available_credits`, `is_affordable`.

## Create a task

`POST /api/v1/batches`

Image:

```json
{
  "type": "image_generation", "tool_slug": "image-generation",
  "model_key": "image.gpt_image_2_6_sunburst", "logical_model_key": "image.gpt_image_2_6_sunburst",
  "count": 1, "generate_count": 1, "prompt": "...",
  "aspect_ratio": "1:1", "resolution": "1k", "quality": "high", "output_format": "png",
  "reference_urls": ["/media/uploads/<asset_id>"],
  "reference_elements": [{"asset_id": "<asset_id>", "media_type": "image", "mention_label": "图片1"}],
  "reference_slots": [{"key": "product", "name": "图片", "count": 1}]
}
```

Video:

```json
{
  "type": "video_generation", "tool_slug": "video-generation",
  "model_key": "video.doubao_seedance_2_0_mini", "logical_model_key": "video.doubao_seedance_2_0_mini",
  "count": 1, "generate_count": 1, "prompt": "...",
  "duration": 10, "duration_seconds": 10, "resolution": "480p", "aspect_ratio": "9:16",
  "mode": "text_to_video", "generate_audio": true,
  "reference_elements": [{"asset_id": "<asset_id>", "media_type": "image", "mention_label": "图片1", "url": "/media/uploads/<asset_id>"}],
  "skill_key": "ecommerce-scene-seeding"
}
```

`mention_label` is `图片N` / `视频N` / `音频N`, counted per type in order; the prompt refers to them as
`@图片1` etc. Add `"portrait_consent": true` only when the user has confirmed they have permission to
use the real person shown in a reference image.

The response has the task `id`.

## Task status and result

```bash
curl -s https://www.coolai.mov/api/v1/batches/<id> -H "Authorization: Bearer $COOLAI_API_KEY"
curl -s "https://www.coolai.mov/api/v1/batches?limit=10" -H "Authorization: Bearer $COOLAI_API_KEY"
```

`status`: `pending` / `running` → `succeeded` or `failed`. `progress` is 0–1. When it succeeded,
`result.outputs` is a list of paths such as `/media/uploads/gen-xxxx.mp4`; prefix the base URL to download.
Poll every 5–10 seconds. Failed tasks are refunded automatically.

## AI director script

1. `POST /api/v1/video-creator/conversations` `{"title": "...", "skill_key": "..."}` → `conversation.conversation_id`
2. Optional, improves results: `POST /api/v1/video-creator/vision` `{"asset_id": "<product image>"}` → `facts`
3. `POST /api/v1/video-creator/conversations/<cid>/script/stream` with header `X-Video-Director-Protocol: 3` and body
   `{"client_operation_id": "op_<random hex>", "message": "<brief>", "skill_key": "...", "script_language": "zh",
   "duration_seconds": 15, "reference_elements": [...], "attachments": [...], "script_style": "explain", "visual_facts": <facts or null>}`.
   This is an event stream; read it to the end. It charges a small number of credits.
4. `GET /api/v1/video-creator/conversations/<cid>/script/operations/<client_operation_id>` → `status`, `content` (the script).

Use the script text as the `prompt` of a video task.

## Image skill packs

```bash
curl -s https://www.coolai.mov/api/v1/tools/image-generation/skill-packs   # .skill_packs[] → skill_pack_id, label, reference_solt_config.solts[]
curl -s https://www.coolai.mov/api/v1/public/style-library                 # .styles[] / .colors[] → id
```

One image with a pack: an `image_generation` task plus `"skill_pack_id": "<id>"`. `reference_elements`
lists the images in slot order (`图片1`, `图片2` …) and `reference_slots` says how many images each slot
got: `[{"key": "model", "name": "模特", "count": 1}, {"key": "cloth", "name": "上身/全身装", "count": 1}]`.
`prompt` is optional.

## Image sets (商详套图 / 种草图文 / 品牌 IP 形象)

1. Plan (free) — `POST /api/v1/batches`:

```json
{
  "type": "ecommerce_image_set", "tool_slug": "ecommerce-image-set",
  "skill_pack_id": "ecommerce-image-set",
  "model_key": "image.gpt_image_2_6_sunburst", "logical_model_key": "image.gpt_image_2_6_sunburst",
  "rows": [{"module_key": "hero", "module_label": "首图 / 主视觉", "index": 0},
           {"module_key": "scene", "module_label": "场景图 / 使用", "index": 0}],
  "count": 2, "aspect_ratio": "3:4", "resolution": "1k", "quality": "high", "output_format": "png",
  "copy_language": "中文", "prompt": "product facts",
  "reference_elements": [{"asset_id": "<id>", "media_type": "image", "mention_label": "图片1", "ref_role": "product"}],
  "reference_slots": [{"key": "product", "name": "商品", "count": 1}],
  "analysis_only": true
}
```

For lifestyle posts add `"skill_pack_id": "social-image-set", "set_kind": "social", "title": "种草图文"`;
for mascots `"skill_pack_id": "ip-mascot-set", "set_kind": "ip", "title": "品牌 IP 形象"`. Optional
`style_id` / `color_id`. Module keys are listed by the script's `packs` command.

2. Poll `GET /api/v1/batches/<id>` until `status` is `succeeded`; `result.stage` is `analyzed` and each
   entry of `items[]` has `output.row.final_prompt` and `status: "pending"`.
3. Optional: `PATCH /api/v1/batches/<id>/ecommerce-image-set/analysis-row` `{"row_index": 1, "final_prompt": "..."}`.
4. Price: `POST /api/v1/batches/<id>/ecommerce-image-set/row-quote` `{}` → `credits`, `count`, `unit`.
5. Generate: `POST /api/v1/batches/<id>/ecommerce-image-set/row-generations` `{}` (charges the quoted credits),
   then poll the batch until no item is `running`; each item's `output.url` is the image.

## 超越爆款 (three tasks, each `POST /api/v1/batches` with `"tool_slug": "prompt-generator"`)

1. `{"type": "write_material_analysis", "reference_elements": [product images]}` → `result.items[] {label, description}` (skip if no images)
2. `{"type": "video_script_breakdown", "reference_elements": [{"asset_id": "<video>", "media_type": "video", "mention_label": "视频1"}]}` → `result.markdown`
3. `{"type": "write_script_generate", "reference_elements": [product images], "analyses": [...from 1], "characters": [],
   "business_scene": "commerce", "script_language": "zh", "duration_seconds": 15, "mode": "reference",
   "breakdown_batch_id": "<id from 2>", "extra_instruction": "..."}` → `result.markdown` (the script)

Quote each with `POST /api/v1/credits/quote` `{"type": "<type>", "tool_slug": "prompt-generator"}`.

## 深度复刻

```json
{
  "type": "depth_video_clone", "tool_slug": "depth-video-clone",
  "logical_model_key": "video.doubao_seedance_2_0_mini", "prompt": "what to change",
  "aspect_ratio": "9:16", "resolution": "480p", "duration_seconds": 10, "generate_count": 1,
  "generate_audio": false, "keep_source_audio": true,
  "reference_elements": [
    {"asset_id": "<video>", "media_type": "video", "mention_label": "视频1"},
    {"asset_id": "<image>", "media_type": "image", "mention_label": "商品1", "ref_role": "product"},
    {"asset_id": "<image>", "media_type": "image", "mention_label": "人物1", "ref_role": "person"}
  ],
  "confirmed_estimated_credits": 1.89
}
```

`confirmed_estimated_credits` is the `estimated_credits` from the quote for the same body.

