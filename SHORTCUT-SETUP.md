# iPhone Reminders — one-time Shortcut setup (~10 min, do after "push")

Goal: every morning at 7:15, your phone pulls the day's plan and creates one
Reminder per time block in a "Horizon" list.

## 1. Make the list
Reminders app → Add List → name it **Horizon**.

## 2. Build the shortcut
Shortcuts app → **+** → name it "Horizon Plan". Add these actions in order:

1. **Get Contents of URL**
   - URL: `https://esithnapkqxwpsfvfwgr.supabase.co/functions/v1/plan`
   - Tap ▸ Show More → Method: **GET** → Headers: add
     `X-Horizon-Key` : `<HORIZON_HOOK_KEY — real value lives in the Supabase secrets and the scheduled-task prompts>`
2. **Get Dictionary Value** — Get **Value** for key `items` in **Contents of URL**
3. **Repeat with Each** (input: Dictionary Value). Inside the repeat:
   a. **Get Dictionary Value** — key `title` in **Repeat Item**
   b. **Get Dictionary Value** — key `time`  in **Repeat Item**
   c. **Date** action → set to **Current Date**, then a **Format Date** /
      **Adjusted Date** trick is fiddly — simplest reliable version: use
      **Add New Reminder** with:
      - Title: `[time variable] — [title variable]`  (time shown in the text)
      - List: **Horizon**
      - Alert: **Time of Day** → pick a fixed 7:30 AM alert
      (Per-item alert times from the JSON are possible but Shortcuts date
      parsing is painful; start with the simple version, upgrade if wanted.)
4. End Repeat.

## 3. Automate it
Shortcuts → **Automation** tab → **+** → **Time of Day** → 7:15 AM, Daily →
**Run Immediately** (no confirmation) → choose the "Horizon Plan" shortcut.

## Notes
- Run the shortcut once manually first; approve the network permission prompt.
- The endpoint returns the most recent stored plan; before the first post-push
  7am run it will be empty (`items: []`) — the shortcut just creates nothing.
- The hook key in the shortcut lives only on your phone. If we ever rotate the
  key, update it here too.
