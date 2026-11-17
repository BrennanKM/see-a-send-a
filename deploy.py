#!/usr/bin/env python3
"""Upload public/ to Cloudflare Pages (direct upload, no wrangler/node needed).

Usage:  python3 deploy.py
Reads the API token from .cloudflare-token and the account ID from
.cloudflare-account (both gitignored). The token needs
Account → Cloudflare Pages → Edit. The account ID is in the dashboard URL.
"""
import base64, hashlib, json, mimetypes, os, ssl, sys, urllib.request, uuid

PROJECT = "see-a-send-a"
ROOT = os.path.dirname(os.path.abspath(__file__))
ACCOUNT_FILE = os.path.join(ROOT, ".cloudflare-account")
ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID") or (open(ACCOUNT_FILE).read().strip() if os.path.exists(ACCOUNT_FILE) else "")
if not ACCOUNT_ID:
    sys.exit("Put the Cloudflare account ID in .cloudflare-account (or set CF_ACCOUNT_ID).")
PUBLIC = os.path.join(ROOT, "public")
API = "https://api.cloudflare.com/client/v4"
# python.org builds ship without CA certs; use the macOS system bundle when present.
SSL_CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")


def call(method, url, token, body=None, headers=None, raw=None):
    h = {"Authorization": f"Bearer {token}", **(headers or {})}
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}") | {"_status": e.code}


def main():
    token = open(os.path.join(ROOT, ".cloudflare-token")).read().strip()
    if not token or any(c.isspace() for c in token) or "=" in token:
        sys.exit(".cloudflare-token should contain only the Cloudflare API token (one line, nothing else).")
    acct = f"{API}/accounts/{ACCOUNT_ID}/pages/projects"

    if not call("GET", f"{acct}/{PROJECT}", token).get("success"):
        r = call("POST", acct, token, {"name": PROJECT, "production_branch": "main"})
        if not r.get("success"):
            sys.exit(f"Couldn't create project: {r.get('errors')}")
        print("Created Pages project", PROJECT)

    files = {}
    for d, _, names in os.walk(PUBLIC):
        for n in names:
            if n.startswith("."):
                continue
            p = os.path.join(d, n)
            rel = "/" + os.path.relpath(p, PUBLIC).replace(os.sep, "/")
            content = open(p, "rb").read()
            b64 = base64.b64encode(content).decode()
            ext = os.path.splitext(n)[1].lstrip(".")
            h = hashlib.sha256((b64 + ext).encode()).hexdigest()[:32]
            files[rel] = {"hash": h, "b64": b64, "type": mimetypes.guess_type(n)[0] or "application/octet-stream"}

    jwt = call("GET", f"{acct}/{PROJECT}/upload-token", token)["result"]["jwt"]
    hashes = [f["hash"] for f in files.values()]
    missing = set(call("POST", f"{API}/pages/assets/check-missing", jwt, {"hashes": hashes})["result"])
    payload = [{"key": f["hash"], "value": f["b64"], "metadata": {"contentType": f["type"]}, "base64": True}
               for f in files.values() if f["hash"] in missing]
    if payload:
        r = call("POST", f"{API}/pages/assets/upload", jwt, payload)
        if not r.get("success"):
            sys.exit(f"Upload failed: {r}")
    call("POST", f"{API}/pages/assets/upsert-hashes", jwt, {"hashes": hashes})
    print(f"Uploaded {len(payload)} new / {len(files)} files")

    boundary = uuid.uuid4().hex
    manifest = json.dumps({k: v["hash"] for k, v in files.items()})
    form = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"manifest\"\r\n\r\n{manifest}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"branch\"\r\n\r\nmain\r\n--{boundary}--\r\n").encode()
    r = call("POST", f"{acct}/{PROJECT}/deployments", token, raw=form,
             headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    if not r.get("success"):
        sys.exit(f"Deployment failed: {r.get('errors')}")
    print("Deployed:", r["result"]["url"])
    print("Live at:  https://" + PROJECT + ".pages.dev")


if __name__ == "__main__":
    main()
