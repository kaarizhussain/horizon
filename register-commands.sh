#!/usr/bin/env bash
# Registers Horizon's slash commands with Discord. Run once (and again only if
# commands change):  APP_ID=... BOT_TOKEN=... bash register-commands.sh
set -euo pipefail
: "${APP_ID:?set APP_ID}" "${BOT_TOKEN:?set BOT_TOKEN}"

curl -sS -X PUT "https://discord.com/api/v10/applications/${APP_ID}/commands" \
  -H "Authorization: Bot ${BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '[
    { "name": "board", "type": 1, "description": "Show today'\''s Horizon board" },
    { "name": "done",  "type": 1, "description": "Mark day tasks done",
      "options": [{ "name": "items", "type": 3, "required": true, "description": "numbers from /board, e.g. 1,3" }] },
    { "name": "add",   "type": 1, "description": "Add a task or goal",
      "options": [
        { "name": "text", "type": 3, "required": true, "description": "what to add" },
        { "name": "horizon", "type": 3, "required": false, "description": "where it goes (default: day)",
          "choices": [
            { "name": "Today", "value": "day" }, { "name": "This Week", "value": "week" },
            { "name": "This Month", "value": "month" }, { "name": "This Year", "value": "year" } ] } ] },
    { "name": "skip",  "type": 1, "description": "Push day tasks to tomorrow",
      "options": [{ "name": "items", "type": 3, "required": true, "description": "numbers from /board, e.g. 2" }] }
  ]' | head -c 400
echo
echo "Commands registered."
