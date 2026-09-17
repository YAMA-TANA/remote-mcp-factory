# PicoSvc service-specific workspaces

The localized product workspace now dispatches to distinct Fetch and Shot workspaces, plus a service-specific studio for MCP, RSS, Mail, QR, Cron, Functions, JSON, Files, License, Config, Monitor and Forms. Mock and Hooks keep their dedicated existing routes.

Each studio describes its own primary workflow, groups the creation fields according to the task, offers relevant controls (for example Cron schedule presets, an optional RSS selector drawer, a QR destination preview and a Functions source editor), gives resources service-aware names and summaries, and retains the original management/details components for editing and operational actions. Authentication and API transport stay shared; no API contract or database migration was changed.

The studios use English, Japanese and simplified Chinese descriptions. New credentials remain masked until revealed; copy operations and responsive styles are retained. The static layout does not claim to measure actual task progress or successfully perform a live deployment.

Verification: `node scripts/test-picosvc-service-studios.mjs`, Web CI type checking, existing workspace/discovery tests, build and static export. Live Cloudflare deployment and real account/browser use require independent verification.
