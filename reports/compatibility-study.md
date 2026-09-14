# MCP Function Compatibility Study

Generated: 2026-09-14T23:58:05.395Z

Source: **Official MCP Registry**, sampled deterministically from public GitHub-backed servers. Local-bound MCPs are excluded from the remotely-hostable denominator. This is a static first-pass study; production compatibility still requires an actual bundle/build plus MCP initialize/tools-list smoke test.

## Result

- Sample: **100 repos**
- Remotely-hostable denominator: **46**
- Local-bound excluded: **5**
- Uncertain: **49**
- Strict edge-likely share of hostable: **15.2%**
- Node edge-likely + edge-adaptable: **45.7%**
- Possible edge incl. Python conditional: **58.7%**
- Sandbox-required share of hostable: **41.3%**

## Buckets
- **edge-conditional: 6**
- **uncertain: 49**
- **local-bound: 5**
- **edge-adaptable: 14**
- **sandbox-required: 19**
- **edge-likely: 7**

## Sample details

| MCP | Repository | Remote already declared | Classification | Confidence | Primary reason |
| --- | --- | ---: | --- | --- | --- |
| Rechtssysteem.ai | https://github.com/rechtssysteem-ai/rechtssysteem-mcp | no | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| Uganda Payments (Flutterwave — MTN MoMo) | https://github.com/junter1989k-ai/uganda-payments-mcp | yes | uncertain | low | clone/scan failed |
| Cortex RMCP | https://github.com/jmagar/cortex | no | local-bound | medium | documentation indicates value tied to the user/local machine |
| ai.smithery/lukaskostka99-marketing-miner-mcp | https://github.com/lukaskostka99/marketing-miner-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Otto Data — Robinhood Chain | https://github.com/Degergokalp/otto-data | yes | uncertain | low | clone/scan failed |
| ai.ponlo/server | https://github.com/ClaudioGodoyB/ponlo-ai | no | uncertain | low | clone/scan failed |
| ai.waystation/airtable | https://github.com/waystation-ai/mcp | yes | sandbox-required | high | child_process |
| ai.pullpush/pullpush-mcp | https://github.com/Kaduno-systems/pullpush-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| YouTube Transcript AI | https://github.com/zxl777/youtube-transcript-mcp | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| ConnectMachine | https://github.com/connectmachine/mcp-server | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ProofSlip | https://github.com/Johnny-Z13/proofslip | no | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| ai.smithery/pinkpixel-dev-web-scout-mcp | https://github.com/pinkpixel-dev/web-scout-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| ai.windsock/windsock | https://github.com/team-windsock/windsock-mcp | yes | sandbox-required | high | child_process |
| Ra Pay | https://github.com/Ra-Pay-AI/rapay | no | uncertain | low | clone/scan failed |
| Offendersearch | https://github.com/Clavaa/offendersearch-quickstart | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| ssave.cc — TikTok & Instagram Downloader | https://github.com/ssavecc/ssave-mcp-server | no | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| SOAR Record Gateway | https://github.com/lateos-ai/website | yes | uncertain | low | clone/scan failed |
| Nauro | https://github.com/Nauro-AI/nauro | no | local-bound | medium | documentation indicates value tied to the user/local machine |
| Just Publish | https://github.com/just-done/just-publish-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ch.pfx/mcp-server | https://github.com/pitwch/pfx-mcp-server | yes | sandbox-required | high | child_process |
| ai.atlaso/mcp | https://github.com/atlaso-labs/mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| Australia Logistics (buy Aramex + more labels + tracking via Shippo) | https://github.com/junter1989k-ai/australia-logistics-mcp | yes | uncertain | low | clone/scan failed |
| ai.smithery/huuthangntk-claude-vision-mcp-server | https://github.com/huuthangntk/claude-vision-mcp-server | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Pakistan Payments (Safepay — Safepay checkout) | https://github.com/junter1989k-ai/pakistan-payments-mcp | yes | uncertain | low | clone/scan failed |
| ai.smithery/Pratiksha-Kanoja-magicslide-mcp-test | https://github.com/Pratiksha-Kanoja/magicslide-mcp-test | yes | uncertain | low | clone/scan failed |
| United Kingdom Payments (Stripe — Stripe checkout) | https://github.com/junter1989k-ai/uk-payments-mcp | yes | uncertain | low | clone/scan failed |
| AgentBIT | https://github.com/socialbitro/agentbit-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ai.inflowpay.app/inflow | https://github.com/inflowpayai/inflow-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| Colombia Payments (Mercado Pago — PSE / Nequi) | https://github.com/junter1989k-ai/colombia-payments-mcp | yes | uncertain | low | clone/scan failed |
| InfoLang Memory | https://github.com/InfoLang-Inc/infolang-services | yes | uncertain | low | clone/scan failed |
| ai.smithery/Danushkumar-V-mcp-discord | https://github.com/Danushkumar-V/mcp-discord | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| ai.smithery/exa-labs-exa-code-mcp | https://github.com/exa-labs/exa-code-mcp | yes | uncertain | low | clone/scan failed |
| Poland Invoices (KSeF 2.0 national e-invoice API) | https://github.com/junter1989k-ai/poland-invoice-mcp | yes | uncertain | low | clone/scan failed |
| ai.atdev/supershopping | https://github.com/alex-hoyeol-choi/headless-commerce | yes | uncertain | low | clone/scan failed |
| openaso | https://github.com/xekor/openaso-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ai.shumi/mcp | https://github.com/shumi-ai/shumi-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| app.nomadpoint/nomadpoint | https://github.com/eladkishon/nomadpoint | yes | uncertain | low | clone/scan failed |
| LimitGuard Trust Intelligence | https://github.com/jwconsultancyteam/limitguard-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ai.smithery/ChiR24-unreal_mcp | https://github.com/ChiR24/Unreal_mcp | yes | sandbox-required | high | child_process |
| ai.smithery/IlyaGusev-academia_mcp | https://github.com/IlyaGusev/academia_mcp | yes | sandbox-required | high | subprocess/shell |
| ai.flyvolo/knowledge | https://github.com/weihermans/VOLO | yes | uncertain | low | clone/scan failed |
| Saudi Arabia Payments (Tap Payments — mada / STC Pay) | https://github.com/junter1989k-ai/saudi-arabia-payments-mcp | yes | uncertain | low | clone/scan failed |
| Windsor.ai MCP | https://github.com/windsor-ai/windsor_mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| Popdot AI | https://github.com/popdot-ai/popdot-mcp | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| MentionAgent | https://github.com/BuildsbyMatt/mentionagent-claude-skill | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ca.swiftsign/mcp | https://github.com/shahdadk/swiftsign | yes | sandbox-required | high | child_process |
| Taiwan Payments & E-Invoice (ECPay 綠界 / NewebPay 藍新) | https://github.com/junter1989k-ai/taiwan-payments-mcp | yes | uncertain | low | clone/scan failed |
| TikTok Trends MCP | https://github.com/trendsmcp-ai/tiktok-trends-mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| Spala Public MCP | https://github.com/spala-ai/spala-public-mcp | yes | sandbox-required | high | child_process |
| TraderSpy | https://github.com/target1m/traderspy-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| Uruguay Payments (Mercado Pago — Mercado Pago wallet) | https://github.com/junter1989k-ai/uruguay-payments-mcp | yes | uncertain | low | clone/scan failed |
| app.vercel.proof-stack-lake/proofstack | https://github.com/lttxzmj/proofstack-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| cloud.fetcher/fetcher | https://github.com/fetchercloud/fetcher-cloud | yes | sandbox-required | high | browser automation |
| Squad | https://github.com/the-basilisk-ai/squad-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| Boolsai Directory | https://github.com/Boolsai-ai/mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| Nigeria Payments (Paystack — bank transfer / USSD) | https://github.com/junter1989k-ai/nigeria-payments-mcp | yes | uncertain | low | clone/scan failed |
| ai.deskcrew/agentic | https://github.com/papperkash/ttf-website-v3 | yes | uncertain | low | clone/scan failed |
| Grimoire | https://github.com/zafety-vibin/grimoire-mcp | yes | sandbox-required | high | native Go runtime |
| Duami | https://github.com/mjbf5g7y8m-byte/matrix | yes | uncertain | low | clone/scan failed |
| ai.dataecho/mcp | https://github.com/mohocp/dataecho | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| GetFacade | https://github.com/getfacade/mcp | no | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| ai.foura/mcp | https://github.com/fouradata/mcp | yes | sandbox-required | high | child_process |
| ai.syntitan/syntitan-mcp | https://github.com/cubigcorp/syntitan-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ai.smithery/samihalawa-whatsapp-go-mcp | https://github.com/samihalawa/whatsapp-go-mcp | yes | sandbox-required | high | native Go runtime |
| Maguyva | https://github.com/Maguyva/mcp | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| ai.smithery/bergeramit-bergeramit-hw3-tech | https://github.com/bergeramit/bergeramit-hw3-tech | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| Tokonomix Council | https://github.com/TokonoMix/tokonomix-council-mcp | no | sandbox-required | high | child_process |
| MarketTrace agent-feed | https://github.com/MarketTrace/markettrace-agent-feed | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| ai.callmcp/server | https://github.com/CallMCP/callmcp | no | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| xmp4 — Semantic code knowledge for your stack | https://github.com/0ics-srls/lsai-xmp4.public | yes | sandbox-required | high | subprocess/shell |
| app.businys/mcp-server | https://github.com/hiatys/businys-mcp | no | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| YTDL RMCP | https://github.com/dinglebear-ai/rytdl | no | local-bound | medium | documentation indicates value tied to the user/local machine |
| PDS Project AI MPP Connector | https://github.com/projectdata-io/mpp-poweautomate-connector | yes | uncertain | low | clone/scan failed |
| Ambix | https://github.com/ambix-ai/mcp | yes | uncertain | low | clone/scan failed |
| Synapse RMCP | https://github.com/dinglebear-ai/synapse | no | local-bound | medium | documentation indicates value tied to the user/local machine |
| ch.immoswipe/immoswipe-ai | https://github.com/Immoswipe/immoswipe-ai | yes | uncertain | low | clone/scan failed |
| at.memebo/memeboat-mcp | https://github.com/memebo-at/memeboat-mcp | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| capital.hove/read-only-local-postgres-mcp-server | https://github.com/hovecapital/read-only-local-postgres-mcp-server | no | local-bound | medium | documentation indicates value tied to the user/local machine |
| Reddit Trends MCP | https://github.com/trendsmcp-ai/reddit-trends-mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| ai.smithery/arjunkmrm-local001 | https://github.com/arjunkmrm/time | yes | uncertain | low | clone/scan failed |
| Hungary Invoices (NAV Online Szamla 3.0 reporting API) | https://github.com/junter1989k-ai/hungary-invoice-mcp | yes | uncertain | low | clone/scan failed |
| ai.syntheticbrew/syntheticbrew | https://github.com/syntheticinc/syntheticbrew | yes | uncertain | low | clone/scan failed |
| AutoRFP.ai | https://github.com/AutoRFP/mcp | yes | edge-conditional | medium | Python has no obvious hard blocker; Pyodide dependency compatibility still requires build verification |
| SnowSure — Snow & Ski | https://github.com/mikeslone/snowsure-web | yes | uncertain | low | clone/scan failed |
| Ishan Goyal public context | https://github.com/IshanGoyal/personal-website | yes | uncertain | low | clone/scan failed |
| Gotify RMCP | https://github.com/jmagar/gotify-rmcp | no | sandbox-required | high | native Rust runtime |
| ai.backengine/backengine-mcp | https://github.com/BackEngine-ai/backengine-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| Forge Engine | https://github.com/alongkornonline2019/forge-mcp | yes | sandbox-required | high | child_process |
| ai.smithery/dsharipova-mcp-hw | https://github.com/dsharipova/mcp-hw | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| ai.wild-card/deepcontext | https://github.com/Wildcard-Official/deepcontext | no | uncertain | low | clone/scan failed |
| MCP Junction | https://github.com/rickstek/mcpjunction | yes | sandbox-required | high | browser automation |
| Scry | https://github.com/TunnelMind/scry-mcp | yes | edge-likely | high | Node/TypeScript with no detected subprocess, browser, native-addon, or local-daemon blocker |
| GEOMETRY | https://github.com/goqolabs/geometry-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| MainBook Bank Statement Converter | https://github.com/human-beyond/mainbook-mcp | yes | sandbox-required | high | subprocess/shell |
| EasyKanban | https://github.com/egoetmann/easykanban-mcp | yes | uncertain | low | runtime not covered by automatic edge compiler |
| ai.smithery/truss44-mcp-crypto-price | https://github.com/truss44/mcp-crypto-price | yes | edge-adaptable | medium | Node/TypeScript has no hard native/process blocker but state/listener semantics need checking |
| ai.websitepublisher/mcp | https://github.com/megberts/mcp-websitepublisher-ai | yes | uncertain | low | runtime not covered by automatic edge compiler |
| Netherlands Invoices (Peppol BIS 3.0 via Storecove) | https://github.com/junter1989k-ai/netherlands-invoice-mcp | yes | uncertain | low | clone/scan failed |
| ai.smithery/jirispilka-actors-mcp-server | https://github.com/jirispilka/actors-mcp-server | yes | sandbox-required | high | child_process |
| CountLink | https://github.com/mrbrunocode/countlink | yes | sandbox-required | high | child_process |
