# Webhook Signature Verification

Verify that incoming requests to your endpoint actually came from CronAPI, not a third party.

---

## How Signatures Work

Every outgoing webhook from CronAPI includes an `X-CronAPI-Signature` header:

```
X-CronAPI-Signature: sha256=<hex_digest>
```

The digest is computed as HMAC-SHA256 over the **raw request body** using the job's `signingSecret`. For requests with no body (e.g. `GET`), the digest is computed over an empty string.

Your endpoint should:
1. Read the raw request body **before** any JSON parsing
2. Compute the expected HMAC-SHA256 digest
3. Compare it with the incoming header using a **timing-safe** comparison
4. Reject requests where signatures do not match

---

## Finding Your Signing Secret

The `signingSecret` is returned in the job object when you create or fetch a job:

```bash
curl https://api.cronapi.dev/api/v1/jobs/job_uuid \
  -H "Authorization: Bearer $CRONAPI_KEY"
```

```json
{
  "job": {
    "id": "job_uuid",
    "signingSecret": "a3f8c2...",
    ...
  }
}
```

Store it as an environment variable in your application. **Never commit it to source control.**

---

## Verification Examples

### Node.js

```javascript
const crypto = require('crypto');

/**
 * @param {string} signingSecret - the job's signingSecret
 * @param {Buffer|string} rawBody - unparsed request body
 * @param {string} signatureHeader - value of X-CronAPI-Signature
 * @returns {boolean}
 */
function verifySignature(signingSecret, rawBody, signatureHeader) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', signingSecret)
    .update(rawBody)
    .digest('hex');

  // Buffers must be the same length for timingSafeEqual
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
```

**Express middleware example**

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();

// Use express.raw() to get the unparsed body on this route
app.post(
  '/webhooks/cronapi',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const secret = process.env.CRONAPI_SIGNING_SECRET;
    const signature = req.headers['x-cronapi-signature'] ?? '';

    if (!verifySignature(secret, req.body, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body.toString());
    // handle payload...
    res.json({ ok: true });
  }
);
```

---

### Python

```python
import hmac
import hashlib

def verify_signature(signing_secret: str, raw_body: bytes, signature_header: str) -> bool:
    """
    signing_secret: the job's signingSecret
    raw_body: the undecoded request body as bytes
    signature_header: value of X-CronAPI-Signature header
    """
    expected = 'sha256=' + hmac.new(
        signing_secret.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

**Flask example**

```python
from flask import Flask, request, jsonify, abort
import os

app = Flask(__name__)

@app.route('/webhooks/cronapi', methods=['POST'])
def cronapi_webhook():
    secret = os.environ['CRONAPI_SIGNING_SECRET']
    signature = request.headers.get('X-CronAPI-Signature', '')
    raw_body = request.get_data()  # must call before request.json

    if not verify_signature(secret, raw_body, signature):
        abort(401)

    payload = request.get_json()
    # handle payload...
    return jsonify({'ok': True})
```

**FastAPI example**

```python
from fastapi import FastAPI, Request, HTTPException
import os

app = FastAPI()

@app.post('/webhooks/cronapi')
async def cronapi_webhook(request: Request):
    secret = os.environ['CRONAPI_SIGNING_SECRET']
    signature = request.headers.get('x-cronapi-signature', '')
    raw_body = await request.body()  # read before any parsing

    if not verify_signature(secret, raw_body, signature):
        raise HTTPException(status_code=401, detail='Invalid signature')

    payload = await request.json()
    # handle payload...
    return {'ok': True}
```

---

### Go

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "io"
    "net/http"
    "os"
)

func verifySignature(signingSecret string, rawBody []byte, signatureHeader string) bool {
    mac := hmac.New(sha256.New, []byte(signingSecret))
    mac.Write(rawBody)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(signatureHeader), []byte(expected))
}

func cronapiWebhookHandler(w http.ResponseWriter, r *http.Request) {
    secret := os.Getenv("CRONAPI_SIGNING_SECRET")
    signature := r.Header.Get("X-CronAPI-Signature")

    rawBody, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "Failed to read body", http.StatusInternalServerError)
        return
    }

    if !verifySignature(secret, rawBody, signature) {
        http.Error(w, "Invalid signature", http.StatusUnauthorized)
        return
    }

    // handle payload...
    w.Header().Set("Content-Type", "application/json")
    fmt.Fprintln(w, `{"ok": true}`)
}

func main() {
    http.HandleFunc("/webhooks/cronapi", cronapiWebhookHandler)
    http.ListenAndServe(":8080", nil)
}
```

---

## Important Notes

- **Read the raw body first.** Most frameworks parse the body automatically, which discards the raw bytes needed for verification. Configure your framework to provide the raw body on the webhook route (see examples above).
- **Always use timing-safe comparison.** Standard string equality (`===`, `==`) leaks information through timing. Use `crypto.timingSafeEqual` (Node.js), `hmac.compare_digest` (Python), or `hmac.Equal` (Go).
- **The secret is per-job.** If you have multiple CronAPI jobs calling the same endpoint, either use the same secret for all of them or route each job to its own endpoint path.
- **Rotating secrets.** There is no in-place secret rotation. To change a job's secret, delete and recreate the job, then update your environment variable.

---

## Related Guides

- [Quick Start](./quickstart.md)
- [Next.js Integration](./nextjs-integration.md)
