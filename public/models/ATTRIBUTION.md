# Model Attribution

## anime-character.glb

- **Model name:** AvatarSample_C (VRoid Studio stable sample model)
- **Author / copyright holder:** pixiv Inc. (VRoid Project)
- **Source URL (file):** https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/AvatarSample_C.vrm
- **Source repo:** https://github.com/madjin/vrm-samples (mirror of official VRoid sample models)
- **Official license info:** https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use
- **License:** CC0 1.0 (Public Domain Dedication)
- **Format:** binary glTF (`.glb` container; originally a `.vrm`, which is a glTF 2.0 file). Renamed to `.glb`; loadable by three.js `GLTFLoader`.
- **Date added:** 2026-06-21

### License statement (verbatim, from VRoid official FAQ)

> To the extent possible under law, pixiv Inc. has waived all copyright and related
> or neighboring rights to this model.

The VRoid Studio sample models (AvatarSample_A / B / C) are released under **CC0**:
copyright is waived, there is no usage limit, no need to credit the original creator,
and the files may be edited, used commercially, and redistributed. Source:
https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use

### Attribution string (optional under CC0, recommended courtesy)

> "AvatarSample_C" by pixiv Inc. (VRoid Project), licensed CC0 1.0.
> https://vroid.pixiv.help/hc/en-us/articles/4402614652569

CC0 does not require attribution, but the credit above is provided as a courtesy.

### Technical notes

- Embedded textures: yes — all 25 images are embedded in the GLB buffer (no external URIs).
- Materials: 14, all with a `pbrMetallicRoughness.baseColorTexture` (i.e. `material.map` in three.js).
- Orientation: Y-up. Stands on Y = 0.
- Approx. height: ~1.756 world units (human-scale, units are meters).
- Generator: UniGLTF-1.28; glTF asset version 2.0; contains a `VRM` extension (ignored by GLTFLoader).
