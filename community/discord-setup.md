# CronAPI Community Hub — Discord Setup Guide

## Overview

This document covers the Discord server configuration, channel structure, and welcome copy for the CronAPI developer community. Once we have a critical mass (~50 users), we'll make the invite public.

**Goal:** A place where developers can get help, share what they've built, and influence the roadmap.

---

## 1. Server Settings

- **Server Name:** CronAPI Community
- **Server Icon:** CronAPI logo (same as site favicon)
- **Server Description:** The community for developers using CronAPI — scheduled HTTP jobs without the server headache.
- **Verification Level:** Low (email verified only — low friction for developers)
- **Default Notifications:** Only @mentions (so members aren't spammed)
- **Explicit Content Filter:** All members

---

## 2. Channel Structure

### 📣 Information (read-only, managed role)

| Channel | Purpose |
|---------|---------|
| `#announcements` | Product releases, breaking changes, pricing updates |
| `#changelog` | Auto-posts from changelog.html or RSS feed |
| `#roadmap` | Current quarter priorities, what's being worked on |
| `#rules` | Community code of conduct (short) |

### 💬 Community

| Channel | Purpose |
|---------|---------|
| `#introductions` | New member intros (pinned welcome message) |
| `#general` | Off-topic chat, general discussion |
| `#show-and-tell` | Share what you've built with CronAPI |
| `#feedback` | Feature requests and product feedback |

### 🛠 Technical

| Channel | Purpose |
|---------|---------|
| `#help` | Questions about setup, cron syntax, API usage |
| `#integrations` | Tips and configs for specific stacks (Next.js, Laravel, etc.) |
| `#api-status` | Links to status page; incident updates |

### 🏆 Milestones (locked, bot-managed)

| Channel | Purpose |
|---------|---------|
| `#hall-of-fame` | Members who've referred 3+ users get a shoutout here |

---

## 3. Roles

| Role | How assigned | Colour | Perks |
|------|-------------|--------|-------|
| `🔧 Builder` | Auto on join | Grey | Base access |
| `⭐ Indie` | Linked to paid account (manual for now) | Blue | Badge in profile |
| `🚀 Pro` | Linked to Pro account (manual for now) | Gold | Badge + priority support channel |
| `📣 Contributor` | Manual — given to members who file useful bug reports or share tutorials | Green | Invite to #roadmap voice chats |
| `🛡 Team` | Manual — CronAPI team members | Red | Moderator permissions |

---

## 4. Bot Configuration

### MEE6 (or Carl-bot)
- Auto-assign `🔧 Builder` on join
- Post join message in `#introductions`
- Mute/ban for spam

### Welcome DM (sent automatically on join)

> **Welcome to CronAPI Community!**
>
> Hey {username} 👋
>
> Thanks for joining — we're building the simplest way to schedule HTTP jobs, and this community is how we figure out what to build next.
>
> **Quick links:**
> - [Get your API key](https://cronapi.hakinsight.com) — free tier, no credit card
> - [API Docs](https://cronapi.hakinsight.com/api/docs) — everything you need to get started
> - [#help](https://discord.com/channels/...) — ask anything, no question is too basic
>
> Say hi in [#introductions](https://discord.com/channels/...) and let us know what you're building!

---

## 5. Welcome Message (pinned in #general)

```
👋 Welcome to CronAPI Community

CronAPI is a managed cron job API — register, get a key, POST a job, and your endpoint gets called on schedule. No servers, no crontab, no IAM hell.

📖 Getting started? → https://cronapi.hakinsight.com/docs/
🛠 Need help?       → #help
💡 Have an idea?    → #feedback
🎉 Built something? → #show-and-tell

Free tier: 10 jobs, hourly scheduling, no credit card required.
```

---

## 6. Code of Conduct (short version for #rules)

```
CronAPI Community — Code of Conduct

1. Be respectful. No personal attacks or harassment.
2. Stay on topic per channel.
3. No spam, self-promotion without context, or DM solicitation.
4. Share knowledge freely — help others where you can.
5. Report issues to @Team.

Violations: warning → mute → ban.
```

---

## 7. Launch Checklist

- [ ] Create server with above structure
- [ ] Set up MEE6 / Carl-bot welcome DM
- [ ] Pin welcome message in #general
- [ ] Post #rules
- [ ] Add Team role to founders
- [ ] Post in Discord server: invite early waitlist users
- [ ] Add Discord link to site footer and docs
- [ ] Set up #changelog automation (optional: Zapier webhook → Discord)

---

## 8. Alternative: GitHub Discussions

If Discord feels too heavyweight initially, GitHub Discussions can serve as the community hub:

**Structure:**
- 📣 **Announcements** — Pinned posts from team
- 💬 **General** — Open discussion
- 🙏 **Q&A** — Marked-answer support threads
- 💡 **Ideas** — Feature requests (upvotable)
- 🎉 **Show and Tell** — Built with CronAPI

**Pros:** Zero setup friction, integrates with repo, developers are already there.
**Cons:** Less real-time feel, no DMs, harder to build community culture.

**Recommendation:** Start with GitHub Discussions (faster, free). Migrate to Discord once you have 100+ active users.
