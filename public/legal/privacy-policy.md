# Privacy Policy

> **Template Notice:** This is a draft privacy policy template pending formal legal review. It is not a substitute for advice from a qualified attorney. CronAPI will update this document before it is relied upon for compliance purposes.

**Effective Date:** April 4, 2025
**Last Updated:** April 4, 2025

CronAPI ("we", "us", or "our") is committed to protecting your personal information. This Privacy Policy explains what data we collect, how we use it, and your rights regarding that data.

---

## 1. Data We Collect

### 1.1 Account Information
- **Email address** — used to create and authenticate your account, send transactional emails, and communicate service-related notices.

### 1.2 API Keys
- API keys you generate through the dashboard. We store a hashed version; the raw key is shown only once at creation.

### 1.3 Job Configuration
- Cron expressions, target URLs, HTTP method, headers (excluding sensitive values you mark as secret), request body, and schedule metadata you provide when creating or editing jobs.

### 1.4 Execution Logs
- Records of each scheduled job execution, including: timestamp, HTTP response code, response body excerpt, latency, and success/failure status. Logs are retained for **30 days** on the free plan and **90 days** on paid plans, then permanently deleted.

### 1.5 Usage Data
- Aggregated request counts and API usage metrics per API key, used for billing, rate limiting, and service improvement.

### 1.6 Technical Metadata
- IP addresses, browser/client user-agent strings, and session tokens collected automatically when you interact with the dashboard or API. Session data is stored in secure, HTTP-only cookies and expires after 30 days of inactivity.

---

## 2. How We Use Your Data

We use the data we collect to:
- Provide and operate the CronAPI service
- Authenticate you and protect your account
- Execute scheduled jobs on your behalf
- Send transactional and service emails (e.g., sign-up confirmation, billing receipts, downtime alerts)
- Enforce our Terms of Service and rate limits
- Improve reliability, performance, and security
- Comply with legal obligations

We do **not** sell your personal data to third parties. We do **not** use your data for advertising.

---

## 3. Third-Party Services

We share minimal data with the following sub-processors to operate the service:

| Service | Purpose | Data Shared |
|---|---|---|
| **Stripe** | Payment processing | Email, billing address, payment method |
| **Render** | Cloud infrastructure (hosting) | All service data resides on Render servers |
| **Sentry** | Error monitoring | Anonymized error traces, stack traces (no job content) |

Each sub-processor has its own privacy policy. We only share the minimum data necessary for each service to function.

---

## 4. Data Retention

| Data Type | Retention Period |
|---|---|
| Account information | Until account deletion |
| API keys (hashed) | Until you delete the key |
| Job configurations | Until you delete the job or account |
| Execution logs | 30 days (free) / 90 days (paid) |
| Usage metrics | 12 months (aggregated) |
| Billing records | 7 years (legal requirement) |

---

## 5. Your Rights

Depending on your jurisdiction, you may have the right to:

- **Access** the personal data we hold about you
- **Export** your data (job configs, execution logs) via the API
- **Correct** inaccurate information in your account
- **Delete** your account and associated data (except data required for legal compliance, such as billing records)
- **Object** to or **restrict** certain processing

To exercise any of these rights, contact us at: **privacy@cronapi.hakinsight.com**

We will respond within 30 days.

---

## 6. Security

We implement industry-standard security measures including:
- TLS encryption in transit for all API and dashboard traffic
- Hashed storage of API keys (SHA-256)
- HTTP-only, Secure, SameSite cookies for session tokens
- Access controls limiting employee access to production data

No system is completely secure. If you discover a security vulnerability, please disclose it responsibly to **security@cronapi.hakinsight.com**.

---

## 7. Children's Privacy

CronAPI is not directed at children under 16. We do not knowingly collect personal data from children. If you believe a child has provided us data, contact us and we will delete it.

---

## 8. Changes to This Policy

We may update this policy from time to time. We will notify you by email or a prominent notice on the dashboard at least 14 days before material changes take effect. Your continued use of CronAPI after the effective date constitutes acceptance of the updated policy.

---

## 9. Contact

For privacy questions or requests:

**CronAPI Privacy**
Email: privacy@cronapi.hakinsight.com
Website: https://cronapi.hakinsight.com

---

[Terms of Service](/legal/terms-of-service.md) · [Cookie Notice](/legal/cookie-notice.md) · [Home](/)
