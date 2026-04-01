---
sequence: Day 1
trigger: 24 hours after signup
subject: "Create your first real cron job in 60 seconds"
preview_text: "Pick a template and be done before your coffee cools down."
---

Hi {{first_name}},

Yesterday you signed up. Today, let's put CronAPI to work on something real.

The fastest way to start is with a template. Here are three that developers use most often:

---

**Uptime monitor** — know the moment your site goes down
```json
{
  "name": "Ping my site",
  "schedule": "*/5 * * * *",
  "type": "http",
  "config": { "url": "https://yoursite.com/health", "expectedStatus": 200 }
}
```
→ [Use this template](https://cronapi.io/templates/uptime-monitor)

---

**Daily Slack digest** — push a summary to your team every morning
```json
{
  "name": "Morning digest",
  "schedule": "0 9 * * 1-5",
  "type": "http",
  "config": { "url": "YOUR_SLACK_WEBHOOK", "method": "POST",
              "body": { "text": "Good morning! Here's your daily update." } }
}
```
→ [Use this template](https://cronapi.io/templates/slack-digest)

---

**Database backup** — automatically back up your Postgres DB
```json
{
  "name": "Nightly backup",
  "schedule": "0 2 * * *",
  "type": "http",
  "config": { "url": "https://yourapp.com/run-backup", "method": "POST" }
}
```
→ [Use this template](https://cronapi.io/templates/db-backup)

---

Pick one, swap in your URL, and you're live.

→ [Browse all templates](https://cronapi.io/templates)

Questions? Just reply here.

— The CronAPI team

---
*[Unsubscribe]({{unsubscribe_url}})*
