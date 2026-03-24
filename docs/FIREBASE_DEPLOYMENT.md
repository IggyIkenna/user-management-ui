# Firebase deployment — user-management-ui

This repo uses **two Firebase surfaces** on the same GCP/Firebase project:

| Surface | Role | What gets deployed |
|--------|------|----------------------|
| **Firebase App Hosting** | **Application backend (runtime)** | The **Next.js** app (`next build` / `next start`). Handles SSR, routing, and **rewrites** of `/api/*` and `/health` to the HTTP API (see `next.config.mjs`). |
| **Firebase Hosting** | **Static frontend assets** | Contents of **`public/`** (favicon, robots, static files). Does **not** replace the Next.js UI; it is an additional static site or the default Hosting site used for static files. |

The **Express** server in **`server/index.js`** is the **user-management API** (Firestore, Auth, workflows, `/api/v1/*`). It is **not** executed inside the Next.js App Hosting container unless you merge it into a single Node process. In production, that API is expected to run as **Cloud Run** (or another HTTPS URL). **App Hosting** sets `USER_MGMT_API_URL` (see `apphosting.yaml`) so Next.js rewrites point at that API.

## End-to-end flow

1. **Build the Next.js app** — App Hosting runs `npm ci` and `npm run build` (see Firebase App Hosting build settings in console).
2. **Deploy App Hosting** — Serves the Next.js server (UI + proxy rewrites to the API base URL).
3. **Deploy the Express API** — `gcloud run deploy` (or your pipeline) for `server/index.js`; update `USER_MGMT_API_URL` in `apphosting.yaml` to that service URL.
4. **Deploy Firebase Hosting** — Pushes **`public/`** to the configured Hosting site for static assets.

## Configuration files

| File | Purpose |
|------|---------|
| `firebase.json` | Declares the **App Hosting** backend id and **Hosting** `public` folder. |
| `apphosting.yaml` | **Runtime** env and secrets for the App Hosting backend (memory, `USER_MGMT_API_URL`, `FIREBASE_API_KEY`, GitHub PAT secret, etc.). |
| `next.config.mjs` | Rewrites `/api/:path*` → `USER_MGMT_API_URL` (Express API). |
| `.firebaserc` | Firebase project id (`default`). |

## Commands (local / CI)

Prerequisites: Firebase CLI (`firebase-tools`), Blaze plan for App Hosting, `gcloud` if you deploy Cloud Run yourself.

```bash
# Static assets only (public/)
npm run deploy:firebase:hosting

# Next.js app on Firebase App Hosting
npm run deploy:firebase:apphosting
```

Deploy both when you change static files and the Next app:

```bash
npm run deploy:firebase:hosting && npm run deploy:firebase:apphosting
```

Exact Hosting **site** id is in `firebase.json` → `hosting.site`. Create extra sites in Firebase Console if you need a dedicated static domain separate from the App Hosting URL.

## Secrets

- **App Hosting**: map secrets in Firebase Console (App Hosting → backend → environment) to match `apphosting.yaml` (`FIREBASE_API_KEY`, `github-automation-token`, etc.).
- **Express on Cloud Run**: use Secret Manager or Cloud Run env as required by `server/secret-manager.js`.

## Not covered here

- **Cloud Build** image deploys (`cloudbuild.yaml`) are an alternate path; this document is the Firebase Hosting + App Hosting split.
- **Custom domains**: attach in Firebase Console for both App Hosting and Hosting sites.
