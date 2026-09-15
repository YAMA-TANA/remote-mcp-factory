# MCP → Cloudflare Worker proof

- Result: **PASS**
- Repo: https://github.com/YAMA-TANA/CALCULATE_MCP.git
- Factory: `createCalculateServer` from `src/server.ts`
- MCP tools returned by workerd: **13**
- Tools: `calculate_expression`, `calculate_decimal`, `convert_units`, `list_units`, `summarize_statistics`, `calculate_percentage`, `calculate_finance`, `solve_root`, `calculate_matrix`, `calculate_complex`, `calculate_calculus`, `calculate_probability`, `calculate_date`
- Tested: bundle → local Cloudflare workerd → MCP initialize → tools/list

Generated: 2026-09-15T00:10:46.171Z
