---
sequence: Day 3
trigger: 3 days after signup
subject: "What other developers are automating with CronAPI"
preview_text: "3 use cases your peers swear by."
---

Hi {{first_name}},

You've had a few days to kick the tires. Here's what other developers are actually building with CronAPI right now — in case it sparks an idea.

---

**1. Automated report emails**
A SaaS team sends a weekly PDF report to every customer automatically. CronAPI triggers their report-generation endpoint every Monday at 8 AM. Their support tickets dropped 40% because customers stopped emailing "can you send me the numbers?"

---

**2. Social media scheduling**
An indie maker pre-writes a week of tweets on Sunday night, queues them in a simple Postgres table, and CronAPI polls it every minute to publish them at the right time. No paid Buffer subscription needed.

---

**3. Stale data cleanup**
An e-commerce team runs a nightly job that deletes abandoned carts older than 7 days and re-stocks inventory held by those carts. Their database stays lean and their stock counts stay accurate.

---

None of these required custom infrastructure — just an HTTP endpoint and a cron expression.

What are you automating? Hit reply and tell me — I'm always curious what people are building.

→ [Explore more use cases](https://cronapi.io/use-cases)

— The CronAPI team

---
*[Unsubscribe]({{unsubscribe_url}})*
