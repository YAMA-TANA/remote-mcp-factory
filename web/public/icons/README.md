# PicoSvc premium SVG icon family

17 original, code-authored SVG files: the PicoSvc brand plus the 16 service slugs. No image generation or raster images are used. Each standalone file uses a 64 × 64 grid, a layered charcoal background, controlled mint-to-lime gradient, soft radial illumination, edge highlights and restrained glyph shadows. Shapes remain distinct at 32–64 px.

The React UI loads the very same SVG files through `web/app/components/ServiceIcon.tsx` (rather than maintaining divergent inline copies). Reuse them as `<img src="/icons/shot.svg" alt="Screenshot API" />`. The site-wide favicon has the matching styling in `web/app/icon.svg`; localized service pages use their own SVG favicon. The code is safe to serve as standalone SVG and contains no external resources, scripts, embedded images or fonts.
