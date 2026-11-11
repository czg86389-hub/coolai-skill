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
