# Discord bot — your one-time setup (~5 min, do when we deploy Phase 2)

The bot gives you `/board`, `/done`, `/add`, `/skip` from any device. Your part
is creating the Discord application (credentials stay with you); Claude deploys
the endpoint.

## 1. Create the application
1. https://discord.com/developers/applications → **New Application** → name it `Horizon`.
2. On **General Information**, copy two values:
   - **Application ID**
   - **Public Key**  ← this one goes to Claude/Supabase (it's a *public* verification key, safe to share)
3. **Bot** tab → **Reset Token** → copy the **Bot Token** (this one is SECRET —
   never paste it in chat; you'll use it only in step 3 on your own machine).

## 2. Give the public key to the edge function
Supabase → [Edge Function Secrets](https://supabase.com/dashboard/project/esithnapkqxwpsfvfwgr/functions/secrets):
`DISCORD_PUBLIC_KEY` = the Public Key from step 1.

## 3. Register the slash commands (run yourself, once)
In Git Bash on your machine (replace the two placeholders — the token never
leaves your computer):

```bash
APP_ID="your-application-id" BOT_TOKEN="your-bot-token" bash register-commands.sh
```

## 4. Point Discord at the endpoint
Back on **General Information** → **Interactions Endpoint URL**:
```
https://esithnapkqxwpsfvfwgr.supabase.co/functions/v1/discord-bot
```
Discord immediately sends a signed PING to validate — it only saves if the
function is deployed and verifying correctly.

## 5. Invite the bot to your server
**Installation** (or OAuth2 → URL Generator): scope `applications.commands`
(the slash commands don't need any other bot permissions) → open the generated
URL → pick your server.

Then type `/board` in any channel. 🎉
