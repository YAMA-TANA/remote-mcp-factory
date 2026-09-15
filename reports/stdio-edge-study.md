# npm+stdio MCP → Edge study

This samples **actual npm packages declared with stdio transport in the Official MCP Registry**, not arbitrary repository links. It locates the matching package.json inside each repository, ignores test/example directories, excludes local-only semantics and stdio→remote bridge wrappers, then classifies runtime blockers.

## Result

- Sample: **100** packages
- Analyzable remotely-hostable: **34**
- Edge candidates: **27**
- Sandbox-required: **7**
- Edge share of analyzable remotely-hostable: **79.4%**

## Buckets
- uncertain: **31**
- sandbox-required: **7**
- inaccessible: **23**
- local-bound: **8**
- remote-wrapper: **4**
- edge-adaptable: **27**

## Details

| npm package | classification | confidence | primary reason |
|---|---|---|---|
| @appfigures/cli | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @zensation/mcp | sandbox-required | high | native database |
| feedback-magic-mcp | inaccessible | high | repository could not be cloned/scanned |
| telbase | inaccessible | high | repository could not be cloned/scanned |
| @agentutility/mcp-model-router | inaccessible | high | repository could not be cloned/scanned |
| @decionis/mcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| cortex-memory-mcp | inaccessible | high | repository could not be cloned/scanned |
| @leafwright/mcp | inaccessible | high | repository could not be cloned/scanned |
| @getmcpads/google-analytics-mcp-server | local-bound | medium | documented behavior depends on resources on the end user's machine |
| @letta-ai/memory-mcp | inaccessible | high | repository could not be cloned/scanned |
| @aioproductoscom/mcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| fodda-mcp | remote-wrapper | high | package primarily bridges local stdio to an already-remote MCP/service |
| @clawfetch/mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @agentutility/mcp-rollforge | inaccessible | high | repository could not be cloned/scanned |
| @mambalabsdev/mcp-funding-investor-record | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| familiar-vtt | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @gtm-api/linkedin-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @keumbang/goldpopcon-openapi-mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @hasdata/youtube-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| provably-fair-mcp | inaccessible | high | repository could not be cloned/scanned |
| @hasdata/web-scraping-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @mambalabsdev/mcp-pinterest-brand-presence-mapper | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @formatika/mcp | local-bound | medium | documented behavior depends on resources on the end user's machine |
| @n747ai/clearedindex-mcp-server | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| spaces-mcp-server | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @fouradata/mcp | remote-wrapper | high | package primarily bridges local stdio to an already-remote MCP/service |
| popdot-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @allratestoday/central-bank-mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @businys/mcp-server | edge-adaptable | medium | @modelcontextprotocol/sdk v1 requires import/transport migration to the v2 runtime-neutral packages |
| @mambalabsdev/mcp-team-page-people-extractor | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @bounceprotect/mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| apick-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @getmcpads/google-search-console-mcp-server | local-bound | medium | documented behavior depends on resources on the end user's machine |
| @mambalabsdev/mcp-gtm-tech-stack-signal-scraper | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| sentfromai-mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| mentu-navigator | sandbox-required | high | child_process |
| @clize/domains | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @chronary/mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @braincloud/mcp-helper | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| dex-data-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @odyssey365/mcp-server | inaccessible | high | repository could not be cloned/scanned |
| @echosaw/mcp-server | inaccessible | high | repository could not be cloned/scanned |
| @mambalabsdev/mcp-meta-brand-presence-mapper | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @imba_wallet/agent-mcp-docs | inaccessible | high | repository could not be cloned/scanned |
| hovercode-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @hasdata/instagram-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @mambalabsdev/mcp-review-platform-reputation-enricher | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| jobyap-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| htmlradar-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @certscore/mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @hasdata/booking-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @dbconvert/stream-mcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @agentutility/mcp-matchpoint | inaccessible | high | repository could not be cloned/scanned |
| @juicedresume/mcp | sandbox-required | high | child_process |
| @dinglebear/synapse | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| cituna-mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @claidex-mcp/claidex-mcp | inaccessible | high | repository could not be cloned/scanned |
| ctxl | inaccessible | high | repository could not be cloned/scanned |
| @borough/mcp | inaccessible | high | repository could not be cloned/scanned |
| @agentutility/mcp-statline | inaccessible | high | repository could not be cloned/scanned |
| gotify-rmcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @rolli/mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @uplink-code/mcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @nordic-data/mcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @mathismeadows/roamer-device-auth | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @withone/mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @autonomad1/computeback-mcp | local-bound | medium | documented behavior depends on resources on the end user's machine |
| affiliate-networks-mcp | local-bound | medium | documented behavior depends on resources on the end user's machine |
| @harukibox/mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @klarefi/mcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| ausca | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| easyparser-mcp | local-bound | medium | documented behavior depends on resources on the end user's machine |
| @ellul-estate/findagencyhq-com-agency-pricing-index-mcp | inaccessible | high | repository could not be cloned/scanned |
| cellarion-mcp | remote-wrapper | high | package primarily bridges local stdio to an already-remote MCP/service |
| mason-context | sandbox-required | high | child_process |
| @ellul-estate/damagerestorehq-com-claims-index-mcp | inaccessible | high | repository could not be cloned/scanned |
| vertical-marketplace-mcp | inaccessible | high | repository could not be cloned/scanned |
| @synchronex/mcp-proxy | inaccessible | high | repository could not be cloned/scanned |
| @driflyte/mcp-server | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| instantclips-mcp | remote-wrapper | high | package primarily bridges local stdio to an already-remote MCP/service |
| @krovacloud/mcp | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| kernelcad | sandbox-required | high | child_process |
| raven-mcp | local-bound | medium | documented behavior depends on resources on the end user's machine |
| @fidensa/mcp-server | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @hasdata/google-images-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @mambalabsdev/mcp-people-finder | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @focusgts/aep-mcp-server | sandbox-required | high | child_process |
| @aioproductoscom/mcp-studio | sandbox-required | high | child_process |
| @dxpert/uns-tools | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| arcane-rmcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @billingserv/mcp-server | local-bound | medium | documented behavior depends on resources on the end user's machine |
| @brick-byte/footnote | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @cadencercs/mcp | inaccessible | high | repository could not be cloned/scanned |
| bellwether-mcp | uncertain | low | could not locate package.json matching the Registry npm identifier |
| @hasdata/indeed-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| @agentutility/mcp-mediakit | inaccessible | high | repository could not be cloned/scanned |
| @ellul-estate/clientvo-com-clientvo-tools-mcp | inaccessible | high | repository could not be cloned/scanned |
| @hasdata/yellowpages-mcp | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
| bidsparq-mcp-server | edge-adaptable | medium | stdio transport must be replaced by a Web-standard MCP handler |
| @dinglebear/rytdl | uncertain | low | published npm package does not declare a recognized MCP server SDK dependency |
