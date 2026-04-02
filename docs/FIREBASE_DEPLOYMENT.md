# Firebase deployment — user-management-ui

This repo uses **two Firebase surfaces** on the same GCP/Firebase project (`central-element-323112`). They use **dedicated resource names** so they do not collide with other apps (for example `unified-trading-system-ui`) on the default Hosting site.

| Surface                  | Id in Firebase                     | Role            | What gets deployed                                                                                                                         |
| ------------------------ | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Firebase App Hosting** | Backend **`odum-user-mgmt-admin`** | Next.js runtime | The **Next.js** app (`next build` / `next start`). SSR, routing, **rewrites** of `/api/*` and `/health` → Express API (`next.config.mjs`). |
| **Firebase Hosting**     | Site **`odum-user-management`**    | Static assets   | Contents of **`public/`** (favicon, robots, etc.). Separate from the project default site and from other products’ Hosting deploys.        |

### One-time Firebase Console setup

Before the first deploy with this layout:

1. **Hosting → Add another site** → create site id **`odum-user-management`** (or run `firebase hosting:sites:create odum-user-management --project central-element-323112`).
2. **App Hosting** → add a backend with id **`odum-user-mgmt-admin`** linked to this repo, **or** run `npm run deploy:firebase:apphosting` and complete any console prompts so the backend id matches `firebase.json`.

The legacy backend **`user-management-ui`** and default site **`central-element-323112`** can be retired in the console once traffic moves to the new URLs.

The **Express** server in **`server/index.js`** is the **user-management API** (Firestore, Auth, workflows, `/api/v1/*`). It is **not** executed inside the Next.js App Hosting container unless you merge it into a single Node process. In production, that API is expected to run as **Cloud Run** (or another HTTPS URL). **App Hosting** sets `USER_MGMT_API_URL` (see `apphosting.yaml`) so Next.js rewrites point at that API.

## End-to-end flow

1. **Build the Next.js app** — App Hosting runs `npm ci` and `npm run build` (see Firebase App Hosting build settings in console).
2. **Deploy App Hosting** — Serves the Next.js server (UI + proxy rewrites to the API base URL).
3. **Deploy the Express API** — `gcloud run deploy` (or your pipeline) for `server/index.js`; update `USER_MGMT_API_URL` in `apphosting.yaml` to that service URL.
4. **Deploy Firebase Hosting** — Pushes **`public/`** to the configured Hosting site for static assets.

## Configuration files

| File              | Purpose                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `firebase.json`   | Declares the **App Hosting** backend id and **Hosting** `public` folder.                                                            |
| `apphosting.yaml` | **Runtime** env and secrets for the App Hosting backend (memory, `USER_MGMT_API_URL`, `FIREBASE_API_KEY`, GitHub PAT secret, etc.). |
| `next.config.mjs` | Rewrites `/api/:path*` → `USER_MGMT_API_URL` (Express API).                                                                         |
| `.firebaserc`     | Firebase project id (`default`).                                                                                                    |

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

Hosting **site** id is **`odum-user-management`** (`firebase.json` → `hosting.site`). After `npm run deploy:firebase:hosting`, **https://odum-user-management.web.app** serves `public/` (a small static bundle; `index.html` redirects to App Hosting).

**Full admin UI (Next.js):** **https://odum-user-mgmt-admin--central-element-323112.us-central1.hosted.app** — deploy with `npm run deploy:firebase:apphosting`. If the CLI says the backend does not exist, create it once (non-interactive):

`npx firebase-tools apphosting:backends:create -P central-element-323112 --backend odum-user-mgmt-admin --primary-region us-central1 --root-dir . --non-interactive`

## Secrets

- **App Hosting**: map secrets in Firebase Console (App Hosting → backend **`odum-user-mgmt-admin`** → environment) to match `apphosting.yaml` (`FIREBASE_API_KEY`, `github-automation-token`, etc.). If you previously used backend **`user-management-ui`**, copy the same variables/secrets onto the new backend.
- **Express on Cloud Run**: use Secret Manager or Cloud Run env as required by `server/secret-manager.js`.

## Not covered here

- **Cloud Build** image deploys (`cloudbuild.yaml`) are an alternate path; this document is the Firebase Hosting + App Hosting split.
- **Custom domains**: attach in Firebase Console for both App Hosting and Hosting sites.
