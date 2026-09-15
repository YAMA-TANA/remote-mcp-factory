# MCP Function Compatibility Study

Generated: 2026-09-15T00:01:03.267Z

Source: **Official MCP Registry**, deterministically sampled from public GitHub-backed servers. "Local-bound" is deliberately strict: only MCPs whose semantics depend on the end user's own machine/session are excluded. A binary or local dependency by itself is **not** local-bound; it is Sandbox work. This remains a static first pass: real Function compatibility requires bundle/build plus MCP initialize/tools-list smoke tests.

## Result

- Sample: **100 repos**
- Analyzable remotely-hostable denominator: **51**
- Local-bound excluded: **0**
- Inaccessible repos: **35**
- Source/runtime unresolved: **14**
- Strict edge-likely share of analyzable hostable: **9.8%**
- Node edge-likely + edge-adaptable: **29.4%**
- Possible edge incl. Python conditional: **45.1%**
- Sandbox-required share of analyzable hostable: **54.9%**
- Conservative Node-Function floor across every non-local sampled repo (counting inaccessible/unresolved as non-Function): **15%**

## Buckets
- **inaccessible: 35**
- **sandbox-required: 28**
- **edge-conditional: 8**
- **uncertain: 14**
- **edge-adaptable: 10**
- **edge-likely: 5**

## Sample details

| MCP | Repository | Remote already declared | Classification | Confidence | Primary reason |
| --- | --- | ---: | --- | --- | --- |
| Stratta | https://github.com/hugogebel-boop/stratta-v2 | no | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.smithery/lineex-pubmed-mcp-smithery | https://github.com/lineex/pubmed-mcp-smithery | yes | sandbox-required | high | subprocess/shell |
| ai.crayonz/mcp | https://github.com/iitian-vibes/AIDesign | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Cortex RMCP | https://github.com/dinglebear-ai/cortex | no | sandbox-required | high | Rust runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| App Store Trends MCP | https://github.com/trendsmcp-ai/app-store-trends-mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| HAVN | https://github.com/binarts/HAVN | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Luxembourg Payments (Stripe — cards / Apple Pay) | https://github.com/junter1989k-ai/luxembourg-payments-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Velvt | https://github.com/eberhardtj/velvet-circuit | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.haymon/dbmcp | https://github.com/haymon-ai/dbmcp | no | sandbox-required | high | Rust runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| Qatar Payments (Tap Payments — cards / Apple Pay) | https://github.com/junter1989k-ai/qatar-payments-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| app.decibelshield/decibel-shield | https://github.com/appstackllc/decibelshieldwebsite | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.sellermate/amazon-ads | https://github.com/SellerMate-AI/amazon-ads-mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| ai.blast-radius/blast-radius | https://github.com/kipmcc/blast-radius-live | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| app.thoughtspot/mcp-server | https://github.com/thoughtspot/mcp-server | yes | sandbox-required | high | child_process |
| ai.flyvolo/knowledge | https://github.com/weihermans/VOLO | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.smithery/Danushkumar-V-mcp-discord | https://github.com/Danushkumar-V/mcp-discord | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| ai.myspaice/spaces | https://github.com/neltomw/spaces-mcp-server | no | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| ai.smithery/aryankeluskar-poke-video-mcp | https://github.com/aryankeluskar/poke-video-mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| India Payments (Razorpay Payment Links — UPI / cards / netbanking) | https://github.com/junter1989k-ai/india-payments-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| dxpert.ai — industrial AI-readiness & UNS agents | https://github.com/dxpert-ai/dxpert-mcp | no | sandbox-required | high | child_process |
| Atako | https://github.com/aiybiz/aiybiz-next | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Amazon Trends MCP | https://github.com/trendsmcp-ai/amazon-trends-mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| ai.smithery/anirbanbasu-pymcp | https://github.com/anirbanbasu/pymcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| Otto Data — Robinhood Chain | https://github.com/Degergokalp/otto-data | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.smithery/docfork-mcp | https://github.com/docfork/docfork-mcp | yes | sandbox-required | high | child_process |
| Taskforce | https://github.com/taskforcehq/taskforce | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.smithery/kkjdaniel-bgg-mcp | https://github.com/kkjdaniel/bgg-mcp | yes | sandbox-required | high | Go runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| ai.smithery/arjunkmrm-scrapermcp_el | https://github.com/arjunkmrm/ScraperMcp_el | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| contextburn | https://github.com/arsentev-ai/contextburn | no | sandbox-required | high | Swift runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| cards.dearhuman/dearhuman | https://github.com/CarnivalBigTop/dearhuman-mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| ai.smithery/flight505-mcp_dincoder | https://github.com/flight505/MCP_DinCoder | yes | sandbox-required | high | child_process |
| ai.smithery/huuthangntk-claude-vision-mcp-server | https://github.com/huuthangntk/claude-vision-mcp-server | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Uplink | https://github.com/uplink-code/mcp | no | uncertain | low | no deployable server runtime recognized in scanned repository |
| Parallel Search MCP | https://github.com/parallel-web/search-mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| app.reassign/reassign | https://github.com/reassignai/plugins | yes | sandbox-required | high | child_process |
| app.cooperpetcare.www/cooper | https://github.com/somoscooper/cooper-webapp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.deskcrew/agentic | https://github.com/papperkash/ttf-website-v3 | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.klavis/strata | https://github.com/Klavis-AI/klavis | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Sweden Invoices (Peppol BIS 3.0 via Storecove) | https://github.com/junter1989k-ai/sweden-invoice-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Wiplash | https://github.com/Wiplash-ai/wiplash-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Mahonia | https://github.com/ryankiley/mahonia | yes | sandbox-required | high | child_process |
| CodeNib | https://github.com/sysevol-ai/CodeNib | no | sandbox-required | high | subprocess/shell |
| MarketTrace agent-feed | https://github.com/MarketTrace/markettrace-agent-feed | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| ProofSlip | https://github.com/Johnny-Z13/proofslip | no | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| npm Trends MCP | https://github.com/trendsmcp-ai/npm-trends-mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| ai.smithery/pinion05-supabase-mcp-lite | https://github.com/pinion05/supabase-mcp-lite | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Obris | https://github.com/obris-dev/obris-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Jordan Payments (Tap Payments — cards / Apple Pay) | https://github.com/junter1989k-ai/jordan-payments-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.sealgate/gateway | https://github.com/Edison-Watch/sealgate-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| app.crawlio/crawlio-browser | https://github.com/Crawlio-app/crawlio-browser | no | sandbox-required | high | Swift runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| ai.smithery/arjunkmrm-tutorials | https://github.com/arjunkmrm/tutorials | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| NewzAI MCP Server | https://github.com/Gauraviitkgp/news-mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| Kazakhstan Payments (Freedom Pay — cards (Freedom Pay)) | https://github.com/junter1989k-ai/kazakhstan-payments-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Voris | https://github.com/Rocket-Venture-Labs/voris-mcp | no | sandbox-required | high | child_process |
| ca.bluecraneworks/forms | https://github.com/tstuckle/bluecrane-forms-mcp | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| Noemic | https://github.com/MorganFisher2007/Noemic | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Kubit | https://github.com/Kubit-AI/mcp-server | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| ai.smithery/ChiR24-unreal_mcp | https://github.com/ChiR24/Unreal_mcp | yes | sandbox-required | high | .NET runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| ai.dsght/public | https://github.com/michalstrnadel/dsght-landing | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.verifox/email-verifier | https://github.com/verifoxturnix1/verifox-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Nigeria Payments (Paystack — bank transfer / USSD) | https://github.com/junter1989k-ai/nigeria-payments-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| AgentRoam | https://github.com/adiny/nomad-crypto-travel | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| SendFast | https://github.com/novica-ai/sendfast | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| app.onehaus/haus | https://github.com/Im5tu/haus | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| devglow | https://github.com/aesopfrom0/devglow-releases | no | uncertain | low | no deployable server runtime recognized in scanned repository |
| OneLore | https://github.com/SolidKeyAB/lore-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| MCP Junction | https://github.com/rickstek/mcpjunction | yes | sandbox-required | high | browser automation |
| ai.zimac/mnema | https://github.com/Zimac-AI/mnema | no | uncertain | low | no deployable server runtime recognized in scanned repository |
| app.hykeep/keep | https://github.com/re-manish/keep-pmo | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| YouTube Trends API | https://github.com/trendsapi-ai/youtube-trends-api | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| ai.smithery/aicastle-school-openai-api-agent-project | https://github.com/aicastle-school/openai-api-agent-project | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| Gotify RMCP | https://github.com/jmagar/gotify-rmcp | no | sandbox-required | high | Rust runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| ai.gency/gency-mcp | https://github.com/studiolab-dev/gency-mcp | no | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.smithery/arjunkmrm-perplexity-search | https://github.com/arjunkmrm/perplexity-search | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Atlarium Habitat Database MCP | https://github.com/techgardeners/atlarium-mcp | yes | sandbox-required | high | child_process |
| Siren | https://github.com/Hexahedral-Inc/siren-mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| Fiber AI | https://github.com/fiber-ai/mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| Taste | https://github.com/with0utwhy/taste-mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| ai.smithery/samihalawa-whatsapp-go-mcp | https://github.com/samihalawa/whatsapp-go-mcp | yes | sandbox-required | high | Go runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| Maguyva | https://github.com/Maguyva/mcp | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| TabTree | https://github.com/ai4xedu/tabtree-mcp | no | sandbox-required | high | native media/image |
| file2markdown | https://github.com/Robinhill85/file2markdown-mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| ai.emberverse/emberverse | https://github.com/Palmerschallon/ember | yes | sandbox-required | high | native media/image |
| app.causely/causely | https://github.com/causely-oss/causely-client | yes | sandbox-required | high | Go runtime is not a Cloudflare Worker JS/Pyodide target for this compiler |
| ai.inxy/seo-audit | https://github.com/riverliu8/inxy-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ai.exa/exa | https://github.com/exa-labs/exa-mcp-server | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| RCLL | https://github.com/Holetron-lab/fleet-memory | no | sandbox-required | high | child_process |
| ai.marchward/mcp-server | https://github.com/marchward/marchward | no | sandbox-required | high | child_process |
| ai.rolli/mcp | https://github.com/rolliinc/rolli-mcp | no | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| Credit GPS — Canadian credit | https://github.com/creditgps/CreditGPS | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Analytics Legends — SAP Analytics Intelligence | https://github.com/analyticslegends/analytics-legends-mcp | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| Make Effects | https://github.com/krasnoperov/inventory | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| ZenBrain Memory | https://github.com/zensation-ai/zenbrain | no | sandbox-required | high | child_process |
| AwrAIter — Telegram channels | https://github.com/MediaZione/AwrAiter | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| Uruguay Invoices (DGI e-Factura CFE, merchant-signed SOAP relay) | https://github.com/junter1989k-ai/uruguay-invoice-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Korea Payments (Toss Payments — cards / KakaoPay·NaverPay / virtual accounts) | https://github.com/junter1989k-ai/korea-payments-mcp | yes | inaccessible | high | repository could not be cloned or declared subfolder could not be scanned |
| Cardog | https://github.com/cardog-ai/mcp-server | yes | uncertain | low | no deployable server runtime recognized in scanned repository |
| dxpert.ai — free UNS tools (no API key) | https://github.com/dxpert-ai/uns-tools | no | sandbox-required | high | child_process |
| Slidingbox Hydrate/Dehydrate | https://github.com/slidingbox/hydrate-dehydrate-mcp | no | sandbox-required | high | child_process |
| ai.smithery/222wcnm-bilistalkermcp | https://github.com/222wcnm/BiliStalkerMCP | yes | sandbox-required | high | subprocess/shell |
