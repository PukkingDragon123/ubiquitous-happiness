// Pixel UI kit (v8b "deep ink"): THE STYLE GUIDE is the comment at the top of skins.ts (palette, spacing, how to make a
// panel / button / tag). See ui.ts for the immediate-mode API, skins.ts for panels/buttons, font.ts for text (Alagard),
// art.ts for icons/keycaps/cursors and crt.ts for the tube-TV material. ?preview=uikit shows every widget.
export { PixelUI, itemIconBox, fitIcon, drawCard, cardLayout, UI_TARGET_H, UI_MIN_H, UI_MIN_W, type TipLine, type ButtonOpts } from './ui';
export { drawText, measure, wrap, lineH, capH, glyphs, calibrateFonts, fontK, FONTS, type FontName, type TextOpts } from './font';
export { skin, btnSkin, btnFace, btnPlate, btnText, PAD, BTN, LIP, KIT, C, INK, rule, sectionHead, tag, bubbleArt, causticTile, type SkinKind, type BtnStyle, type BtnState } from './skins';
export { icon, iconTex, iconSize, keycap, keycapBody, closeArt, KEYCAP_H, cursorArt, cursorTex, mouseGlyph, mouseTex, ICON_NAMES, type CursorName } from './art';
export { crtMaterial, crtUv, type CrtMaterial } from './crt';
