---
name: Anthropic Art
author: HalfAI1102
sourceUrl: https://github.com/HalfAI1102/anthropic-art
install: git clone https://github.com/HalfAI1102/anthropic-art.git && cp -R anthropic-art/skill ~/.codex/skills/anthropic-art
category: visual
order: 1
---

---
name: anthropic-art
description: "Generate full-background editorial illustrations in Anthropic's hand-drawn visual language: warm or muted opaque color fields, irregular ivory carrier shapes, and bold black gestural linework. Use when the user asks for an Anthropic-style, Claude-style, hand-drawn AI editorial, newsroom, blog hero, social card, or conceptual illustration, especially when they explicitly require a colored background rather than a transparent icon."
---

# Anthropic Art

Create a new bitmap illustration from the user's topic. Preserve the visual system, not the literal objects in the references.

## Required reading

Read [references/style-spec.md](references/style-spec.md) before generating. Load the three files in `assets/` as style references when the image tool supports local reference paths.

## Workflow

1. Extract the subject, intended use, aspect ratio, and any exact text. Default to a square editorial card when the user does not specify dimensions.
2. Treat supplied images and bundled assets as style references, not edit targets, unless the user explicitly asks to alter one.
3. Select one full-bleed opaque background color from the verified palette in the style spec. Never default to transparency or a white outer canvas.
4. Reduce the concept to one visual metaphor with one dominant object or relationship. Prefer symbolic clarity over a busy literal scene.
5. Build a structured prompt using the prompt contract below.
6. Use the built-in image generation tool. Include the smallest useful set of bundled references, normally all three for a new topic.
7. Inspect the result. Reject or revise when the outer canvas is transparent, white, photographic, glossy, finely vectorized, text-heavy, or missing the ivory carrier shape.
8. Iterate with one targeted correction. Save project-bound final images in the workspace and report the final path and prompt.

## Prompt contract

Use this compact structure and replace bracketed text:

```text
Use case: stylized-concept
Asset type: [editorial card / newsroom hero / social image]
Primary request: Illustrate [topic] through the single metaphor of [metaphor].
Scene/backdrop: full-bleed opaque [palette name and hex] background covering every corner; no transparency, no white border, no isolated icon treatment.
Subject: [one dominant symbolic object or relationship], centered with generous breathing room.
Style/medium: Anthropic editorial illustration language; naive black ink gesture; thick, slightly uneven, rounded strokes; simplified anatomy and objects; deliberate asymmetry; flat two-dimensional forms.
Composition/framing: [aspect ratio], one focal cluster occupying roughly 65–80% of the frame; readable at thumbnail size.
Color palette: near-black #141413 linework; irregular ivory #FAF9F5 carrier shape; one full-frame accent background from the verified palette; at most one tiny secondary accent.
Materials/textures: clean flat color, subtle analog wobble only; no paper grain unless requested.
Text (verbatim): "[exact text]" or none.
Constraints: preserve the two-layer system—accent background behind an irregular ivory carrier shape, with black hand-drawn marks on top; keep the whole canvas opaque.
Avoid: transparent background, white outer canvas, black outer canvas, photorealism, 3D, gradients, shadows, glossy lighting, fine technical line art, corporate stock-vector polish, dense detail, logo, watermark, copied reference composition.
```

## Background rule

Interpret “带背景” as a full-frame opaque field, not merely a pale blob behind a transparent icon. Place the irregular ivory carrier shape inside that field. Allow black strokes to cross the ivory boundary sparingly, as in the references.

If the user requests a calmer page-native look, use ivory `#FAF9F5` as the full canvas and distinguish the carrier shape with `#F0EEE6` or `#E8E6DC`. Otherwise choose a muted accent background.

## Quality gate

Accept only when all are true:

- Every corner is opaque and intentionally colored.
- The image reads as one concept at thumbnail size.
- Black strokes are bold, rounded, and visibly hand-drawn rather than geometrically perfect.
- The ivory carrier shape is irregular and materially separates subject from background.
- The palette stays flat and limited to black, ivory, and one accent family.
- The composition is original and does not reproduce the house, globe, or lightbulb arrangements unless the user asked for those subjects.
