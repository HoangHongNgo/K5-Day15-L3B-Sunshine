---
name: threejs-stylized-mascot
description: >-
  Sculpt cute, lifelike 3D plush and designer-vinyl mascot characters in Three.js
  using MeshPhysicalMaterial (sheen, clearcoat), vertex-color fur gradients,
  continuous organic geometry, and expressive kawaii facial features.
---

# Stylized Cute & Lifelike 3D Mascot Design in Three.js

## 1. Tactile PBR Materials (`MeshPhysicalMaterial`)

Avoid flat `MeshStandardMaterial` plastic surfaces. Differentiate materials by real-world physical surface behavior:

- **Plush Fox Fur (Warm Sunset Orange & Cream Fluff)**:
  - Use `MeshPhysicalMaterial` with `vertexColors: true`, `roughness: 0.58`, `sheen: 0.88`, `sheenRoughness: 0.42`, `sheenColor: '#ffe0b5'`.
  - Velvety `sheen` scatters rim light at grazing angles like real short-pile plush fabric or soft animal fur.
- **Knitted Fabric (Scarf)**:
  - Warm crimson `#d43b36` with `roughness: 0.68`, `sheen: 0.95`, `sheenRoughness: 0.5`, `sheenColor: '#ffaba3'`.
- **Glossy Eyes & Wet Fox Nose**:
  - Deep espresso `#171d26` with `roughness: 0.12`, `clearcoat: 1.0`, `clearcoatRoughness: 0.06` so studio/AR lights create crisp natural specular highlights.
- **Explorer Boots & Campus Backpack**:
  - Matte-satin navy/charcoal upper (`roughness: 0.42`, `clearcoat: 0.2`) paired with warm off-white rubber soles/trim (`roughness: 0.65`) and brushed brass hardware (`metalness: 0.55`, `roughness: 0.3`).

## 2. Kawaii & Lifelike Fox Proportions

1. **Cupped Organic Fox Ears (Never Flat Extruded Triangles)**:
   - Construct smooth 3D cupped ear shells with rounded tips, forward concave hollow, soft peachy-pink inner ear lining, fluffy cream ear-base tufts, and natural dark russet-brown ear tips blended smoothly via vertex colors.
2. **Seamless Fox Mask, Plump Snout & Cheek Fluff**:
   - Blend the cream facial mask across the lower cheeks into a soft central snout bridge (no harsh vertical seam between two spheres) with cute side fur ruffs on both cheeks.
3. **Expressive Eyes & Cheerful Expression**:
   - Layer dark glossy iris, warm amber lower iris crescent, dual white catchlights (large upper-left + tiny lower-right), subtle upper lash/lid curve, rosy coral blush, and gently arched friendly eyebrows (avoid inward-tilted worried bars).
   - Sculpt a twin-curve `ω` fox smile with an articulated rosy inner mouth/tongue inside the `mouth` node for lively speech.
4. **Continuous Skinned Body, Fluffy Chest Tuft & Dual-Tone Tail**:
   - Add a soft cream chest fur tuft below the scarf above the plump cream belly.
   - Taper limbs organically into rounded cream paws with subtle toe-bean cushions and mini-boots with distinct soles.
   - Sculpt a full, S-curved fox tail with a natural zig-zag/feathered vertex-color transition from rich fox orange to a fluffy cream-white tip.
