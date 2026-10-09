# Changelog

All notable changes to CBrowser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [19.2.1](https://github.com/alexandriashai/cbrowser/compare/v19.2.0...v19.2.1) (2026-10-09)

### Fixed

* **mcp:** return attention heatmaps inline as previews fitted to the cap ([11d6eab](https://github.com/alexandriashai/cbrowser/commit/11d6eabcc47dfd1e0d853c6c44ee71479bda9161))
* **personas:** one resolver, one record per name, no cross-account reads ([692cf32](https://github.com/alexandriashai/cbrowser/commit/692cf321b88137ae1bd2bab851b9f2c2bd78c8e0))
* **security:** make evaluate_script red zone, refused without force ([9a33d9b](https://github.com/alexandriashai/cbrowser/commit/9a33d9bdaf7746caff4e8f5acb83f08b7b64c36e))

## [19.2.0](https://github.com/alexandriashai/cbrowser/compare/v19.1.9...v19.2.0) (2026-10-09)

### Added

* **intent:** port the locator cascade redesign of findElementByIntent (BUG-01) ([182db12](https://github.com/alexandriashai/cbrowser/commit/182db12001e13df47b603d298aa5fab7bc7b3993))
* **mcp:** describe find_element_by_intent as the cascade it is and type its new fields ([0b9cf20](https://github.com/alexandriashai/cbrowser/commit/0b9cf2091d80ee9d0511892a384af18de098d6dd))

### Fixed

* **intent:** a hidden exact match of another kind does not block a menu toggle (D2 round 3b) ([29f8588](https://github.com/alexandriashai/cbrowser/commit/29f8588d71c8b33d29a316fc036e12e893e3fb81))
* **intent:** close the cross-vendor audit findings on the cascade (D2 round 2) ([2671374](https://github.com/alexandriashai/cbrowser/commit/2671374fb1b7cf553fffedcd78fa7f487855b0ac))
* **intent:** close the final pre-ship audit of the cascade (D2 round 4) ([89a1518](https://github.com/alexandriashai/cbrowser/commit/89a1518fa89558bed2e8e54ddca097d8982e150c))
* **intent:** close the re-audit of round 2 (D2 round 3) ([0964c14](https://github.com/alexandriashai/cbrowser/commit/0964c1477d7246c9b3a1eac04e57ec7b57a00390)), closes [#sh](https://github.com/alexandriashai/cbrowser/issues/sh)
* **intent:** menu toggles, brand logos and collapsed navigations from unseen sites ([d23f79f](https://github.com/alexandriashai/cbrowser/commit/d23f79fc3d1233fccc4be23a64505aa968771e98))
* **intent:** must-fixes from the cascade review, each with its own fixture test ([e7c5edb](https://github.com/alexandriashai/cbrowser/commit/e7c5edb39782fc007cfba85db89c03846cdb53ba))
* **intent:** report the click gate's own verdict as find_element_by_intent's zone ([058194e](https://github.com/alexandriashai/cbrowser/commit/058194e9b2c0af5991a2ea0c5b60d843ae1a29f5))

### Changed

* **intent:** behaviour-preserving cleanup of the locator cascade ([30ffc05](https://github.com/alexandriashai/cbrowser/commit/30ffc0573fc7b15c25ba8c3798c2150116fbb5b5))
* **intent:** one prefilter round trip before the rungs ([b736c55](https://github.com/alexandriashai/cbrowser/commit/b736c55090c8d0031e80936a95bd65883b9eb31a))

## [19.1.9](https://github.com/alexandriashai/cbrowser/compare/v19.1.8...v19.1.9) (2026-10-09)

### Fixed

* **safety:** treat high-impact actions on named objects as red, not only on an account ([7eca417](https://github.com/alexandriashai/cbrowser/commit/7eca417c53802a96acdb3eba1e034aafb27b6853))

## [19.1.8](https://github.com/alexandriashai/cbrowser/compare/v19.1.7...v19.1.8) (2026-10-09)

### Fixed

* **safety:** close the gaps a cross-vendor audit reproduced in the red-zone gate ([7289204](https://github.com/alexandriashai/cbrowser/commit/7289204d29c7cb42121ae8eca99f3a1c4be7095e))
* **safety:** gate keystrokes that activate a red control, and narrow container text ([011d430](https://github.com/alexandriashai/cbrowser/commit/011d4302bffb6f6b518756a8482f1686de884c10))
* **safety:** judge a container click by the control at its centre ([0e02bff](https://github.com/alexandriashai/cbrowser/commit/0e02bff0de0fe517b9a5beb578ac6a29f4967431))
* **safety:** judge red-zone clicks by the element, not the selector string ([8c1db73](https://github.com/alexandriashai/cbrowser/commit/8c1db73c8ac3cf3621d023ac2b8cdd999753c449)), closes [#id](https://github.com/alexandriashai/cbrowser/issues/id)
* **safety:** judge what a pointer or Enter actually activates, including non-role items ([d09401f](https://github.com/alexandriashai/cbrowser/commit/d09401f20fb149cc96f15b3c84259210e5dccabe))
* **safety:** judge what the pointer reaches, and stop refusing fields and inert text ([45d0e1e](https://github.com/alexandriashai/cbrowser/commit/45d0e1e7f01568fabe97ccc94a46bd0ccf0b192a))
* **safety:** pin every audited shape and close the round-6 gaps in the red-zone gate ([0f6f3e5](https://github.com/alexandriashai/cbrowser/commit/0f6f3e5bfd266665c3ead490381cce5b5b13bffa))

## [19.1.7](https://github.com/alexandriashai/cbrowser/compare/v19.1.6...v19.1.7) (2026-10-07)

### Fixed

* **empathy:** do not flag hover on elements that are themselves keyboard paths (BUG-03) ([7e08496](https://github.com/alexandriashai/cbrowser/commit/7e08496af12b15011e9ad52e3d5e7ca3e7f7de88))
* **find-element:** round confidence to 2 decimals (BUG-01, LOW-07) ([10598a1](https://github.com/alexandriashai/cbrowser/commit/10598a1050a66c9b518769e73c5f023910efcc96))

## [19.1.6](https://github.com/alexandriashai/cbrowser/compare/v19.1.5...v19.1.6) (2026-10-07)

### Fixed

* **agent-ready-audit:** remediation keeps real accessible names (BUG-04) ([c35375d](https://github.com/alexandriashai/cbrowser/commit/c35375de46985a87b6fdab1e535059fbfe6bd40f))
* **billing:** bill only what ran (P-09) - refund isError results, flag every error return ([6da7718](https://github.com/alexandriashai/cbrowser/commit/6da7718aa48c009ede2776aa8a90ba05ba98d319))
* **empathy:** real persona names, wcag 2.2.2 only, declared disability labels (LOW-01..06,08) ([5d1126b](https://github.com/alexandriashai/cbrowser/commit/5d1126b28af422084492f7b709335f27cd3da107))
* **screenshot:** fit the byte budget in memory, never resize the live viewport (BUG-02) ([04776bd](https://github.com/alexandriashai/cbrowser/commit/04776bdf924215dc9ace2a02d211aac04bcdf09c))

## [19.1.5](https://github.com/alexandriashai/cbrowser/compare/v19.1.4...v19.1.5) (2026-09-18)

### Fixed

* **ci:** make the release gate green — hermetic config test, one browser list ([30aaa8e](https://github.com/alexandriashai/cbrowser/commit/30aaa8eb76d6ce238916cc4deeb0ddbe4ba4d794))
* **recording:** enforce the trigger timeout when a page probe never answers ([5fd4d98](https://github.com/alexandriashai/cbrowser/commit/5fd4d98f2bac1eaa705adb8c61590f560fe33b3f))
* **security:** allowlist OAuth redirect_uri and require PKCE ([bbb2e49](https://github.com/alexandriashai/cbrowser/commit/bbb2e4991dc31dd2917e71488a414dc8d7437026))
* **sessions:** gate the host-wide Chrome reaper off by default ([31c1b10](https://github.com/alexandriashai/cbrowser/commit/31c1b10d23929ff3cc7bb28b10ae9aae60e28a12))

## [19.1.4](https://github.com/alexandriashai/cbrowser/compare/v19.1.3...v19.1.4) (2026-08-15)

### Fixed

* price tools by name, not by functional category — 18 free tools were refused ([50a682b](https://github.com/alexandriashai/cbrowser/commit/50a682b05b2c26b2216f674c25e1da75e99f66cc))
* **test:** stop reading the private repo's absolute path from the package suite ([7604769](https://github.com/alexandriashai/cbrowser/commit/76047691603dce0825e0f448975effb4c3b197c3))

## [19.1.3](https://github.com/alexandriashai/cbrowser/compare/v19.1.2...v19.1.3) (2026-08-12)

### Fixed

* **ci:** quarantine the change-tiers file on CI only, and say so on every run ([6b10d25](https://github.com/alexandriashai/cbrowser/commit/6b10d2505f4b0efc7b801f1acd192a5565702b15))

## [19.1.2](https://github.com/alexandriashai/cbrowser/compare/v19.1.1...v19.1.2) (2026-08-12)

### Fixed

* bound the capture stop in the change-tiers helper, and share the bound ([c53b365](https://github.com/alexandriashai/cbrowser/commit/c53b36561287d1304691e4e9d4bb4b69a6b31ff7))

## [19.1.1](https://github.com/alexandriashai/cbrowser/compare/v19.1.0...v19.1.1) (2026-08-12)

### Fixed

* **ci:** retry the isolated browser runs once, and say so when it happens ([17679d1](https://github.com/alexandriashai/cbrowser/commit/17679d1c4f7aa91ae584370151eb6bf5e07edd76))

## [19.1.0](https://github.com/alexandriashai/cbrowser/compare/v19.0.2...v19.1.0) (2026-08-12)

### Added

* add `cbrowser uninstall` — npm leaves the credentials behind ([5b1de6a](https://github.com/alexandriashai/cbrowser/commit/5b1de6ae15a9ef122facc9de1b453fac71419e63))

### Fixed

* **ci:** stop discovering test files inside build output ([25f213f](https://github.com/alexandriashai/cbrowser/commit/25f213f1f945abd1550460349ee92b9a51798ad3))
* **security:** write the API key owner-only, and warn on loose credential files ([b12de92](https://github.com/alexandriashai/cbrowser/commit/b12de924020dbfa3aa9849a07b9e6ce8e04a1907))

## [19.0.2](https://github.com/alexandriashai/cbrowser/compare/v19.0.1...v19.0.2) (2026-08-12)

### Fixed

* **ci:** isolate every file the release gate quarantines, not just three of them ([3589335](https://github.com/alexandriashai/cbrowser/commit/35893351758a5416507727a8592cc9d91bccec6c))

## [19.0.1](https://github.com/alexandriashai/cbrowser/compare/v19.0.0...v19.0.1) (2026-08-12)

### Fixed

* complete the WCAG criteria table so the level filter can evaluate every criterion ([808a817](https://github.com/alexandriashai/cbrowser/commit/808a817ade8f4089a7c9b1e6fa35dc17d18cf730))
* default demographics on JSON personas instead of crashing the judge ([a609c6f](https://github.com/alexandriashai/cbrowser/commit/a609c6f0a5cbb2761db093e3acf778e983771a1e))
* derive the WCAG list from barriers so detected violations stop vanishing ([1000cca](https://github.com/alexandriashai/cbrowser/commit/1000ccacfbe5f99916dc1169695806a7755010ee))

## [19.0.0](https://github.com/alexandriashai/cbrowser/compare/v18.82.2...v19.0.0) (2026-08-11)

### ⚠ BREAKING CHANGES

* **agent-ready:** `score.accessibility`, `summary.dynamicContentCount` and
`comparison.bestAccessibility` are removed. Use `score.agentPerceivability`,
`summary.deferredLoadingPatterns` and `comparison.bestAgentPerceivability`, which
have carried identical values since 18.82.0. Issues now carry
`category: "agentPerceivability"`; the old value is still accepted on input and
scores identically, so senders need not change immediately — readers do.

suite 1252 -> 1258 pass / 0 fail   tsc exit 0

### Added

* **agent-ready:** remove the deprecated accessibility axis and its aliases ([cc5a064](https://github.com/alexandriashai/cbrowser/commit/cc5a0647ad202c87f299075cbdfdf382fcb35a8e))
* **attention:** freezeAnimations flag, and say what actually ran ([6fbec2e](https://github.com/alexandriashai/cbrowser/commit/6fbec2e9eec19b2f1feecd3c3b419e5c6b9d0024))
* **attention:** publish the basis behind each attentionQuality ratio ([a5ff68e](https://github.com/alexandriashai/cbrowser/commit/a5ff68ef8bc047560dbd7974ec06877680e53777))

### Fixed

* **agent-ready:** count sticky overlays, stop hiding them in a 40-60px gap ([6a0d860](https://github.com/alexandriashai/cbrowser/commit/6a0d86028ed684d3da550764fe75328d8fd65bb1))
* **benchmark:** reconcile strengths against issues, dedupe advantages ([db4dbe3](https://github.com/alexandriashai/cbrowser/commit/db4dbe3760c266772c759c3218239de2c79559f7))
* **benchmark:** stop recommending reference sites that share the defect ([e4df3e2](https://github.com/alexandriashai/cbrowser/commit/e4df3e20f678d347f4eaafaa838c0f706636aefa))
* **bug-hunter:** a missing alt and alt="" are different defects ([971bcd0](https://github.com/alexandriashai/cbrowser/commit/971bcd09272dfff400c913f7bdc7e926ec5fdada))
* **empathy:** make scope:"viewport" actually scope ([5eaf073](https://github.com/alexandriashai/cbrowser/commit/5eaf0737d056195d69790196c7dcada4d99110e9))
* **relevance:** pass accessibility traits to the LLM relevance judge ([b1d3f16](https://github.com/alexandriashai/cbrowser/commit/b1d3f16e3612a5c9c3af83cacf026c6781000af3))
* **test:** remove a machine-dependent persona fixture that broke CI ([8dc1a0e](https://github.com/alexandriashai/cbrowser/commit/8dc1a0ee89307e1c920e59c7ad8091c4429d15aa))

### Changed

* **agent-ready:** rename the accessibility axis and dynamicContentCount ([0232888](https://github.com/alexandriashai/cbrowser/commit/0232888bff3695ba2bddd651754ccd61c91ef730))

## [18.82.2](https://github.com/alexandriashai/cbrowser/compare/v18.82.1...v18.82.2) (2026-08-06)

### Fixed

* **attention,goals:** isolate siteFamiliarity from attention, wire GoalDecomposer ([c807153](https://github.com/alexandriashai/cbrowser/commit/c8071533ac45958fa5bf88bb39bf16f5402ac9c2))
* **attention:** anchor semantic patterns, widen ratio window, reconcile narrative ([2cca3e8](https://github.com/alexandriashai/cbrowser/commit/2cca3e8f15fdecf61e362ad77a93db36b58a5a01))
* **attention:** size the hotspot pool to the grid, not a hard 10 ([26e80b4](https://github.com/alexandriashai/cbrowser/commit/26e80b40aaa11e761918b96b32c9cb017af02c4c))
* **widget-kit:** two chip/tab foregrounds that failed WCAG AA ([66818cd](https://github.com/alexandriashai/cbrowser/commit/66818cd40ce731eb4c873f5e38b4ef9ac1728d65)), closes [#fff](https://github.com/alexandriashai/cbrowser/issues/fff)

## [18.82.1](https://github.com/alexandriashai/cbrowser/compare/v18.82.0...v18.82.1) (2026-08-05)

## [18.82.0](https://github.com/alexandriashai/cbrowser/compare/v18.81.4...v18.82.0) (2026-08-04)

### Added

* **attention:** calibrate the model against real eye-tracking ([2da2058](https://github.com/alexandriashai/cbrowser/commit/2da205888a7ba7ba12a8efb6cfca1adbb311f4ad))

### Fixed

* **agent-ready-audit:** stop grading pages that never loaded ([515484d](https://github.com/alexandriashai/cbrowser/commit/515484d187c9ea0b8c9758bcb72cc1aef4e0740d))

## [18.81.4](https://github.com/alexandriashai/cbrowser/compare/v18.81.3...v18.81.4) (2026-08-04)

## [18.81.3](https://github.com/alexandriashai/cbrowser/compare/v18.81.2...v18.81.3) (2026-08-04)

### Fixed

* one height measurement, shared by every derivation of it ([ffdd1d1](https://github.com/alexandriashai/cbrowser/commit/ffdd1d1a234db64c1760bdda7a0f91ee915258d4))

## [18.81.2](https://github.com/alexandriashai/cbrowser/compare/v18.81.1...v18.81.2) (2026-08-03)

### Fixed

* attentional reading cost stops falling as the page grows, and one capacity bridge ([8c3202e](https://github.com/alexandriashai/cbrowser/commit/8c3202e707217859153f99896518d18b17ba90a3))
* scope-dependent prose varies with scope, and a floored layer says which floor ([5629466](https://github.com/alexandriashai/cbrowser/commit/5629466f03c64a8d9236cd6a39c442ffa6c3128d))

## [18.81.1](https://github.com/alexandriashai/cbrowser/compare/v18.81.0...v18.81.1) (2026-08-03)

## [18.81.0](https://github.com/alexandriashai/cbrowser/compare/v18.80.0...v18.81.0) (2026-08-03)

### Added

* give the deploy-freshness probe a consumer ([0dd9f16](https://github.com/alexandriashai/cbrowser/commit/0dd9f16546326e7727365f8525c0e888d2aea7e7))

### Fixed

* a declared scope reaches the measurement, not just the response ([95e80ca](https://github.com/alexandriashai/cbrowser/commit/95e80cac175d08559c9579feec372d67b4002fbc))
* navigate stops reporting success on a page it did not fetch ([fd2e687](https://github.com/alexandriashai/cbrowser/commit/fd2e687747279b49472c32fe788a11643caff218))
* serve OAuth metadata instead of 401ing our own discovery document ([4471268](https://github.com/alexandriashai/cbrowser/commit/4471268742d10ca367d5b64e4b6a5a91a5651494))

## [18.80.0](https://github.com/alexandriashai/cbrowser/compare/v18.79.0...v18.80.0) (2026-08-03)

### Added

* **agent-ready-audit:** detect client-only content, and stop dropping critical findings ([fb1e42b](https://github.com/alexandriashai/cbrowser/commit/fb1e42bb1f14b6348dfbcc9ab43c58cf55c7e377))
* attentional reading cost gets a home (BUG-07) ([97733b8](https://github.com/alexandriashai/cbrowser/commit/97733b82b3017b1e03b3ab4584f55fa87dbd607c))
* **attention:** judge relevance from colour, size and the screenshot ([3397641](https://github.com/alexandriashai/cbrowser/commit/3397641fd658299a5356d01b5accec743a9ce460))
* **attention:** per-word text painting and fractional cell coverage ([b484975](https://github.com/alexandriashai/cbrowser/commit/b48497504aa2391171e91926eee99c7e884e1220))
* **attention:** persona-aware relevance judging via an llm call ([e8bdcb7](https://github.com/alexandriashai/cbrowser/commit/e8bdcb741f890e2d919b9c0b943e53f3bf64e750))
* **attention:** trait semantics, per-moment reasoning, capture summary ([6a3a8f2](https://github.com/alexandriashai/cbrowser/commit/6a3a8f2c8d56e3539b1072757e7b6371d324352c))
* **attention:** use judged relevance in the live path, gate it to pro ([48d9ff2](https://github.com/alexandriashai/cbrowser/commit/48d9ff258a65c731274174a866b8229ec1405f29))
* **capture:** attention overlay, public artifact URLs, free-tier registration ([f3dd8b6](https://github.com/alexandriashai/cbrowser/commit/f3dd8b6de3545320c2b12e6c74df39b3d26112bb))
* **capture:** interaction pulses, and an action log so the summary stops guessing ([2e10c4c](https://github.com/alexandriashai/cbrowser/commit/2e10c4c3c4a607e658e7aa69e1a6f1ae303487e8))
* **capture:** report whether the requested persona actually resolved ([5c3579c](https://github.com/alexandriashai/cbrowser/commit/5c3579cf902475753cb5822a311cf766eb0760e9))
* **capture:** return an opening frame and viewport from capture_start ([198ae8e](https://github.com/alexandriashai/cbrowser/commit/198ae8e6ea2770d88a0f2984fbc95ef701a19fb8))
* **capture:** standalone html player published at a public url ([490446a](https://github.com/alexandriashai/cbrowser/commit/490446a2dc4d3c01b89233e4548a027add9d8ae6))
* **config:** retention for videos and browser state, disabled by default ([5d89aba](https://github.com/alexandriashai/cbrowser/commit/5d89aba68c319f5928703d97da5dfbbadcb60ba1))
* declare and control measurement scope (BUG-14 / D-7) ([b8ed291](https://github.com/alexandriashai/cbrowser/commit/b8ed29189b96f7932673da0bc0562d321ab4b744))
* **empathy:** barrier overlay as an MCP Apps view, retiring mcp-ui ([80bb86a](https://github.com/alexandriashai/cbrowser/commit/80bb86a750f85a0a95e741927aa8ece87209ae46))
* **empathy:** detect missing audio description, and draw the findings that matter ([836cc2c](https://github.com/alexandriashai/cbrowser/commit/836cc2cced1083e16f543e4b40ae052726d8504b))
* **empathy:** persona-weighted severity, plus rect and attention disclosure ([f95b7de](https://github.com/alexandriashai/cbrowser/commit/f95b7de686360e2d6b041dd962cd5046cdf9ca6e))
* **mcp:** add a widget kit and a persona view built on it ([66230e7](https://github.com/alexandriashai/cbrowser/commit/66230e70b9575c5c00dcfb1345b97452cec8fa1a))
* **mcp:** add inline-UI probe and align pre-auth capabilities ([ab3016b](https://github.com/alexandriashai/cbrowser/commit/ab3016be8635bd248bb32d93f2e366dad0d2ebbd)), closes [modelcontextprotocol/ext-apps#671](https://github.com/modelcontextprotocol/ext-apps/issues/671)
* **mcp:** add persona_lookup and trait tooltips ([0fe6e57](https://github.com/alexandriashai/cbrowser/commit/0fe6e57e6bca0376ec5a34b040d5dad208810028))
* **mcp:** inline view for persona_trait_lookup ([37b934e](https://github.com/alexandriashai/cbrowser/commit/37b934edae038f5aad6d46f26cb11c136ddaaf46))
* **mcp:** probe whether the widget sandbox allows data: URIs ([7447f7c](https://github.com/alexandriashai/cbrowser/commit/7447f7c393912e745210931b20d85c23d09e3e6e))
* **mcp:** rebuild the status widget as a health card ([6694b1c](https://github.com/alexandriashai/cbrowser/commit/6694b1cd9bc7672a23d2506c547022643c60b5d2))
* **mcp:** redesign the status widget around hierarchy and brand ([a7aab83](https://github.com/alexandriashai/cbrowser/commit/a7aab839904161e878fe063509bf8d5962c77a87))
* **mcp:** render images in views via artifact_fetch ([3bfdaf6](https://github.com/alexandriashai/cbrowser/commit/3bfdaf640548952868356e98ff6c186a16cb26ba))
* **mcp:** return UI panels as embedded resources, starting with status ([7f57b7c](https://github.com/alexandriashai/cbrowser/commit/7f57b7c871ab73255aee24759ca6df8071aecb9a))
* **mcp:** screenshot view, and stop images filling the whole result budget ([c1ffa47](https://github.com/alexandriashai/cbrowser/commit/c1ffa4759ffac4aad4a0fded85042858a8abcebe))
* **mcp:** views for hunt_bugs and empathy_audit ([d05a810](https://github.com/alexandriashai/cbrowser/commit/d05a810b5359f660af45970f1ba9ea91bdd8c8d9))
* **persona:** define the four personas that only existed as values profiles ([06e621d](https://github.com/alexandriashai/cbrowser/commit/06e621dbc7f439924a2045209725067f76f71716))
* **persona:** derive values from the Big Five, and say which links are guesses ([1c8f886](https://github.com/alexandriashai/cbrowser/commit/1c8f886d3db5ed0fe48f521aff5dd7ead35c08bb))
* **personas:** completeness criteria enforced at creation, plus update and delete ([d1583d1](https://github.com/alexandriashai/cbrowser/commit/d1583d10513c1f2528c293c6aca92d2f8206b6d0))
* **personas:** derive attentionPattern from traits, and report when a declaration disagrees ([97f3a2b](https://github.com/alexandriashai/cbrowser/commit/97f3a2bd3d43e938eaa2625ed1cb083be5fc03c4))
* **persona:** separate unpopulated axes from net-zero ones ([fa96feb](https://github.com/alexandriashai/cbrowser/commit/fa96feb53ed1054413fe81922f54474655f22450))
* **personas:** infer Big Five from a description, as its own route ([ec3231b](https://github.com/alexandriashai/cbrowser/commit/ec3231b05952d793e7c791a043095db731360011))
* **personas:** persona_manager, one interactive surface for CRUD ([1680874](https://github.com/alexandriashai/cbrowser/commit/1680874a01816573f43856d59d2aa40919993e0f))
* **personas:** three creation routes in the manager, with route-specific fields ([057d84c](https://github.com/alexandriashai/cbrowser/commit/057d84c08b77b890f217b74465889ded541a425b))
* **personas:** widgets for create and update, and description-drift reporting ([afa6779](https://github.com/alexandriashai/cbrowser/commit/afa67796663e6f3a7295efe09442549940f1f19f))
* reading capacity enters accessibility_traits (BUG-10 / D-2) ([b2e1979](https://github.com/alexandriashai/cbrowser/commit/b2e1979bc8ffed43e6064d590ff4e0feee9d7a44))
* score a page as a sequence of screens, not one aggregate ([d9921d0](https://github.com/alexandriashai/cbrowser/commit/d9921d01391512945684a83643d16bbedfc0a9ed))
* **server:** scope persona reads to the calling account, per request ([8ab89eb](https://github.com/alexandriashai/cbrowser/commit/8ab89eb5bc538a5d8ffb6558b1ed1f613c973d6c))
* split motor into target acquisition and sequence execution ([3a849b5](https://github.com/alexandriashai/cbrowser/commit/3a849b56a1b61dd7a01aeee0756ec615274c5bc9))
* **visual:** export computeLabSaliency for parameter sweeps ([19f5ff1](https://github.com/alexandriashai/cbrowser/commit/19f5ff18190132533974f7eceb1fa7e679629cd9))
* **widget:** chain bars open into each layer's overlay ([eeb7b6b](https://github.com/alexandriashai/cbrowser/commit/eeb7b6b2115d960bd447c5f4d132ba0d7031821b))
* **widgets:** inline persona editor that writes back through callServerTool ([b64188a](https://github.com/alexandriashai/cbrowser/commit/b64188a211e1c04bc704c21058c48fcaab87a1cc))

### Fixed

* a form's button is a call to action (BUG-19) ([db5266e](https://github.com/alexandriashai/cbrowser/commit/db5266eb2a85d61310581e1572bb66521e4ea268))
* abandonment floor, cost-floor blindness, and a silent cap (BUG-17/18/16) ([f707a3f](https://github.com/alexandriashai/cbrowser/commit/f707a3fbb2cec5e0dc363e87ef1270c678a404ca))
* **attention:** extract page content, and stop one element crushing the field ([a453172](https://github.com/alexandriashai/cbrowser/commit/a45317236fcf57264a13cd8a7dc56e5927a51b86))
* **attention:** surface the judge's reasoning on screenshot analysis ([4d380d2](https://github.com/alexandriashai/cbrowser/commit/4d380d2dc64b6fd33ff83696772433202abeda66))
* bound the correlated pointing correction (BUG-02) ([e1f61cf](https://github.com/alexandriashai/cbrowser/commit/e1f61cfecec1e954f0961ce20bc1a7cc54129067))
* capacity depletes proportionally instead of hitting a wall ([8d931bd](https://github.com/alexandriashai/cbrowser/commit/8d931bd69e5cf4242266630fc9a75aa764dadfbc))
* **capture:** artifact urls, overlay metadata and judged moments all reached callers ([52ba6f8](https://github.com/alexandriashai/cbrowser/commit/52ba6f8fd3419ca824fb6dda8ea40aca3f517d5e))
* **capture:** correct heat for scroll drift, add playback speed control ([c960b95](https://github.com/alexandriashai/cbrowser/commit/c960b959657ca650e48f1d6d64dc5b6f9c9491b1))
* **capture:** judge each frame against the dom it actually had ([279ead7](https://github.com/alexandriashai/cbrowser/commit/279ead75fb99a51a02985773f12d51cfade4407a))
* **capture:** per-frame dom in rendering, cache poisoning, and a narrative that invented behaviour ([f94dde4](https://github.com/alexandriashai/cbrowser/commit/f94dde4b7ca204eb5e261ee6b0a4008874518546))
* **capture:** record interactions across navigation; add interaction track ([4431173](https://github.com/alexandriashai/cbrowser/commit/443117364f997f40198bce7f2f91e0206dbf5c0d))
* chain coefficient units, attention classifier gaps, accordion layout ([3961fd4](https://github.com/alexandriashai/cbrowser/commit/3961fd44e16c0af79bcb9c2a46a975843eefff09))
* elderly-user proceduralFluency 0.4 -> 0.5, from its own research page ([24e81a9](https://github.com/alexandriashai/cbrowser/commit/24e81a9d2c8dc5744000a4052938ef4b72af88b4))
* **empathy,widgets:** saturating deduction ceiling, readable tables, tool links ([926580a](https://github.com/alexandriashai/cbrowser/commit/926580ae525f63cb39559584fcafb15172f7a418))
* **empathy:** captions detector asserted a verdict the page could not support ([a2b356b](https://github.com/alexandriashai/cbrowser/commit/a2b356b4644e5875af99ad5a65a5a82b607dc830))
* **empathy:** make the barrier map agree with the findings beneath it ([1b87558](https://github.com/alexandriashai/cbrowser/commit/1b87558ffb02a525e5b0b93acb2ed9704a2c418d)), closes [#1](https://github.com/alexandriashai/cbrowser/issues/1) [#1](https://github.com/alexandriashai/cbrowser/issues/1)
* **empathy:** publish only the attention values that feed the score ([d8132f6](https://github.com/alexandriashai/cbrowser/commit/d8132f696b342db530ec69762b08395cc5959e38))
* **empathy:** recognise screen-reader-user, split sensory barriers by criterion ([538681c](https://github.com/alexandriashai/cbrowser/commit/538681c22d350434c95e7b59682899bb685fa152))
* **empathy:** resolve barrier weights by criterion, unorphan criteria at dedup ([1f03112](https://github.com/alexandriashai/cbrowser/commit/1f031128d61aef2a7cdbc880d64fd0b2ad0864b8))
* **empathy:** score with the same weights the barrier list displays ([0ddb402](https://github.com/alexandriashai/cbrowser/commit/0ddb40291f6b019fde403456f7af9b93cc181184)), closes [#1](https://github.com/alexandriashai/cbrowser/issues/1) [#2](https://github.com/alexandriashai/cbrowser/issues/2)
* **empathy:** unorphan WCAG criteria, correct persona mapping, inline overlay ([cb928eb](https://github.com/alexandriashai/cbrowser/commit/cb928eb053ad2f125768cb10737ae74db5d4eea0))
* gate domains on the resolved URL, not the requested one (BUG-15 / D-10) ([69d451f](https://github.com/alexandriashai/cbrowser/commit/69d451f83f7aa256eeaedbca859e0b03950f106e))
* identify motor barriers, scope attention verdicts, resolve names tolerantly ([307a755](https://github.com/alexandriashai/cbrowser/commit/307a755a7ab80a782b9eda6cb5ff7758aefcc302))
* **isa:** repair four probes, three of which could never pass and one that never ran ([aeb4fa8](https://github.com/alexandriashai/cbrowser/commit/aeb4fa8fd381d2afdfe5c279a819a78e49faa107))
* **mcp:** declare views properly instead of embedding HTML in results ([249ebe1](https://github.com/alexandriashai/cbrowser/commit/249ebe1382ddad56e4b87eb6f749ec1a422626b9))
* **mcp:** drop the empty outputSchema from status and persona_lookup ([1d0d374](https://github.com/alexandriashai/cbrowser/commit/1d0d374e49ce9f73dc537a19ab07cae4a6a1d7f1))
* **mcp:** inline the ext-apps bundle instead of importing from esm.sh ([e5925eb](https://github.com/alexandriashai/cbrowser/commit/e5925ebe7e3afe2593428739363a23c899aa07d6))
* **mcp:** keep _meta and outputSchema in the public tool manifest ([ee80ea6](https://github.com/alexandriashai/cbrowser/commit/ee80ea6cfa26cd509be392e12a59c60c512ce0fe))
* **mcp:** make capture views discoverable via resources/list ([c78c773](https://github.com/alexandriashai/cbrowser/commit/c78c773d09684c981fdf6bc011a02e3dfe1e9b5d))
* **mcp:** make UI resource registration idempotent ([4f9d3ca](https://github.com/alexandriashai/cbrowser/commit/4f9d3ca7c09157ab7e66944ec4654452946a8a92))
* **mcp:** render arrays of objects as tables instead of joining them ([ac22a34](https://github.com/alexandriashai/cbrowser/commit/ac22a3481155ce39a2948ac2324403f1c37fd857))
* **mcp:** serve the trait view under a fresh URI, revert the bisect ([a956d78](https://github.com/alexandriashai/cbrowser/commit/a956d7836570fd9b4b2e8d658ca2f1ffacfed244))
* **mcp:** stop attention_analysis blowing the host result cap ([28e5786](https://github.com/alexandriashai/cbrowser/commit/28e5786fd811707d1c00c4fd4a46960694afca58))
* **mcp:** stop views rendering twice when a result is delivered again ([3d3894e](https://github.com/alexandriashai/cbrowser/commit/3d3894ee747e1d9f6b947728d33ef6c6c85bbe6b))
* motor surplus, and the layer note D-9 asked for ([5f57157](https://github.com/alexandriashai/cbrowser/commit/5f57157e93151c43ba6a069fbfd2b85e5aaa849b))
* one authoritative field per reading dimension (BUG-13 / D-11) ([1666f4a](https://github.com/alexandriashai/cbrowser/commit/1666f4a1c5323ac12a3f4877125868ec8e4cb21f))
* **page-understanding:** emit document-unique selectors ([5518709](https://github.com/alexandriashai/cbrowser/commit/551870999747fe2d98351f7853e91946b7f56395))
* **persona:** compute the rollups, break the susceptibility ties, regenerate values ([682f081](https://github.com/alexandriashai/cbrowser/commit/682f08109655becb10decbfd6ebbd9a775b5544a))
* **persona:** one values resolver for both tools, and flag the unrunnable ones ([ca3e762](https://github.com/alexandriashai/cbrowser/commit/ca3e762ea34beec976b5b710775970d64ea3f6ce))
* **persona:** put the two kinds of 0.5 in the value, and name siteFamiliarity as a variable ([d00e133](https://github.com/alexandriashai/cbrowser/commit/d00e13302a4ea0c4998a3d1a56a474d557eb5e57))
* **persona:** read the values the persona carries, and stop passing defaults off as derivations ([322cfdf](https://github.com/alexandriashai/cbrowser/commit/322cfdfc1b60024be8ff3ed6933651d7d91642ff))
* **persona:** rebuild the dyslexic-user trait vector from the literature ([a789ba4](https://github.com/alexandriashai/cbrowser/commit/a789ba41ae2ed09f43252b89de2e704204780ab3))
* **persona:** repair the values fallback my own later change broke ([e382d98](https://github.com/alexandriashai/cbrowser/commit/e382d98a538482c46c3a20c7bf6e41c1dafba9d0))
* **persona:** route every values consumer through one resolver ([243dc5a](https://github.com/alexandriashai/cbrowser/commit/243dc5a0e754f17e76c5316952dc149cc337cd85))
* **persona:** score decisionStyle instead of branching to it ([2f1ed37](https://github.com/alexandriashai/cbrowser/commit/2f1ed37194d2344fd8bb8de6aae7e0a25d98c6ba))
* **personas:** creation persisted nothing, and three claims did not match the code ([b4af89e](https://github.com/alexandriashai/cbrowser/commit/b4af89e3c317998b81c4ed4fea0efd10e4bcbfcc))
* **persona:** screen-reader-user riskTolerance 0.5 -> 0.2, literature-backed ([15dbb1f](https://github.com/alexandriashai/cbrowser/commit/15dbb1f735f59bc26072c23e2b7524841c833ce7))
* **personas:** derive tech_level, and correct an inverted trait description ([f555705](https://github.com/alexandriashai/cbrowser/commit/f55570557c6ba704685101a4b3bf2b7c62b87ea0))
* **personas:** resolve account custom personas at analysis time ([8ef3a0e](https://github.com/alexandriashai/cbrowser/commit/8ef3a0e7426317ca4cfa904d1f96973b092f2928))
* **persona:** stop the value derivation saturating at both rails ([d282154](https://github.com/alexandriashai/cbrowser/commit/d282154320731dc9b175f03a8811f9dd770fa193))
* **persona:** trust direction was inverted; report the pattern cut and the source ([7ab4127](https://github.com/alexandriashai/cbrowser/commit/7ab4127c8412ebd2b2142c8fe3f665a903ae3fc8))
* reconcile every persona trait vector with its own documentation ([c912716](https://github.com/alexandriashai/cbrowser/commit/c91271691f0cae161735f322b4bf5ab3d672e646))
* reconcile the cognitive-adhd trait vector with its own research doc ([66d7254](https://github.com/alexandriashai/cbrowser/commit/66d7254eb8696dddcebc6cb66ada56d101e1ee53))
* **remote:** a swallowed manifest error served an empty tool list to connectors ([cbc0bd7](https://github.com/alexandriashai/cbrowser/commit/cbc0bd7530086e38fb77d03aa2802c6121769753))
* report the zero instead of omitting it (BUG-12, BUG-08) ([645a9c7](https://github.com/alexandriashai/cbrowser/commit/645a9c73b4c536535a5b13d936ac6e34f393840d))
* say what abandonmentRisk is conditional on ([97f6152](https://github.com/alexandriashai/cbrowser/commit/97f61521b7ab8ac8351bc9bfc0f2b5a1e013416f))
* **screenshot:** keep viewport shots inline, stop lying when one is omitted ([eb30760](https://github.com/alexandriashai/cbrowser/commit/eb30760db6fe7d7821d99fe4f8fbfff76de7f8ff))
* **screenshot:** stop compression from resizing the live viewport ([954654f](https://github.com/alexandriashai/cbrowser/commit/954654fa109f18bfd76416d04198d4c37a45f7cc))
* site familiarity was inverted on shallow pages ([e3439a7](https://github.com/alexandriashai/cbrowser/commit/e3439a7232d950ce0d446dd4289ce812d05c1896))
* **site-model:** persist elements discovered by page_understand ([14b6acb](https://github.com/alexandriashai/cbrowser/commit/14b6acb097ad128dc0ffd5b21a05959e528ba96f))
* siteFamiliarity was inert; unknown personas no longer fabricate ([0132e69](https://github.com/alexandriashai/cbrowser/commit/0132e69da22df0ab9464adcf31b47431678d4774))
* skip links out of the motor pass; rebuild three flat persona vectors ([e164c9c](https://github.com/alexandriashai/cbrowser/commit/e164c9c183301a11e4a0c055f7c611f34252bd4e))
* split readability into decoding and attention (BUG-01 / D-3 Option 1) ([8a9e4b4](https://github.com/alexandriashai/cbrowser/commit/8a9e4b4d86ed4dc46449388e5d63c2e0253d5f65))
* **status:** count files recursively and by the extensions actually written ([678f691](https://github.com/alexandriashai/cbrowser/commit/678f691e30e4723cc6a2e9f1c8186b7bcd467cee))
* suite flake was a subprocess read race; honest names for empathy verdict ([37d368e](https://github.com/alexandriashai/cbrowser/commit/37d368eaa0cabefe2f370f31c260a60e68c5e182))
* surplus is free for abilities, billed for dispositions ([c73ca34](https://github.com/alexandriashai/cbrowser/commit/c73ca3457a7905ab61d51504785fad6b333e63ea))
* the artifact directory is read per call, not captured at import ([abad8b6](https://github.com/alexandriashai/cbrowser/commit/abad8b6f8f007644079a7b5ddd144102bfe9cb9a))
* the trait model has 26, and six places said 25 ([7bd82c8](https://github.com/alexandriashai/cbrowser/commit/7bd82c8fc24ec3c44a1d8462d7d0e4a75fc98701))
* the viewport fix landed in the wrong tool; attention_analysis still rendered at 1920 ([da5611a](https://github.com/alexandriashai/cbrowser/commit/da5611aa1deed109a4b85cc48cb9526c478bbce8))
* **traits:** disambiguate two Schwartzes, define the 26th trait ([1c8deae](https://github.com/alexandriashai/cbrowser/commit/1c8deae8369a6913c4429730b3479c0b9c246679))
* **traits:** rename mentalModelRigidity, flag two more direction problems ([1e42ecd](https://github.com/alexandriashai/cbrowser/commit/1e42ecd2d3589d89c542777e61d5305d9e615a91))
* **values:** a factor at the midpoint contributes nothing, it does not cancel ([2b125c4](https://github.com/alexandriashai/cbrowser/commit/2b125c49f30b311ee4d69dc161636e6bf6ec9018))
* **values:** name the patterns the top-7 cut hides for policy reasons ([fcb3dc8](https://github.com/alexandriashai/cbrowser/commit/fcb3dc81ebffea0766bf3b3b17ee2df4b6ef60b1))
* **values:** netZeroAxes reports which zero-net shape it actually found ([26b39bf](https://github.com/alexandriashai/cbrowser/commit/26b39bfe33cdff708bd3369badf4d0725151220d))
* **values:** one implementation, a route enum, and a Maslow level that shows its working ([d693a4a](https://github.com/alexandriashai/cbrowser/commit/d693a4ab04d3fed540b8316a04ee29e22aec3149))
* **values:** one imputation convention, and a guard that ends the dropped-field class ([e07f733](https://github.com/alexandriashai/cbrowser/commit/e07f733490e1300d5dea56eedda5b9ae4a7e5b91))
* **values:** repair the roster regression and three disagreeing tie thresholds ([6d65710](https://github.com/alexandriashai/cbrowser/commit/6d65710640a503003126be613f14a0c0db3106e8))
* **values:** report cancellation on every derived route, not only the trait one ([a42ca7b](https://github.com/alexandriashai/cbrowser/commit/a42ca7bf82c3d7d87f23b0c385953661dfd0bbdf))
* **values:** report composition, not just margin, wherever a score is part-synthetic ([ad511e9](https://github.com/alexandriashai/cbrowser/commit/ad511e965242262c1f7950d82ee202d62fcf3b21))
* **values:** unbias the Maslow argmax, state both transforms, test the disclosures ([96899e4](https://github.com/alexandriashai/cbrowser/commit/96899e4f27069e4e3b7be4571128ac15b7caf982))
* **visual:** pass persona traits and values to the relevance judge ([67ca3f6](https://github.com/alexandriashai/cbrowser/commit/67ca3f6d5e68c69d03632e3073085d54e94f4eff))
* **widget-kit:** flatten nested objects instead of rendering [object Object] ([bd5cbb8](https://github.com/alexandriashai/cbrowser/commit/bd5cbb8d0c57091c6d2b862fe4ded6d7f0093a26))
* **widgets,bugs:** unreadable badge, silent truncation, tabs by page ([78bd648](https://github.com/alexandriashai/cbrowser/commit/78bd648ca2e6935ec53421a7921d283d52666731))
* **widgets:** link every widget to a page that exists ([5bb480f](https://github.com/alexandriashai/cbrowser/commit/5bb480f599c3e408592b691cc2e5fa0f23bef153))
* wire the transport layers to the capacity models ([a85c1f9](https://github.com/alexandriashai/cbrowser/commit/a85c1f9b5fba49e8821233f1adc26589e5e664f9))

### Changed

* finish the mentalModelRigidity -> mentalModelFlexibility rename ([842d88f](https://github.com/alexandriashai/cbrowser/commit/842d88fc23d6eb4208f2cc3372c9c85393f138ea))
* **mcp:** one empathy_audit, and fix what the duplicate was hiding ([73c8e2f](https://github.com/alexandriashai/cbrowser/commit/73c8e2f20ba2edacfd7bbcc1510eb7278bfa09f5))

## [18.79.0](https://github.com/alexandriashai/cbrowser/compare/v18.78.0...v18.79.0) (2026-07-30)

### Added

* **research:** saliency4asd adapter, and the negative result it produced ([538279d](https://github.com/alexandriashai/cbrowser/commit/538279ddad51c3efc458109c320429a5e335c60d))

## [18.78.0](https://github.com/alexandriashai/cbrowser/compare/v18.77.0...v18.78.0) (2026-07-29)

### Added

* **research:** score saliency against fixation corpora from shipped code ([2930a84](https://github.com/alexandriashai/cbrowser/commit/2930a84002a226ffa1a63c7694f4e6329c11a3a6))

## [18.77.0](https://github.com/alexandriashai/cbrowser/compare/v18.76.0...v18.77.0) (2026-07-29)

### Added

* **attention:** opt-in AI layer, reported beside the numbers not inside them ([58c13b1](https://github.com/alexandriashai/cbrowser/commit/58c13b1f3833cb598d19f1c51af51261e7eddeab))

## [18.76.0](https://github.com/alexandriashai/cbrowser/compare/v18.75.4...v18.76.0) (2026-07-29)

### Added

* **attention:** feed the DOM to the two tools that were shipping contrast ([bbc728e](https://github.com/alexandriashai/cbrowser/commit/bbc728ebd6b1698c95199647a5c4e9f9fc39de65))

## [18.75.4](https://github.com/alexandriashai/cbrowser/compare/v18.75.3...v18.75.4) (2026-07-29)

### Fixed

* **attention:** say which model produced the heatmap ([a428446](https://github.com/alexandriashai/cbrowser/commit/a428446a86decdad945bf5429c4671e03c0e0b19))

## [18.75.3](https://github.com/alexandriashai/cbrowser/compare/v18.75.2...v18.75.3) (2026-07-29)

### Fixed

* verdicts that shipped without the evidence behind them ([9238cb8](https://github.com/alexandriashai/cbrowser/commit/9238cb87ef7624f51dada98b9e5cd43eb01e1af7))

## [18.75.2](https://github.com/alexandriashai/cbrowser/compare/v18.75.1...v18.75.2) (2026-07-29)

### Fixed

* the questionnaire offered a category the build tool rejected ([80a68f1](https://github.com/alexandriashai/cbrowser/commit/80a68f1dea42060575b6be023210d6e43d9bcbcd))

## [18.75.1](https://github.com/alexandriashai/cbrowser/compare/v18.75.0...v18.75.1) (2026-07-29)

### Fixed

* six interaction tools had no error handling at all ([4f74054](https://github.com/alexandriashai/cbrowser/commit/4f74054dd63d6939c4057c7f966be80412396c75))

## [18.75.0](https://github.com/alexandriashai/cbrowser/compare/v18.74.3...v18.75.0) (2026-07-29)

### Added

* **site-model:** record goal paths where the server already knows them ([1629ec4](https://github.com/alexandriashai/cbrowser/commit/1629ec4b085898a006d399a70b22f7004cec1117))

## [18.74.3](https://github.com/alexandriashai/cbrowser/compare/v18.74.2...v18.74.3) (2026-07-29)

### Fixed

* summaries that contradicted the evidence printed beside them ([0baa67e](https://github.com/alexandriashai/cbrowser/commit/0baa67e719a8d18aad86aba104f4cb57f8f42fc7))

## [18.74.2](https://github.com/alexandriashai/cbrowser/compare/v18.74.1...v18.74.2) (2026-07-29)

### Fixed

* interpolated personas were divided by their own largest trait ([a382871](https://github.com/alexandriashai/cbrowser/commit/a382871a62f4e7fe5f9d2f7f56261c46cae4543a))

## [18.74.1](https://github.com/alexandriashai/cbrowser/compare/v18.74.0...v18.74.1) (2026-07-29)

### Fixed

* **ci:** release hook ran a third test suite that gated nothing ([9be87a4](https://github.com/alexandriashai/cbrowser/commit/9be87a4eb52fc14672cc8c19a760c1ddf945f36d))
* svg className crash charged customers for our TypeError ([bbd2743](https://github.com/alexandriashai/cbrowser/commit/bbd27434fe861faa39cb4be976b8d8eae9ca0df0))

## [18.74.0](https://github.com/alexandriashai/cbrowser/compare/v18.73.4...v18.74.0) (2026-07-29)

### Added

* **mcp-ui:** add ui resource seam and fix dead artifact urls ([beaaa8d](https://github.com/alexandriashai/cbrowser/commit/beaaa8d8562fc02d4b620fcd719b1f6ca02a4d57))
* **mcp-ui:** draw the barriers on the page ([f0627db](https://github.com/alexandriashai/cbrowser/commit/f0627db50120cdae6cdc42e58c9b2b5de5620f9e))

### Fixed

* barrier rects mixed scroll positions and flagged every rect as off-image ([e405a89](https://github.com/alexandriashai/cbrowser/commit/e405a8944e5ede74c3ab0af136eb787ad0c7a608))
* escape generated selectors, make cognitive_distance honest ([f32ab55](https://github.com/alexandriashai/cbrowser/commit/f32ab55203c832b51112f9e500ffdfb338146769)), closes [#id](https://github.com/alexandriashai/cbrowser/issues/id)
* generated test script used a dialect the parser cannot read ([d84799b](https://github.com/alexandriashai/cbrowser/commit/d84799bad7b365ce23625cc951c5bc76a56b991a))
* page fingerprints were counted but never written ([0b9fd87](https://github.com/alexandriashai/cbrowser/commit/0b9fd879414e00fe4aa0a94ff8bda43c580bfd30))
* page type ordered by branch position rather than signal strength, and a 34KB persona response ([57a5413](https://github.com/alexandriashai/cbrowser/commit/57a5413a3ad60f58e42aeae7ed700276c35eac0d))
* two severity paths, duplicated attention targets, and JSON-LD read as page text ([013ad8a](https://github.com/alexandriashai/cbrowser/commit/013ad8ac60f3399ba87cb308d541f9ad0afd83ba))

## [18.73.4](https://github.com/alexandriashai/cbrowser/compare/v18.73.3...v18.73.4) (2026-07-29)

### Fixed

* a failed click dumped its whole Playwright retry log ([d79dded](https://github.com/alexandriashai/cbrowser/commit/d79dded7ca69482022de58b80ea03085c92f6716))
* empathy_audit inlined a 600KB screenshot into every response ([2864ebf](https://github.com/alexandriashai/cbrowser/commit/2864ebfa69b9024cc0d9961160f8840df7ba43c2))
* every perf_regression reported a large transferSize regression on an unchanged page ([300a4ad](https://github.com/alexandriashai/cbrowser/commit/300a4add814af069da033a674e202f0645ad0ef1))
* generate_tests returned step counts instead of steps ([faa9139](https://github.com/alexandriashai/cbrowser/commit/faa9139a59b74789d414f90531fdd1fabb8fab83))
* journey state dropped goalProgress, misreported mood, and hid tied abandonments ([7fa5e19](https://github.com/alexandriashai/cbrowser/commit/7fa5e19542b26844e3da358c64a9b9f9d4873db7))
* json-ld breadcrumbs were invisible to the breadcrumb check ([5757b92](https://github.com/alexandriashai/cbrowser/commit/5757b923eb00470f87543baf8989101d0ff242fb))
* largest contentful paint was never collected and CLS was always zero ([fbd58b9](https://github.com/alexandriashai/cbrowser/commit/fbd58b93701a152ccdaa17458095d2a5946c4f3d))
* page_understand got four facts wrong about every page ([f6205a9](https://github.com/alexandriashai/cbrowser/commit/f6205a9e9ef9d0c36778dd7e3d2dedbbb0a8060e))
* passing a URL to evaluate produced a baffling syntax error ([1eb72ce](https://github.com/alexandriashai/cbrowser/commit/1eb72ceb26fe09a1ab8fe4b7c374109507184160))
* read and assert tools answered from a blank session when the token was omitted ([f24d307](https://github.com/alexandriashai/cbrowser/commit/f24d307a6999ad7c170fc50b36de1d212968f51b))
* remediation patch impact was a constant, so ROI sorting had no signal ([0adb8d5](https://github.com/alexandriashai/cbrowser/commit/0adb8d5133f2d7d7eb6a3f2027b671dee100eb0e))
* remediation patches showed a tag name where the current markup belongs ([6af780d](https://github.com/alexandriashai/cbrowser/commit/6af780d35dd1a6fd17ee0b8c4b20a7d834c6417d))
* suggested patches silently shortened the element's visible text ([4d3abce](https://github.com/alexandriashai/cbrowser/commit/4d3abcefd2e8c77137d8223d95fc426f36de170b))
* transportMap ignored on traditional baselines, and byte counts labelled ms ([7ea5892](https://github.com/alexandriashai/cbrowser/commit/7ea5892332c6db17a91f4461eb3c63e5a5a2ffd2))
* transportMap silently changed the score and flipped the verdict ([65abdff](https://github.com/alexandriashai/cbrowser/commit/65abdffafe02fca928bdb8db782a812c583780fb))
* wcagViolationCount counted violations the audit had already excluded ([d2b136e](https://github.com/alexandriashai/cbrowser/commit/d2b136e51dffb3d7072a8b17ec9ae8e9b9566e15))

## [18.73.3](https://github.com/alexandriashai/cbrowser/compare/v18.73.2...v18.73.3) (2026-07-29)

### Fixed

* attention_analysis printed scattered and concentrated as competing verdicts ([c312133](https://github.com/alexandriashai/cbrowser/commit/c31213354bbcd519930c370e1bca8fdf2598e04a))
* cognitive distance measured almost nothing ([0124d8f](https://github.com/alexandriashai/cbrowser/commit/0124d8f06647f870b3da59e2e82ccfdd247efae2))
* empathy score explanation described a different number than the headline ([bccd211](https://github.com/alexandriashai/cbrowser/commit/bccd211de02ad64b4666b719234f7f30eb8df403))
* expose the per-persona barrier weight behind each deduction ([25162ad](https://github.com/alexandriashai/cbrowser/commit/25162ad9e4ff1152eacae4469b130aeec164633e))
* persona traits dropped on save, and a crash on any partial persona file ([218e421](https://github.com/alexandriashai/cbrowser/commit/218e421aac2c7ace1b4121e950e064244cedff5a))
* three tools reported invented numbers instead of erroring ([fbce108](https://github.com/alexandriashai/cbrowser/commit/fbce108623b3f5af7871d0e9305a7415f87db344))
* three unlabelled cognitive-load numbers, and undeclared rect coordinates ([31f8be4](https://github.com/alexandriashai/cbrowser/commit/31f8be4c8b0d6e181cb187863924852d8022db4c))
* tools bound to a blank browser on the HTTP transport ([91f109d](https://github.com/alexandriashai/cbrowser/commit/91f109dbf8cf90a7246fa474a161c67e7766d5b1))
* webmcp audit graded every current server as out of date ([4578e98](https://github.com/alexandriashai/cbrowser/commit/4578e9862a2735c1ec6d68a04dac63a9710b8d2d))

## [18.73.2](https://github.com/alexandriashai/cbrowser/compare/v18.73.1...v18.73.2) (2026-07-28)

### Fixed

* assertions and negative flags were both silently no-ops ([fcc3a70](https://github.com/alexandriashai/cbrowser/commit/fcc3a70b84d50f63709ba02913e16797c4ca07c8))

## [18.73.1](https://github.com/alexandriashai/cbrowser/compare/v18.73.0...v18.73.1) (2026-07-28)

## [18.73.0](https://github.com/alexandriashai/cbrowser/compare/v18.72.6...v18.73.0) (2026-07-27)

### Added

* **security:** wire the security module to the tools that actually run ([4944e0e](https://github.com/alexandriashai/cbrowser/commit/4944e0e329b65835d6ed64893531748cfe41396e))

### Fixed

* **browser:** honest forceClose, durable selector cache, and a deploy-freshness probe ([01df7ac](https://github.com/alexandriashai/cbrowser/commit/01df7ac50de2a53b8e8aed888ec71e29110cc902))
* **cli:** --json-output emitted zero bytes and exit 0; doctor could not go red ([55a7bc0](https://github.com/alexandriashai/cbrowser/commit/55a7bc0e4c4fd37a03e7631c81ef8e24d15329b2))
* **mcp-remote:** don't start the session reaper at module import ([27b5331](https://github.com/alexandriashai/cbrowser/commit/27b5331678b01c37d9faa4fae07d0efb41d6ff85))
* **mcp-remote:** public tool manifest served Zod internals; close the Auth0 opaque path ([6a230fe](https://github.com/alexandriashai/cbrowser/commit/6a230fe8a9dbaeb3c3d282379c5c79537e46086f))
* **mcp:** stop four tools declaring arguments their handlers ignore ([ffde2f9](https://github.com/alexandriashai/cbrowser/commit/ffde2f96658f2f1a8d22d8bfc7c808e4ebc8da71))
* **security:** constrain session names to a filename allowlist ([78553ef](https://github.com/alexandriashai/cbrowser/commit/78553efb2e4e229dee13e20fdb96390c2c2fe38c))
* **security:** separate account-key identity from pricing tier ([4706308](https://github.com/alexandriashai/cbrowser/commit/470630828731f3bd01dfe907aea9bb07fc7843f9))
* **site-model:** stop wiping learned data on the first record of a process ([356f60d](https://github.com/alexandriashai/cbrowser/commit/356f60d54f8a22f25847ee9dcf6e099b5dda97e8))

## [18.72.6](https://github.com/alexandriashai/cbrowser/compare/v18.72.5...v18.72.6) (2026-07-25)

## [18.72.5](https://github.com/alexandriashai/cbrowser/compare/v18.72.4...v18.72.5) (2026-07-25)

### Fixed

* **billing:** request-scoped billing identity, usage-log auth, faster tier cache ([86dd2b0](https://github.com/alexandriashai/cbrowser/commit/86dd2b026d4f791af9fad1391026b71dc2eb4bf6))
* **cli:** give the in-page compiled-function factory a real signature ([5a422d4](https://github.com/alexandriashai/cbrowser/commit/5a422d4f602b857b17e2b0fb2318a106684e89a1))

## [18.72.4](https://github.com/alexandriashai/cbrowser/compare/v18.72.3...v18.72.4) (2026-07-20)

### Fixed

* **mcp-remote:** send X-Internal-Secret header on CMS credits/deduct ([106fdbe](https://github.com/alexandriashai/cbrowser/commit/106fdbe04eac43f343cd4097da402120843e6cec))

## [18.72.3](https://github.com/alexandriashai/cbrowser/compare/v18.72.2...v18.72.3) (2026-07-19)

### Fixed

* cookie set/delete honor --url host + auto-recover stale SingletonLock ([7591558](https://github.com/alexandriashai/cbrowser/commit/7591558dc472a5fef8a837e5503280c640f17218))

## [18.72.2](https://github.com/alexandriashai/cbrowser/compare/v18.72.1...v18.72.2) (2026-07-19)

### Fixed

* **capture:** redact query strings from manifest network entries; prove the journey capture path ([86ac6b1](https://github.com/alexandriashai/cbrowser/commit/86ac6b15182c2e3d6176b7873f558d364f84de0a))

## [18.72.1](https://github.com/alexandriashai/cbrowser/compare/v18.72.0...v18.72.1) (2026-07-19)

### Changed

* **capture:** nest score provenance inside ssim_thresholds ([1a15ee3](https://github.com/alexandriashai/cbrowser/commit/1a15ee303b37ad175f21fe86546ac6dab69b77f4))

## [18.72.0](https://github.com/alexandriashai/cbrowser/compare/v18.71.0...v18.72.0) (2026-07-19)

### Added

* **capture:** window-min change detector, measured thresholds, manifest v3 ([2cdc01f](https://github.com/alexandriashai/cbrowser/commit/2cdc01f4c28e33119b034462093939cd9ee42a2d))

## [18.71.0](https://github.com/alexandriashai/cbrowser/compare/v18.70.0...v18.71.0) (2026-07-19)

### Added

* **capture:** screen recording to GIF/WebP/WebM with an AI-readable frame manifest ([f8f2b6c](https://github.com/alexandriashai/cbrowser/commit/f8f2b6cc943a853a38618f07138e83f70559bf74))

## [18.70.0](https://github.com/alexandriashai/cbrowser/compare/v18.69.3...v18.70.0) (2026-07-19)

### Added

* **nl-test:** honor scroll amounts, add cookie + coordinate-tap steps ([1df30d7](https://github.com/alexandriashai/cbrowser/commit/1df30d729c4f30e60c0c2bdea6c99b9891402ca1))

## [18.69.3](https://github.com/alexandriashai/cbrowser/compare/v18.69.1...v18.69.3) (2026-07-18)

### Fixed

* **browser:** persist cookies (incl. session cookies) across CLI invocations ([1ad81ab](https://github.com/alexandriashai/cbrowser/commit/1ad81ab011b62c65063c78d38dde1741c61545a3))

## [18.69.1](https://github.com/alexandriashai/cbrowser/compare/v18.69.0...v18.69.1) (2026-07-14)

### Fixed

* **skill:** shipped SKILL.md — routable frontmatter, probe-pinned facts, cost/replay guidance ([6b4d999](https://github.com/alexandriashai/cbrowser/commit/6b4d9991b97f3569f8190e337d53ba5ae8492210))

## [18.69.0](https://github.com/alexandriashai/cbrowser/compare/v18.68.1...v18.69.0) (2026-07-14)

### Added

* golden scoring harness + journey traces with LLM-free replay ([424910f](https://github.com/alexandriashai/cbrowser/commit/424910f003c5a76f97f9437c3ab32d98059a4f3b))

### Fixed

* **deps:** reconcile manifest/lock — admit installed playwright, lock sharp + fast-check ([9fc6148](https://github.com/alexandriashai/cbrowser/commit/9fc6148335cc12f2e46c7b880547b69d73c2e5bd))

## [18.68.1](https://github.com/alexandriashai/cbrowser/compare/v18.68.0...v18.68.1) (2026-07-14)

### Fixed

* advertise api_key auth in /health when requireAuth is on ([ddc8155](https://github.com/alexandriashai/cbrowser/commit/ddc81550dc55b371b7d1f79d1a68be3174f4e2a2))
* **cli:** stop MCP stdio console redirect from hijacking CLI stdout ([b3d66c7](https://github.com/alexandriashai/cbrowser/commit/b3d66c7f0cbfdfdf03b04c313e9573e579a91dfb))

## [18.68.0](https://github.com/alexandriashai/cbrowser/compare/v18.67.0...v18.68.0) (2026-05-01)

### Added

* live cognitive journey — viewer infrastructure, human simulation, returning-visit memory ([f854ca1](https://github.com/alexandriashai/cbrowser/commit/f854ca12eda2cb9c991c281fec4e3b5b0b5dab3d)), closes [#N](https://github.com/alexandriashai/cbrowser/issues/N) [#2](https://github.com/alexandriashai/cbrowser/issues/2) [#5](https://github.com/alexandriashai/cbrowser/issues/5) [#10](https://github.com/alexandriashai/cbrowser/issues/10)

### Fixed

* 4 critical/high bugs in browser.ts + daemon.ts ([137fb09](https://github.com/alexandriashai/cbrowser/commit/137fb09fc79b64e4dd7b03e7bc05cca7e2917838))

## [18.67.0](https://github.com/alexandriashai/cbrowser/compare/v18.66.1...v18.67.0) (2026-04-23)

### Added

* dashboard redesign — sidebar navigation + hero CIF gauge ([79a326f](https://github.com/alexandriashai/cbrowser/commit/79a326f1849f85c4364a08d27656480019063b17))

## [18.66.1](https://github.com/alexandriashai/cbrowser/compare/v18.66.0...v18.66.1) (2026-04-22)

### Fixed

* cognitive journey abandonment thresholds + click reliability + URL cleaning ([a22624a](https://github.com/alexandriashai/cbrowser/commit/a22624a55bdde10b797bdeec1663b2947c40288a))

## [18.66.0](https://github.com/alexandriashai/cbrowser/compare/v18.65.0...v18.66.0) (2026-04-22)

### Added

* comprehensive web interaction patterns for cognitive journeys ([5477ded](https://github.com/alexandriashai/cbrowser/commit/5477ded0053e909e09ae25561377d1b96d7f7c66))

## [18.65.0](https://github.com/alexandriashai/cbrowser/compare/v18.64.1...v18.65.0) (2026-04-21)

### Added

* shared browser support for agent-ready + empathy audits ([9890a6a](https://github.com/alexandriashai/cbrowser/commit/9890a6a9a98cfc16626653ec7e9d655d51e522d5))

## [18.64.1](https://github.com/alexandriashai/cbrowser/compare/v18.64.0...v18.64.1) (2026-04-20)

### Fixed

* cif scoring calibration + persona disability modeling + animation detection ([254ee9a](https://github.com/alexandriashai/cbrowser/commit/254ee9affcae33448e0fe6242fe9cfac7fe82f71))

## [18.64.0](https://github.com/alexandriashai/cbrowser/compare/v18.63.2...v18.64.0) (2026-04-18)

### Added

* dom semantic attention layer for attention_analysis ([e56aa7a](https://github.com/alexandriashai/cbrowser/commit/e56aa7a3aa5d995d16c58d1e7c32c9a77fb87a49))

## [18.63.2](https://github.com/alexandriashai/cbrowser/compare/v18.63.1...v18.63.2) (2026-04-18)

## [18.63.1](https://github.com/alexandriashai/cbrowser/compare/v18.63.0...v18.63.1) (2026-04-18)

## [18.63.0](https://github.com/alexandriashai/cbrowser/compare/v18.62.0...v18.63.0) (2026-04-18)

### Added

* public tools/list, site knowledge gating, WCAG accuracy, Claude.ai skill distinction ([dfed641](https://github.com/alexandriashai/cbrowser/commit/dfed6412c0ba1133a7d782fc1c58aaf0c73115ce))

## [18.62.0](https://github.com/alexandriashai/cbrowser/compare/v18.61.0...v18.62.0) (2026-04-18)

### Added

* question_answer tool — ask about CBrowser via knowledge base ([c993845](https://github.com/alexandriashai/cbrowser/commit/c9938452d5f2e091a047185ea521d530ee1b83cf))

## [18.61.0](https://github.com/alexandriashai/cbrowser/compare/v18.60.0...v18.61.0) (2026-04-18)

### Added

* device emulation, WCAG-accurate scoring, auto-save all tool results ([19732cb](https://github.com/alexandriashai/cbrowser/commit/19732cb97030a628a5e0b5832f3bda626f7b0462))

## [18.60.0](https://github.com/alexandriashai/cbrowser/compare/v18.59.2...v18.60.0) (2026-04-17)

### Added

* tool-result-saver — auto-save structured results to site dashboard ([2107f4a](https://github.com/alexandriashai/cbrowser/commit/2107f4a2b3f29b14c41c2fe6e1f0d65046b0c08b))

## [18.59.2](https://github.com/alexandriashai/cbrowser/compare/v18.59.1...v18.59.2) (2026-04-17)

## [18.59.1](https://github.com/alexandriashai/cbrowser/compare/v18.59.0...v18.59.1) (2026-04-17)

### Fixed

* use full URL path in site names, not just hostname ([132aa40](https://github.com/alexandriashai/cbrowser/commit/132aa403024acfa4a2560cb66ad11c44c2a327c8))

## [18.59.0](https://github.com/alexandriashai/cbrowser/compare/v18.58.5...v18.59.0) (2026-04-17)

### Added

* visual reports auto-save — heatmaps and overlays saved to gallery ([9b748f8](https://github.com/alexandriashai/cbrowser/commit/9b748f81d09a6768d74c1f724b7bf3be625a6a86))

## [18.58.5](https://github.com/alexandriashai/cbrowser/compare/v18.58.4...v18.58.5) (2026-04-17)

### Fixed

* heatmaps save to deployed dir, screenshot URL upload for Claude.ai ([9ff49cf](https://github.com/alexandriashai/cbrowser/commit/9ff49cf2daa92063ab01d6785e2ebd8a094928a8))

## [18.58.4](https://github.com/alexandriashai/cbrowser/compare/v18.58.3...v18.58.4) (2026-04-16)

### Fixed

* remediation patches use audit's contextual codeExample, not random hashes ([c40f17d](https://github.com/alexandriashai/cbrowser/commit/c40f17df75746e0bf6d8f3864868f11dea1ef0b1))

## [18.58.3](https://github.com/alexandriashai/cbrowser/compare/v18.58.2...v18.58.3) (2026-04-16)

### Fixed

* remediation patches — contextual code examples, correct effort classification ([549fa9a](https://github.com/alexandriashai/cbrowser/commit/549fa9acba3a3b5835fc082aadb482855cbf68ab))

## [18.58.2](https://github.com/alexandriashai/cbrowser/compare/v18.58.1...v18.58.2) (2026-04-16)

### Fixed

* totalElements count and contextual codeExample in agent-ready-audit ([3102363](https://github.com/alexandriashai/cbrowser/commit/31023635268336fb54d20b7c4b3219eed78cc3b7))

## [18.58.1](https://github.com/alexandriashai/cbrowser/compare/v18.58.0...v18.58.1) (2026-04-16)

### Fixed

* viewport scope actually clips barrier detection and element counts ([296c7a3](https://github.com/alexandriashai/cbrowser/commit/296c7a3d20b109e375b5f1ef94535d955ef7206d))

## [18.58.0](https://github.com/alexandriashai/cbrowser/compare/v18.57.0...v18.58.0) (2026-04-16)

### Added

* viewport/full_page scope, CMS persona fallback, text readability metrics ([56d7233](https://github.com/alexandriashai/cbrowser/commit/56d7233cacad80eb9a5c41e5e91f4deadbad0aeb))

## [18.57.0](https://github.com/alexandriashai/cbrowser/compare/v18.56.0...v18.57.0) (2026-04-16)

### Added

* text readability metrics, CJK/abjad tokenization, script-family detection ([87b867b](https://github.com/alexandriashai/cbrowser/commit/87b867bcece3f755e5c5f71de9eb133d491e6a7a))

## [18.56.0](https://github.com/alexandriashai/cbrowser/compare/v18.55.0...v18.56.0) (2026-04-16)

### Added

* _browserToken on assessment tools, content-verified i18n, Accept-Language header ([2f60bae](https://github.com/alexandriashai/cbrowser/commit/2f60baefbf982e8085ff3e360d5e042d14d6c2f3))

### Fixed

* restore skill/ directory (CBrowser MCP skill definitions) ([9abe051](https://github.com/alexandriashai/cbrowser/commit/9abe051f56a076dd8e7ae5c1e38a4de45ad708be))

## [18.55.0](https://github.com/alexandriashai/cbrowser/compare/v18.54.0...v18.55.0) (2026-04-16)

### Added

* schwartz value integration, CLI accessibility, SSE keepalive, session cleanup ([c74665a](https://github.com/alexandriashai/cbrowser/commit/c74665a68101ecff164abca502b88cbc4450d57a))

## [18.54.0](https://github.com/alexandriashai/cbrowser/compare/v18.53.0...v18.54.0) (2026-04-15)

### Added

* journey_heatmap_gif — animated cognitive journey visualization ([d31c09e](https://github.com/alexandriashai/cbrowser/commit/d31c09ed10460744dc8854b2dea6141b46ae0079))

## [18.53.0](https://github.com/alexandriashai/cbrowser/compare/v18.52.4...v18.53.0) (2026-04-14)

### Added

* update MCP server icons to new logo ([5a1ac09](https://github.com/alexandriashai/cbrowser/commit/5a1ac093cfe777aad708a0f1c124b81d42ccece7))

## [18.52.4](https://github.com/alexandriashai/cbrowser/compare/v18.52.3...v18.52.4) (2026-04-14)

### Fixed

* restore /authorize login form for Claude.ai OAuth popup ([13242b3](https://github.com/alexandriashai/cbrowser/commit/13242b37113e4e6596cb964ac5727ecbc65019ea))

## [18.52.3](https://github.com/alexandriashai/cbrowser/compare/v18.52.2...v18.52.3) (2026-04-14)

### Fixed

* return 404 for oauth-authorization-server when no Auth0 ([18a8bc0](https://github.com/alexandriashai/cbrowser/commit/18a8bc052ee009e958b5908c6a28058c9bb82eb4))

## [18.52.2](https://github.com/alexandriashai/cbrowser/compare/v18.52.1...v18.52.2) (2026-04-14)

### Fixed

* /authorize redirects to registration page instead of serving HTML ([c2e2b6d](https://github.com/alexandriashai/cbrowser/commit/c2e2b6d426d71784908739d0d57d6a2fa791e695))

## [18.52.1](https://github.com/alexandriashai/cbrowser/compare/v18.52.0...v18.52.1) (2026-04-14)

### Fixed

* don't advertise OAuth authorization server to MCP clients ([e0a7d4b](https://github.com/alexandriashai/cbrowser/commit/e0a7d4b80254fa88a616b4ba8588318e9712b9dd))

## [18.52.0](https://github.com/alexandriashai/cbrowser/compare/v18.51.1...v18.52.0) (2026-04-14)

### Added

* client_credentials grant + token-based usage tracking ([c6e3933](https://github.com/alexandriashai/cbrowser/commit/c6e3933516cfc420fc996a3194ecc876a646ea01))

## [18.51.1](https://github.com/alexandriashai/cbrowser/compare/v18.51.0...v18.51.1) (2026-04-14)

### Fixed

* clean up debug logging from usage tracking ([d486d42](https://github.com/alexandriashai/cbrowser/commit/d486d42c2a0c2ac4a91e43e8ddaac82c9239cf38))

## [18.51.0](https://github.com/alexandriashai/cbrowser/compare/v18.50.0...v18.51.0) (2026-04-14)

### Added

* per-session usage logging to CMS via tier-gate proxy ([78c1c50](https://github.com/alexandriashai/cbrowser/commit/78c1c50d463143a605ec524019e7de95d915680e))

## [18.50.0](https://github.com/alexandriashai/cbrowser/compare/v18.49.0...v18.50.0) (2026-04-14)

### Added

* require auth on demo server, accept cbk_ key or OAuth, CNAME pro ([3c031d9](https://github.com/alexandriashai/cbrowser/commit/3c031d959b77c3a45e9f6abcb8c950dd1720e3d2))

## [18.49.0](https://github.com/alexandriashai/cbrowser/compare/v18.48.1...v18.49.0) (2026-04-14)

### Added

* add useValues opt-in flag to cognitive/attention tools (default off) ([be87872](https://github.com/alexandriashai/cbrowser/commit/be87872635e5ab6e0398a55aff93e99c2aff824b))

## [18.48.1](https://github.com/alexandriashai/cbrowser/compare/v18.48.0...v18.48.1) (2026-04-14)

## [18.48.0](https://github.com/alexandriashai/cbrowser/compare/v18.47.0...v18.48.0) (2026-04-14)

### Added

* value-driven semantic attention maps ([2d1543e](https://github.com/alexandriashai/cbrowser/commit/2d1543e6279ef8b52079046415343e1216eff4a4))

## [18.47.0](https://github.com/alexandriashai/cbrowser/compare/v18.46.1...v18.47.0) (2026-04-14)

### Added

* integrate motivational values into cognitive simulation engine ([30f2478](https://github.com/alexandriashai/cbrowser/commit/30f2478def8250177cd820d60b91b6326c92f30f))

## [18.46.1](https://github.com/alexandriashai/cbrowser/compare/v18.46.0...v18.46.1) (2026-04-14)

### Fixed

* oauth login uses native form submit instead of fetch ([437799d](https://github.com/alexandriashai/cbrowser/commit/437799dc74eb38e15151a2221c566f986c6d8d9e))

## [18.46.0](https://github.com/alexandriashai/cbrowser/compare/v18.45.0...v18.46.0) (2026-04-14)

### Added

* built-in OAuth 2.1 PKCE for claude.ai MCP connector auth ([cd460b7](https://github.com/alexandriashai/cbrowser/commit/cd460b70244d8e29593a933c5d9cdeea9833125d))

## [18.45.0](https://github.com/alexandriashai/cbrowser/compare/v18.44.1...v18.45.0) (2026-04-14)

### Added

* dynamic tier resolution from cbk_ API keys via CMS lookup ([cee48ed](https://github.com/alexandriashai/cbrowser/commit/cee48ed1d992d808111b9cf17130987993ba31f9))

## [18.44.1](https://github.com/alexandriashai/cbrowser/compare/v18.44.0...v18.44.1) (2026-04-14)

### Fixed

* dpr-scale CSS coordinates for mobile attention quality mapping ([fb35389](https://github.com/alexandriashai/cbrowser/commit/fb35389758a5d7e3955224d587fb548bd474fea8))

## [18.44.0](https://github.com/alexandriashai/cbrowser/compare/v18.43.0...v18.44.0) (2026-04-14)

### Added

* add pricing tier gating for hosted MCP server ([4af83da](https://github.com/alexandriashai/cbrowser/commit/4af83da9815b8855af70c9d9bebe432984e46ced))

## [18.43.0](https://github.com/alexandriashai/cbrowser/compare/v18.42.7...v18.43.0) (2026-04-14)

### Added

* viewport-filter all cognitive metrics — only measure visible elements ([9443fff](https://github.com/alexandriashai/cbrowser/commit/9443fff6fc7792a91e4222e44f4d715bb21db881))

## [18.42.7](https://github.com/alexandriashai/cbrowser/compare/v18.42.6...v18.42.7) (2026-04-14)

## [18.42.6](https://github.com/alexandriashai/cbrowser/compare/v18.42.5...v18.42.6) (2026-04-14)

## [18.42.5](https://github.com/alexandriashai/cbrowser/compare/v18.42.4...v18.42.5) (2026-04-13)

### Fixed

* perceptual transport concentration now 60% of signal ([e8fc2ad](https://github.com/alexandriashai/cbrowser/commit/e8fc2ad9466c5265c03d125c9097d345964f7df2))

## [18.42.4](https://github.com/alexandriashai/cbrowser/compare/v18.42.3...v18.42.4) (2026-04-13)

### Fixed

* perceptual transport wired to attention analysis data ([c1e8afa](https://github.com/alexandriashai/cbrowser/commit/c1e8afab63a4e5def12ce51a990da0478e2478c9))

## [18.42.3](https://github.com/alexandriashai/cbrowser/compare/v18.42.2...v18.42.3) (2026-04-13)

### Fixed

* perceptual transport now page-dependent + abandonment curve recalibrated ([8b07ac1](https://github.com/alexandriashai/cbrowser/commit/8b07ac11c60dd29cbed90ffa8ad0351e4f29ed60))

## [18.42.2](https://github.com/alexandriashai/cbrowser/compare/v18.42.1...v18.42.2) (2026-04-13)

### Fixed

* page metric ceiling + demand sigmoid saturation ([55827a9](https://github.com/alexandriashai/cbrowser/commit/55827a937c3adf896b2b23b504ae225b018ff12b))

## [18.42.1](https://github.com/alexandriashai/cbrowser/compare/v18.42.0...v18.42.1) (2026-04-13)

### Fixed

* 6 COT calibration bugs — blocked pages, abandonment, load scaling ([74ba2d5](https://github.com/alexandriashai/cbrowser/commit/74ba2d551b211632d40297f6e5472e47699d4838))

## [18.42.0](https://github.com/alexandriashai/cbrowser/compare/v18.41.0...v18.42.0) (2026-04-13)

### Added

* add cognitive_effort MCP tool (full COT analysis) ([d10b6f1](https://github.com/alexandriashai/cbrowser/commit/d10b6f148724a07f9e9af1f30ddc0d6dda9cb15b))

## [18.41.0](https://github.com/alexandriashai/cbrowser/compare/v18.40.0...v18.41.0) (2026-04-13)

### Added

* sequential transport chain + formal cognitive models ([09f943f](https://github.com/alexandriashai/cbrowser/commit/09f943f7e49bc16d2f662049c60cfed2888e46c6))

## [18.40.0](https://github.com/alexandriashai/cbrowser/compare/v18.39.0...v18.40.0) (2026-04-12)

### Added

* add tool annotations to all 86 base tools ([ca5ed1f](https://github.com/alexandriashai/cbrowser/commit/ca5ed1f6504083a96ac074663c2de392070182d3))

## [18.39.0](https://github.com/alexandriashai/cbrowser/compare/v18.38.2...v18.39.0) (2026-04-12)

### Added

* add server metadata, prompts, and resources to MCP ([f401a64](https://github.com/alexandriashai/cbrowser/commit/f401a64a62c520f986852860b14d9babcbb1576d))

## [18.38.2](https://github.com/alexandriashai/cbrowser/compare/v18.38.1...v18.38.2) (2026-04-11)

### Fixed

* security_audit self-scan via in-memory tool registry ([cf5369f](https://github.com/alexandriashai/cbrowser/commit/cf5369fda8b89141ec9bd0d72e41eb9db48aa70f))

## [18.38.1](https://github.com/alexandriashai/cbrowser/compare/v18.38.0...v18.38.1) (2026-04-11)

### Fixed

* security_audit self-scan works in all environments ([2c4cb9a](https://github.com/alexandriashai/cbrowser/commit/2c4cb9ac24f814cdb5c37314c4e145a56520c49c))

## [18.38.0](https://github.com/alexandriashai/cbrowser/compare/v18.37.1...v18.38.0) (2026-04-11)

### Added

* security_audit accepts mcp_url for remote scanning ([c265bab](https://github.com/alexandriashai/cbrowser/commit/c265babe337b54d5069b931cc911eefd17ff0902))

## [18.37.1](https://github.com/alexandriashai/cbrowser/compare/v18.37.0...v18.37.1) (2026-04-11)

## [18.37.0](https://github.com/alexandriashai/cbrowser/compare/v18.36.0...v18.37.0) (2026-04-11)

### Added

* siteFamiliarity in questionnaire + familiarity downgrade ([2bddbcb](https://github.com/alexandriashai/cbrowser/commit/2bddbcb6320855ae778b49247c0d34488cfd3a57))

## [18.36.0](https://github.com/alexandriashai/cbrowser/compare/v18.35.0...v18.36.0) (2026-04-11)

### Added

* siteFamiliarity trait + 4 research-backed disability personas ([644a982](https://github.com/alexandriashai/cbrowser/commit/644a982a22f61095ac5ccde1e3979b8458038268)), closes [#26](https://github.com/alexandriashai/cbrowser/issues/26)

## [18.35.0](https://github.com/alexandriashai/cbrowser/compare/v18.34.2...v18.35.0) (2026-04-11)

### Added

* site knowledge system (4 upgrades, 6 new tools) ([8959533](https://github.com/alexandriashai/cbrowser/commit/8959533443ef620ecbc646ae9eaeedf6f45fc999)), closes [#160](https://github.com/alexandriashai/cbrowser/issues/160) [#161](https://github.com/alexandriashai/cbrowser/issues/161) [#162](https://github.com/alexandriashai/cbrowser/issues/162) [#163](https://github.com/alexandriashai/cbrowser/issues/163)

## [18.34.2](https://github.com/alexandriashai/cbrowser/compare/v18.34.1...v18.34.2) (2026-04-11)

## [18.34.1](https://github.com/alexandriashai/cbrowser/compare/v18.34.0...v18.34.1) (2026-04-11)

### Fixed

* **visual:** remove single-capture mode, always use smart barycenter ([37ca020](https://github.com/alexandriashai/cbrowser/commit/37ca020056d9e6c004b6c52ae6b5388420623427))

## [18.34.0](https://github.com/alexandriashai/cbrowser/compare/v18.33.1...v18.34.0) (2026-04-11)

### Added

* **visual:** merge smart_baseline/smart_regression into visual_baseline/visual_regression ([cf2c31c](https://github.com/alexandriashai/cbrowser/commit/cf2c31c033da96e62ca6706312f76233658e6b19))

## [18.33.1](https://github.com/alexandriashai/cbrowser/compare/v18.33.0...v18.33.1) (2026-04-11)

### Fixed

* **session:** emphasize _browserToken requirement in tool descriptions ([8533135](https://github.com/alexandriashai/cbrowser/commit/85331358cdcff1760c644da4ee2f1eb8e6a955ba))

## [18.33.0](https://github.com/alexandriashai/cbrowser/compare/v18.32.4...v18.33.0) (2026-04-11)

### Added

* **session:** tool-level browser tokens for session continuity ([#159](https://github.com/alexandriashai/cbrowser/issues/159)) ([ee9937e](https://github.com/alexandriashai/cbrowser/commit/ee9937ee25a03c386568512693457a15a26732f8))

## [18.32.4](https://github.com/alexandriashai/cbrowser/compare/v18.32.3...v18.32.4) (2026-04-11)

### Fixed

* **session:** revert stateful session ID in stateless mode ([4c941cb](https://github.com/alexandriashai/cbrowser/commit/4c941cb09996ae886efc831142e2d6106648aeb6))

## [18.32.3](https://github.com/alexandriashai/cbrowser/compare/v18.32.2...v18.32.3) (2026-04-11)

### Fixed

* **session:** enable stateful MCP sessions for browser continuity ([76323f2](https://github.com/alexandriashai/cbrowser/commit/76323f263236311f0117f5a5c8eede2b3871d14d))

## [18.32.2](https://github.com/alexandriashai/cbrowser/compare/v18.32.1...v18.32.2) (2026-04-11)

### Fixed

* **browser:** retry with persistent state preservation on crash recovery ([5f12cd6](https://github.com/alexandriashai/cbrowser/commit/5f12cd658ae1407a42d63658d3b8abd9836aed4a))

## [18.32.1](https://github.com/alexandriashai/cbrowser/compare/v18.32.0...v18.32.1) (2026-04-11)

### Fixed

* **browser:** auto-recover from corrupted browser state on JS-heavy sites ([b908e23](https://github.com/alexandriashai/cbrowser/commit/b908e2300537d0eae9dda6bfd0c4de1df2aeb27b))

## [18.32.0](https://github.com/alexandriashai/cbrowser/compare/v18.31.0...v18.32.0) (2026-04-11)

### Added

* **journey:** goal evidence validation and step-by-step journey log ([6919e1f](https://github.com/alexandriashai/cbrowser/commit/6919e1f220055fa6a928d2e2e55c0e43a96ce4f7))

## [18.31.0](https://github.com/alexandriashai/cbrowser/compare/v18.30.0...v18.31.0) (2026-04-11)

### Added

* **attention:** saliency-based attention transport via W₂ on CIE-Lab ([#159](https://github.com/alexandriashai/cbrowser/issues/159)) ([ef7f0b6](https://github.com/alexandriashai/cbrowser/commit/ef7f0b69001872e2a419b3165b21eb1fa4813bb9))

## [18.30.0](https://github.com/alexandriashai/cbrowser/compare/v18.29.0...v18.30.0) (2026-04-11)

### Added

* **cognitive:** page-level cognitive load estimation in empathy audit ([#159](https://github.com/alexandriashai/cbrowser/issues/159)) ([64ebd13](https://github.com/alexandriashai/cbrowser/commit/64ebd13d3139b77b249942fc7b7884180468989b))

## [18.29.0](https://github.com/alexandriashai/cbrowser/compare/v18.28.0...v18.29.0) (2026-04-11)

### Added

* **cognitive:** wire cognitive transport into MCP tools ([#159](https://github.com/alexandriashai/cbrowser/issues/159)) ([e0a79e4](https://github.com/alexandriashai/cbrowser/commit/e0a79e4bc5e9f2a030199f1021ec7505c145ce1e))

## [18.28.0](https://github.com/alexandriashai/cbrowser/compare/v18.27.0...v18.28.0) (2026-04-11)

### Added

* **cognitive:** optimal transport framework for persona trait modeling ([#159](https://github.com/alexandriashai/cbrowser/issues/159)) ([d23ad2a](https://github.com/alexandriashai/cbrowser/commit/d23ad2af9783475866b4862190d19c9848360313))

## [18.27.0](https://github.com/alexandriashai/cbrowser/compare/v18.26.0...v18.27.0) (2026-04-10)

### Added

* **empathy:** screenshot-based perceptual transport analysis ([96f4421](https://github.com/alexandriashai/cbrowser/commit/96f44217ce181411c7266e7d3b7145e8345b6876))

## [18.26.0](https://github.com/alexandriashai/cbrowser/compare/v18.25.4...v18.26.0) (2026-04-10)

### Added

* **empathy:** persona-weighted scoring via perceptual transport profiles ([b014e20](https://github.com/alexandriashai/cbrowser/commit/b014e20d98c587130520e05ff1171f33521c6884))

## [18.25.4](https://github.com/alexandriashai/cbrowser/compare/v18.25.3...v18.25.4) (2026-04-10)

### Fixed

* **empathy:** reduce empathy audit to <2s by cutting cognitive journey steps ([9590d22](https://github.com/alexandriashai/cbrowser/commit/9590d22e2cae349587bc5008821f22652d496178))

## [18.25.3](https://github.com/alexandriashai/cbrowser/compare/v18.25.2...v18.25.3) (2026-04-10)

### Fixed

* **benchmark:** reduce competitive benchmark execution time to <30s ([c37b4cf](https://github.com/alexandriashai/cbrowser/commit/c37b4cf8afa16f532b22e20c5bb525cc2c8b02f0))

## [18.25.2](https://github.com/alexandriashai/cbrowser/compare/v18.25.1...v18.25.2) (2026-04-10)

### Fixed

* **analysis:** reduce empathy audit and competitive benchmark timeouts ([90b22d4](https://github.com/alexandriashai/cbrowser/commit/90b22d4c014d2c5226f20d2347d696b4ce35ef15))

## [18.25.1](https://github.com/alexandriashai/cbrowser/compare/v18.25.0...v18.25.1) (2026-04-10)

### Fixed

* **visual:** transport map flows and device emulation ([#158](https://github.com/alexandriashai/cbrowser/issues/158)) ([11623c1](https://github.com/alexandriashai/cbrowser/commit/11623c17a9162163ec222539d195e9e3f19ee603))

## [18.25.0](https://github.com/alexandriashai/cbrowser/compare/v18.24.0...v18.25.0) (2026-04-10)

### Added

* **visual:** wasserstein optimal transport for visual comparison ([#158](https://github.com/alexandriashai/cbrowser/issues/158)) ([3105e81](https://github.com/alexandriashai/cbrowser/commit/3105e81bc92b7496c19de11699705f13c8321352))

## [18.24.0](https://github.com/alexandriashai/cbrowser/compare/v18.23.0...v18.24.0) (2026-04-02)

### Added

* **cli:** add --no-restore flag to preserve page state after interactions ([#106](https://github.com/alexandriashai/cbrowser/issues/106)) ([9ea720f](https://github.com/alexandriashai/cbrowser/commit/9ea720f7216cf1f99375c9bf04d07446e38370b1))

## [18.23.0](https://github.com/alexandriashai/cbrowser/compare/v18.21.0...v18.23.0) (2026-03-17)

### Added

* improve audit transparency and add persona cleanup (v18.22.0) ([cde443c](https://github.com/alexandriashai/cbrowser/commit/cde443cf8c5801d4bbf3c1b90adc0a0c5bd109c1))
* **lightpanda:** add --lightpanda flag to agent-ready-audit ([ecefe21](https://github.com/alexandriashai/cbrowser/commit/ecefe21956e7a7b0796e69016c7b3a06c121b04d))
* **lightpanda:** add security guardrails for safe usage ([0efa46e](https://github.com/alexandriashai/cbrowser/commit/0efa46ef051fefff62b005f7a608b017d88e1cf6))

## [18.21.0](https://github.com/alexandriashai/cbrowser/compare/v18.18.4...v18.21.0) (2026-03-16)

### Added

* add launchBrowserWithFallback utility for MCPB context ([263e6c2](https://github.com/alexandriashai/cbrowser/commit/263e6c26d373a320baf894d1931e4b97d52e432e))
* auto-install Playwright browsers on first run ([b756310](https://github.com/alexandriashai/cbrowser/commit/b75631036500654abe24340c6b13043103c920e2))
* **lightpanda:** add high-performance headless browser integration ([0cd0253](https://github.com/alexandriashai/cbrowser/commit/0cd0253631d1516a1ac3e4c55d675b14d4c203e1))
* **lightpanda:** add security guardrails for safe usage
  - Make Lightpanda OPT-IN ONLY (requires explicit --lightpanda flag)
  - Block sensitive operations (auth, login, payment, credentials)
  - Add security warnings for cloud mode (data exposure to lightpanda.io)
  - Show LIGHTPANDA_SECURITY_WARNING in status and setup commands
  - Add isSensitiveOperation() function to detect unsafe operations
* reorganize CLI with AI Friendliness section and add ai-benchmark ([0e12099](https://github.com/alexandriashai/cbrowser/commit/0e120990cb88d14f1c36948ea9fcbc4f0b5f2383))

## [18.20.0](https://github.com/alexandriashai/cbrowser/compare/v18.18.4...v18.20.0) (2026-03-16)

### Added

* **lightpanda:** Lightpanda integration for high-performance headless browsing
  - 11x faster and 9x less memory than Chrome headless
  - CDP-based connection via Playwright
  - Auto-detection when LIGHTPANDA_ENDPOINT or LIGHTPANDA_TOKEN is set
  - New CLI commands: `lightpanda-status`, `lightpanda-setup`
  - New exports: `connectToLightpanda`, `launchWithLightpandaFallback`, `getLightpandaStatus`
  - Ideal for agent-ready audits, empathy audits, and batch operations

## [18.18.4](https://github.com/alexandriashai/cbrowser/compare/v18.18.3...v18.18.4) (2026-03-08)

## [18.18.3](https://github.com/alexandriashai/cbrowser/compare/v18.18.2...v18.18.3) (2026-03-08)

### Fixed

* use --omit=dev instead of deprecated --only=production ([d719224](https://github.com/alexandriashai/cbrowser/commit/d7192248df1cda664fedbd930d735847d2866465))

## [18.18.2](https://github.com/alexandriashai/cbrowser/compare/v18.18.1...v18.18.2) (2026-03-08)

### Changed

* update MCPB manifest to spec v0.3 ([1518556](https://github.com/alexandriashai/cbrowser/commit/1518556a2a92e66465855ee4999eb81b4f836b29))

## [18.18.1](https://github.com/alexandriashai/cbrowser/compare/v18.18.0...v18.18.1) (2026-03-08)

### Fixed

* return valid OAuth metadata for open-access servers ([a65bb06](https://github.com/alexandriashai/cbrowser/commit/a65bb064733a35164b4b7e8e48127a451ebe1150))

## [18.18.0](https://github.com/alexandriashai/cbrowser/compare/v18.17.0...v18.18.0) (2026-03-08)

### Added

* add /llms.txt and /docs endpoints to MCP server ([1afa479](https://github.com/alexandriashai/cbrowser/commit/1afa479720ad36174a1792edab837a5ba1bff643))

## [18.17.0](https://github.com/alexandriashai/cbrowser/compare/v18.16.1...v18.17.0) (2026-03-08)

### Added

* add webmcp-ready CLI command with SSE support ([6bf1e9c](https://github.com/alexandriashai/cbrowser/commit/6bf1e9c74c94dcb39edae8e020f99c23733af368))

## [18.16.1](https://github.com/alexandriashai/cbrowser/compare/v18.16.0...v18.16.1) (2026-03-08)

### Fixed

* update tool counts from 83 to 91 in docs ([21a46c7](https://github.com/alexandriashai/cbrowser/commit/21a46c7f5653dfd8dcc553764a9b74eec84431a4))

## [18.16.0](https://github.com/alexandriashai/cbrowser/compare/v18.15.0...v18.16.0) (2026-03-08)

### Added

* add WebMCP readiness audit and .mcpb desktop extension ([25de4ef](https://github.com/alexandriashai/cbrowser/commit/25de4ef69f26f6feb84cc06bd1c4b10f7db20874))

## [18.15.0](https://github.com/alexandriashai/cbrowser/compare/v18.14.1...v18.15.0) (2026-03-07)

### Added

* comprehensive audit & remediation (phases 1-7) ([95b9537](https://github.com/alexandriashai/cbrowser/commit/95b95370e147b31c8de2f8b59fa31529565e4bb1))

## [18.14.1](https://github.com/alexandriashai/cbrowser/compare/v18.14.0...v18.14.1) (2026-03-07)

### Fixed

* resolve AI-Friendliness tool bugs ([94a48b0](https://github.com/alexandriashai/cbrowser/commit/94a48b0db986cb709ee5c82931b54f2959276e67))

## [18.14.0](https://github.com/alexandriashai/cbrowser/compare/v18.13.5...v18.14.0) (2026-03-07)

### Added

* ai-friendliness expansion (phases 1-5) ([a4ba436](https://github.com/alexandriashai/cbrowser/commit/a4ba436db105228b8d9fe002024a2129eb80a419))

## [18.13.5](https://github.com/alexandriashai/cbrowser/compare/v18.13.4...v18.13.5) (2026-02-28)

### Fixed

* **mcp:** use client session ID for browser context correlation ([b30792b](https://github.com/alexandriashai/cbrowser/commit/b30792bc69d4ed8d462d138591ee9f7143e5fa80))

## [18.13.4](https://github.com/alexandriashai/cbrowser/compare/v18.13.3...v18.13.4) (2026-02-27)

### Fixed

* **cognitive:** apply geolocation at browser creation time ([607cf4e](https://github.com/alexandriashai/cbrowser/commit/607cf4e00985b6762934565b0420973d69d10bb8))

## [18.13.3](https://github.com/alexandriashai/cbrowser/compare/v18.13.2...v18.13.3) (2026-02-16)

## [18.13.2](https://github.com/alexandriashai/cbrowser/compare/v18.13.1...v18.13.2) (2026-02-16)

## [18.13.1](https://github.com/alexandriashai/cbrowser/compare/v18.13.0...v18.13.1) (2026-02-16)

### Fixed

* **security:** remediate mcp-guardian detected issues ([df6178d](https://github.com/alexandriashai/cbrowser/commit/df6178dc3ca4346eada6ef13ed13222f299021a9))

## [18.13.0](https://github.com/alexandriashai/cbrowser/compare/v18.12.0...v18.13.0) (2026-02-16)

### Added

* auto-compress screenshots in remote mode for Claude.ai 200KB limit ([822de50](https://github.com/alexandriashai/cbrowser/commit/822de507aeb24ea85979fe9d12595b5399f053ce))

## [18.12.0](https://github.com/alexandriashai/cbrowser/compare/v18.11.1...v18.12.0) (2026-02-16)

### Added

* security_audit scans CBrowser's own tools ([d13d988](https://github.com/alexandriashai/cbrowser/commit/d13d988a77c107f28e00c2f6695bc6d2d6334b3a))

## [18.11.1](https://github.com/alexandriashai/cbrowser/compare/v18.11.0...v18.11.1) (2026-02-16)

## [18.11.0](https://github.com/alexandriashai/cbrowser/compare/v18.10.0...v18.11.0) (2026-02-16)

### Added

* add security_audit and persona_values_list MCP tools ([c075609](https://github.com/alexandriashai/cbrowser/commit/c0756090cd76c52db6de70aeb4190a44f630d3da))

## [18.10.0](https://github.com/alexandriashai/cbrowser/compare/v18.9.3...v18.10.0) (2026-02-16)

### Added

* use mcp-guardian package for security scanning ([7ef77d3](https://github.com/alexandriashai/cbrowser/commit/7ef77d33725f388263c1342f43d12a40e708c808))

## [18.9.3](https://github.com/alexandriashai/cbrowser/compare/v18.9.2...v18.9.3) (2026-02-16)

## [18.9.2](https://github.com/alexandriashai/cbrowser/compare/v18.9.1...v18.9.2) (2026-02-16)

### Fixed

* correct base tool count comment 56→57 ([d766b86](https://github.com/alexandriashai/cbrowser/commit/d766b8628b4d694e9f93bf2b47e060bd01254e3f))

## [18.9.1](https://github.com/alexandriashai/cbrowser/compare/v18.9.0...v18.9.1) (2026-02-16)

## [18.9.0](https://github.com/alexandriashai/cbrowser/compare/v18.8.1...v18.9.0) (2026-02-16)

### Added

* **cognitive:** add location parameters for cognitive journeys ([2e1a0b5](https://github.com/alexandriashai/cbrowser/commit/2e1a0b51c1c25259f805e55767e35a8e86dcf8d0))

## [18.8.1](https://github.com/alexandriashai/cbrowser/compare/v18.8.0...v18.8.1) (2026-02-16)

### Fixed

* export registerSecurityTools from mcp-tools index ([d30071a](https://github.com/alexandriashai/cbrowser/commit/d30071a602d04d2954bbde4c7868b93bbe9033c2))

## [18.8.0](https://github.com/alexandriashai/cbrowser/compare/v18.7.0...v18.8.0) (2026-02-16)

### Added

* **marketing:** show marketing tools as stubs on local MCP ([6986fc1](https://github.com/alexandriashai/cbrowser/commit/6986fc1e49ffa4636bff6d8762e22d1034c9b626))

## [18.7.0](https://github.com/alexandriashai/cbrowser/compare/v18.6.1...v18.7.0) (2026-02-16)

### Added

* **mcp:** make marketing tools demo/enterprise only, add campaign_run ([d5ca86e](https://github.com/alexandriashai/cbrowser/commit/d5ca86eb9d380c18e22d1ca6f06b6b4011c9a3e5))

## [18.6.1](https://github.com/alexandriashai/cbrowser/compare/v18.6.0...v18.6.1) (2026-02-16)

### Fixed

* update base tools count comment to 56 ([630b190](https://github.com/alexandriashai/cbrowser/commit/630b190d1ef1e825a008d421c79e2f9101588c0a))

## [18.6.0](https://github.com/alexandriashai/cbrowser/compare/v18.5.0...v18.6.0) (2026-02-16)

### Added

* **mcp:** add 3 real marketing tools for MCP-orchestrated campaigns ([aa27e8a](https://github.com/alexandriashai/cbrowser/commit/aa27e8a43011d46848d33ffdafde52b9e4767031))

## [18.5.0](https://github.com/alexandriashai/cbrowser/compare/v18.3.12...v18.5.0) (2026-02-16)

### Added

* add connection close detection and error logging for MCP ([3303126](https://github.com/alexandriashai/cbrowser/commit/3303126e3343189c7816e4ceac834d3c48e1ea34))
* add session isolation for MCP remote server ([0f89e2f](https://github.com/alexandriashai/cbrowser/commit/0f89e2f802fa26ba5bf4faed34601d24edfba0ca))
* add SSE keep-alive pings to prevent Cloudflare proxy timeout ([3aa1bdd](https://github.com/alexandriashai/cbrowser/commit/3aa1bddbacc9d7f393fab8db8692e176845198d5))
* improve rate limit error message for claude.ai ([e52c26c](https://github.com/alexandriashai/cbrowser/commit/e52c26c0c31b862c07dec9de8e954ad781ad0761))
* per-session memory limits + transparent session recovery ([0866f83](https://github.com/alexandriashai/cbrowser/commit/0866f83cde67c8068999edb1ff67643ce5141015))

### Fixed

* 1s keep-alive pings - maximum aggression ([59c2025](https://github.com/alexandriashai/cbrowser/commit/59c202507e10bc6cf1e4b0df12178e409e985256))
* 5s keep-alive pings ([3c393c7](https://github.com/alexandriashai/cbrowser/commit/3c393c74efa93f246ea19d97c73145abccb0be3c))
* reduce keep-alive to 10s, re-enable Cloudflare proxy for security ([af5e754](https://github.com/alexandriashai/cbrowser/commit/af5e7541a27a93b9e2bfc44e6bdf28b7458d3aab))
* reduce SSE keep-alive interval to 15s for aggressive timeout prevention ([fa651e8](https://github.com/alexandriashai/cbrowser/commit/fa651e872083e307b498b420572b9eb77c412cae))
* remove keep-alive pings - they were corrupting SSE protocol ([aab7d70](https://github.com/alexandriashai/cbrowser/commit/aab7d704c9b2a22e028ea57413502ec39ae84a08))

## [18.4.0](https://github.com/alexandriashai/cbrowser/compare/v18.3.12...v18.4.0) (2026-02-16)

### Added

* **mcp-remote:** session isolation with per-session browser contexts ([0f89e2f](https://github.com/alexandriashai/cbrowser/commit/0f89e2f))
  - Each MCP session gets isolated browser context (cookies, localStorage separated)
  - `MAX_CONCURRENT_SESSIONS` env var (default: 20)
  - `SESSION_IDLE_TIMEOUT_MS` env var (default: 5 minutes)
  - Automatic cleanup when sessions disconnect or go idle

* **mcp-remote:** per-session memory limits with auto-kill ([0866f83](https://github.com/alexandriashai/cbrowser/commit/0866f83))
  - `SESSION_MEMORY_LIMIT_MB` env var (default: 800MB)
  - Monitor Chromium RSS via /proc every 30 seconds
  - Auto-terminate sessions exceeding limit to protect other users
  - Prevents one bloated page from degrading all sessions

* **mcp-remote:** transparent session recovery ([0866f83](https://github.com/alexandriashai/cbrowser/commit/0866f83))
  - Expired sessions auto-recover on next request (no manual reconnect needed)
  - Low-friction UX: user's next command just works with fresh session
  - Logging shows recovery: `[Session] Auto-recovering expired session...`

## [18.3.12](https://github.com/alexandriashai/cbrowser/compare/v18.3.11...v18.3.12) (2026-02-16)

## [18.3.11](https://github.com/alexandriashai/cbrowser/compare/v18.4.0...v18.3.11) (2026-02-16)

## [18.3.10](https://github.com/alexandriashai/cbrowser/compare/v18.3.9...v18.3.10) (2026-02-12)

### Fixed

* add explicit process.exit(0) after browser commands ([930dbf0](https://github.com/alexandriashai/cbrowser/commit/930dbf0dfd2b5ff78f7284e6bde74999cd4abcd7))

## [18.3.9](https://github.com/alexandriashai/cbrowser/compare/v18.3.8...v18.3.9) (2026-02-12)

## [18.3.8](https://github.com/alexandriashai/cbrowser/compare/v18.3.5...v18.3.8) (2026-02-12)

## [18.3.5](https://github.com/alexandriashai/cbrowser/compare/v18.3.4...v18.3.5) (2026-02-12)

## [18.3.4](https://github.com/alexandriashai/cbrowser/compare/v18.3.3...v18.3.4) (2026-02-12)

## [18.3.3](https://github.com/alexandriashai/cbrowser/compare/v18.3.1...v18.3.3) (2026-02-12)

### Fixed

* restore truncated files and update headers ([9f764a0](https://github.com/alexandriashai/cbrowser/commit/9f764a05667aa1c56e2b9b72ab87951e78944005))

## [18.3.1](https://github.com/alexandriashai/cbrowser/compare/v18.3.0...v18.3.1) (2026-02-11)

## [18.3.0](https://github.com/alexandriashai/cbrowser/compare/v18.2.1...v18.3.0) (2026-02-11)

### Added

* **mcp-remote:** add optional rate limiting with burst allowance ([0b17ba9](https://github.com/alexandriashai/cbrowser/commit/0b17ba9e806dd670e77087b5a1b609002320a9c6))

## [18.2.1](https://github.com/alexandriashai/cbrowser/compare/v18.2.0...v18.2.1) (2026-02-11)

### Fixed

* **docker:** update Playwright to v1.58.2 ([a6a4dae](https://github.com/alexandriashai/cbrowser/commit/a6a4dae4390f82ccbf0ed89d458ade2df6b74656))

## [18.2.0](https://github.com/alexandriashai/cbrowser/compare/v18.1.0...v18.2.0) (2026-02-11)

### Added

* **mcp-remote:** add base64 image encoding for remote screenshots ([9a9507b](https://github.com/alexandriashai/cbrowser/commit/9a9507b8fada2d604f4e3ec40e462d99c8bba03f)), closes [#107](https://github.com/alexandriashai/cbrowser/issues/107)

## [18.1.0](https://github.com/alexandriashai/cbrowser/compare/v18.0.0...v18.1.0) (2026-02-11)

### Added

* **mcp:** return base64 images for remote MCP mode ([#107](https://github.com/alexandriashai/cbrowser/issues/107)) ([a62c0c1](https://github.com/alexandriashai/cbrowser/commit/a62c0c128321560c2280606b9ec7be9b0614befe))

## [18.0.0](https://github.com/alexandriashai/cbrowser/compare/v17.6.1...v18.0.0) (2026-02-11)

### ⚠ BREAKING CHANGES

* **cli:** Persistent mode is now enabled by default.
Use --no-persistent to disable session continuity.

Fixes:
- #103: Device emulation persistence - `device set` now saves to session state
- #104: Session state loss - persistent mode is now the default

Changes:
- Add device field to SessionState interface
- Add saveDeviceSetting() method to CBrowser class
- Restore device setting on browser launch in persistent mode
- Change CLI default from --persistent to --no-persistent
- Update help text to reflect new default

Also includes new documentation files for tool categories.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>

### Fixed

* **cli:** session persistence and device emulation ([#103](https://github.com/alexandriashai/cbrowser/issues/103), [#104](https://github.com/alexandriashai/cbrowser/issues/104)) ([67432e5](https://github.com/alexandriashai/cbrowser/commit/67432e580fcded743fe216e47555d29532418a09))

## [17.7.0] (2026-02-11)

### Fixed

* **cli:** default to persistent mode for session continuity between commands (#104)
  - Sequential CLI commands now maintain browser state by default
  - Use `--no-persistent` to disable persistent mode
* **cli:** device emulation now persists across commands (#103)
  - `cbrowser device set <name>` saves the device setting to session state
  - Device setting is restored on next command launch
  - No need to pass `--device` flag to every command

### Changed

* **cli:** `--persistent` flag is now `--no-persistent` (persistent is default)

## [17.6.1](https://github.com/alexandriashai/cbrowser/compare/v17.6.0...v17.6.1) (2026-02-11)

### Fixed

* **mcp:** auto-fix Accept header for Claude.ai custom connectors ([a8462b9](https://github.com/alexandriashai/cbrowser/commit/a8462b925a1258b2431d79441f76703167bdb8d0))

## [17.6.0](https://github.com/alexandriashai/cbrowser/compare/v17.5.3...v17.6.0) (2026-02-11)

### Added

* **mcp:** modular tool registration for MCP servers ([27308c7](https://github.com/alexandriashai/cbrowser/commit/27308c77772cd0f6b1679c1ed5a9d2010baab3a4))

## [17.5.3](https://github.com/alexandriashai/cbrowser/compare/v17.5.2...v17.5.3) (2026-02-11)

## [17.5.2](https://github.com/alexandriashai/cbrowser/compare/v17.5.1...v17.5.2) (2026-02-11)

## [17.5.1](https://github.com/alexandriashai/cbrowser/compare/v17.4.1...v17.5.1) (2026-02-11)

### Fixed

* **click:** navigate correctly when clicking URL-text links ([0051b0a](https://github.com/alexandriashai/cbrowser/commit/0051b0ad86bbfe4933895392c0c24135bc327769))
