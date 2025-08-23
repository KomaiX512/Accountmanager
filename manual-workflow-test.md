# 🧪 MANUAL IMAGE WORKFLOW STRESS TEST

Based on your logs showing the exact contamination issues:

## ❌ IDENTIFIED PROBLEMS FROM LOGS

1. **PNG→JPG Contamination**: Canvas Editor saves PNG (2799776 bytes) → Server saves as JPG
2. **Malformed Keys**: `image_.jpg` instead of proper campaign key  
3. **Fallback Contamination**: Post Now fetches 7781-byte placeholder instead of actual image

## ✅ FIXES IMPLEMENTED

1. **Server**: Now saves edited images as `edited_<originalKey>.png` (preserves PNG format)
2. **Client**: Updated extractImageKey to detect edited images first
3. **ContentType**: Server uses `image/png` for PNG files

## 🧪 MANUAL TEST SCENARIOS

### TEST 1: Campaign Post Editor Workflow
**Your exact case from logs:**
- Original: `campaign_ready_post_1755092143423_c61edd84.jpg` 
- Expected edited: `edited_campaign_ready_post_1755092143423_c61edd84.png`

**Steps:**
1. Open Canvas Editor on campaign post
2. Make any edit (add text, filter, etc.)
3. Click "Save Edited Post"
4. **VERIFY**: Console shows `✅ FIXED: Saving edited campaign image as PNG`
5. **VERIFY**: No `Found existing image with extension .jpg` message
6. Click "Post Now"
7. **VERIFY**: extractImageKey detects `edited_campaign_ready_post_1755092143423_c61edd84.png`
8. **VERIFY**: Post uploads image > 7781 bytes (not fallback)

### TEST 2: Regular Post Editor Workflow  
**Test with regular post pattern:**
- Original: `ready_post_1755000123.json` → `image_1755000123.jpg`
- Expected edited: `edited_image_1755000123.png`

**Steps:**
1. Open Canvas Editor on regular post
2. Make edit and save
3. **VERIFY**: Console shows `✅ FIXED: Saving edited regular image as PNG`
4. Click "Post Now"
5. **VERIFY**: extractImageKey detects `edited_image_1755000123.png`

### TEST 3: Extension Fallback Contamination
**Test that fallback doesn't cause loops:**
- Create post with mixed extensions (original .webp, edited .png)
- Verify fetchImageFromR2 tries correct order: PNG first, then fallbacks
- Ensure no 7781-byte placeholder contamination

### TEST 4: Cross-Format Validation
Test all combinations:
- **Original JPG** → Edit → **PNG saved** → Post Now uses **PNG**
- **Original PNG** → Edit → **PNG saved** → Post Now uses **PNG** 
- **Original WebP** → Edit → **PNG saved** → Post Now uses **PNG**
- **Original JPEG** → Edit → **PNG saved** → Post Now uses **PNG**

## 🔍 VERIFICATION CHECKLIST

### ✅ Server Logs Should Show:
```
[SAVE-EDITED-POST] ✅ FIXED: Saving edited campaign image as PNG: edited_campaign_ready_post_123_abc.png
[SAVE-EDITED-POST] ✅ Original preserved, edited version clearly marked
```

### ✅ Client Logs Should Show:
```
[extractImageKey] ✅ Edited campaign image pattern detected: edited_campaign_ready_post_123_abc.png
[PostNow] 📷 Fetching image for posting...
[PostNow] ✅ Image validated: 75000 bytes, type: image/png
```

### ❌ Should NOT See:
```
[SAVE-EDITED-POST] Found existing image with extension .jpg: campaign_ready_post_123_abc.jpg
[IMAGE] Fetching from R2: ready_post/instagram/fentybeauty/image_.jpg
[PostNow] Image size: 7781 bytes (FALLBACK)
```

## 🚨 CRITICAL FAILURE INDICATORS

1. **Format Reversion**: PNG editor data saved as JPG
2. **Malformed Keys**: `image_.jpg`, `edited_.png` patterns  
3. **Fallback Loop**: 7781-byte images in Post Now
4. **Extension Mismatch**: Fetching .jpg when .png exists

## 🎯 SUCCESS CRITERIA

**PASS**: Edited PNG image → Saved as PNG → Post Now uses PNG → No fallbacks
**FAIL**: Any step reverts to JPG or uses 7781-byte placeholder

## 🔧 QUICK DEBUG COMMANDS

```bash
# Check saved image format
ls -la ready_post/instagram/fentybeauty/edited_*

# Verify PNG signatures
head -c 16 ready_post/instagram/fentybeauty/edited_campaign_*.png | hexdump -C

# Check for fallback contamination  
find ready_post/ -name "*.png" -size 7781c
```

## 🧪 STRESS TEST MATRIX

| Original Format | Editor Format | Saved Format | Post Now Format | Expected Result |
|----------------|---------------|---------------|-----------------|-----------------|
| JPG            | PNG           | PNG           | PNG             | ✅ PASS        |
| PNG            | PNG           | PNG           | PNG             | ✅ PASS        |
| WebP           | PNG           | PNG           | PNG             | ✅ PASS        |
| JPEG           | PNG           | PNG           | PNG             | ✅ PASS        |

**Any deviation = CRITICAL FAILURE**
