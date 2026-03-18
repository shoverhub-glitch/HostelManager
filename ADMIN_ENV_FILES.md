# Admin Environment Files

This file explains the environment variables used by the separate admin portal and the backend admin security layer.

The admin system in this project has two parts:

1. `admin-ui/.env`
2. `api/.env`

The frontend file controls where the admin UI connects.
The backend file controls who is allowed to use admin endpoints and how those endpoints are protected.

## 1. Admin UI Environment File

Location:

- `admin-ui/.env`
- example: `admin-ui/.env.example`

Current variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Full backend API base URL used by the admin portal |
| `VITE_BASE_PATH` | Yes for GitHub Pages | Base path used by Vite when deploying under a repository subpath |
| `VITE_ADMIN_SECURITY_HEADER` | Optional | Header name used when the backend requires an extra admin security key |

### `VITE_API_BASE_URL`

Example:

```env
VITE_API_BASE_URL=https://your-api-domain.com/api/v1
```

Use the public API URL for your backend.

If your backend is hosted at `https://api.example.com`, then this should usually be:

```env
VITE_API_BASE_URL=https://api.example.com/api/v1
```

### `VITE_BASE_PATH`

Example:

```env
VITE_BASE_PATH=/HostelManager/
```

Use this when deploying the admin UI to GitHub Pages.

If the GitHub repository is `HostelManager`, the Pages build usually needs:

```env
VITE_BASE_PATH=/HostelManager/
```

If you deploy on a custom domain at the root, use:

```env
VITE_BASE_PATH=/
```

### `VITE_ADMIN_SECURITY_HEADER`

Example:

```env
VITE_ADMIN_SECURITY_HEADER=X-Admin-Secret
```

This is only the header name, not the secret value.

If the backend uses `ADMIN_REQUIRE_API_KEY=true`, the admin login screen can send a security key entered by the admin during sign-in. The frontend uses this variable to know which header name to send.

## Important frontend security note

All `VITE_*` variables are public after the app is built.

Do not put any secret value in `admin-ui/.env`.

That means you must never place these values in the admin UI env file:

- `ADMIN_API_KEY`
- database passwords
- JWT secrets
- private backend tokens

The admin UI may contain the header name, but not the secret key itself.

## 2. Backend Admin Environment File

Location:

- `api/.env`
- example: `api/.env.example`

These variables control admin access and hardening for `/api/v1/admin/*`, admin plans, and admin coupon endpoints.

### Admin access policy variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_ACCESS_ROLES` | Optional | Comma-separated roles allowed to access admin endpoints |
| `ADMIN_ACCESS_EMAILS` | Recommended | Comma-separated email allowlist for admin access |
| `ADMIN_ACCESS_USER_IDS` | Recommended | Comma-separated Mongo user IDs allowlisted for admin access |
| `ADMIN_ACCESS_FAIL_CLOSED` | Strongly recommended | Denies admin access if no selectors are configured |

### `ADMIN_ACCESS_ROLES`

Example:

```env
ADMIN_ACCESS_ROLES=superadmin,ops-admin
```

This allows any logged-in user whose stored `role` matches one of these values.

This is supported, but it is broader than email or user ID allowlisting.

Recommended production approach:

```env
ADMIN_ACCESS_ROLES=
```

### `ADMIN_ACCESS_EMAILS`

Example:

```env
ADMIN_ACCESS_EMAILS=admin@example.com,ops@example.com
```

This is the safest and easiest selector for most deployments.
Only those exact email addresses can access admin endpoints after normal login.

### `ADMIN_ACCESS_USER_IDS`

Example:

```env
ADMIN_ACCESS_USER_IDS=65f1d8a3b2c4d5e6f7a8b901,65f1d8a3b2c4d5e6f7a8b902
```

This is strict and stable even if email changes later.

### `ADMIN_ACCESS_FAIL_CLOSED`

Recommended value:

```env
ADMIN_ACCESS_FAIL_CLOSED=true
```

When this is `true`, admin access is denied if none of the admin selectors are configured.

Keep this enabled in production.

## 3. Backend Hardening Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_ALLOWED_IPS` | Optional | Restricts admin access to specific IPs or CIDR ranges |
| `TRUST_PROXY_HEADERS` | Optional | Allows backend to read forwarded IPs from proxy headers |
| `ADMIN_REQUIRE_API_KEY` | Optional | Requires a second secret in addition to login token |
| `ADMIN_API_KEY` | Required if API key protection is enabled | Secret value expected on admin requests |
| `ADMIN_API_KEY_HEADER` | Optional | Header name used to read the admin secret |

### `ADMIN_ALLOWED_IPS`

Example:

```env
ADMIN_ALLOWED_IPS=203.0.113.10,198.51.100.0/24
```

Use this if your admin access should only work from office IPs, VPN, or private networks.

### `TRUST_PROXY_HEADERS`

Example:

```env
TRUST_PROXY_HEADERS=true
```

Enable this only when your API is behind a trusted reverse proxy such as Nginx, Cloudflare, or a load balancer that correctly sets `X-Forwarded-For`.

If you enable this incorrectly, IP restrictions may become unreliable.

### `ADMIN_REQUIRE_API_KEY`

Example:

```env
ADMIN_REQUIRE_API_KEY=true
```

When enabled, admin requests need both:

1. a valid logged-in user token
2. a valid admin secret header

This is much safer than login-only protection.

### `ADMIN_API_KEY`

Example:

```env
ADMIN_API_KEY=replace_with_a_long_random_secret
```

This must exist only in `api/.env` or in your server secret manager.

Never store this in `admin-ui/.env` or GitHub Pages build variables.

### `ADMIN_API_KEY_HEADER`

Example:

```env
ADMIN_API_KEY_HEADER=X-Admin-Secret
```

This must match the header name configured in the admin UI.

## 4. CORS Requirement For GitHub Pages

The backend must allow the admin portal origin.

Set this in `api/.env`:

```env
ALLOWED_ORIGINS=https://yourusername.github.io
```

If you use a custom domain for the admin portal, include that domain instead.

If multiple origins are needed, separate them with commas.

Example:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://yourusername.github.io
```

## 5. Recommended Production Setup

For a GitHub Pages admin UI, a safer setup is:

```env
# admin-ui/.env
VITE_API_BASE_URL=https://api.example.com/api/v1
VITE_BASE_PATH=/HostelManager/
VITE_ADMIN_SECURITY_HEADER=X-Admin-Secret
```

```env
# api/.env
ADMIN_ACCESS_ROLES=
ADMIN_ACCESS_EMAILS=admin@example.com
ADMIN_ACCESS_USER_IDS=
ADMIN_ACCESS_FAIL_CLOSED=true
ADMIN_ALLOWED_IPS=
TRUST_PROXY_HEADERS=true
ADMIN_REQUIRE_API_KEY=true
ADMIN_API_KEY=replace_with_a_long_random_secret
ADMIN_API_KEY_HEADER=X-Admin-Secret
ALLOWED_ORIGINS=https://yourusername.github.io
```

This setup gives you:

- login token protection
- explicit admin allowlist by email
- fail-closed behavior
- optional second secret for admin endpoints
- CORS limited to your admin frontend origin

## 6. What Not To Do

Do not do these in production:

- put `ADMIN_API_KEY` in `admin-ui/.env`
- keep `ADMIN_ACCESS_FAIL_CLOSED=false`
- allow broad role access unless you really need it
- allow `ALLOWED_ORIGINS=*` for admin traffic
- expose backend secrets in GitHub Pages build settings

## 7. Admin User Creation

You can create an admin-capable account with the script:

```bash
python api/create_admin.py --name "Platform Admin" --email admin@example.com --grant-by email
```

By default, this script adds the user email to `ADMIN_ACCESS_EMAILS`, which is safer than depending on a generic admin role.

If you want to run the script without command-line arguments, you can place temporary bootstrap values in `api/.env`:

```env
ADMIN_BOOTSTRAP_NAME=Platform Admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=Str0ng!Passw0rd
ADMIN_BOOTSTRAP_PHONE=+919876543210
ADMIN_BOOTSTRAP_ROLE=propertyowner
ADMIN_BOOTSTRAP_GRANT_BY=email
```

Then run:

```bash
python api/create_admin.py
```

After the admin user is created, remove `ADMIN_BOOTSTRAP_PASSWORD` from `api/.env` instead of leaving it stored there.