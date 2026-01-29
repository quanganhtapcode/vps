# 🚀 Vercel Deployment Guide

To deploy this Next.js application on Vercel successfully, follow these exact steps.

## 1. Project Settings (CRITICAL)

When importing the repository `quanganhtapcode/vps` on Vercel:

1.  **Framework Preset**: Select **Next.js**.
2.  **Root Directory**: Click `Edit` and select `frontend-next`.
    *   *Why?* The Next.js application lives inside the `frontend-next` folder, not at the root.
3.  **Environment Variables**:
    *   `NEXT_PUBLIC_API_URL`: `https://api.quanganh.org`
    *   (Optional) Add any other env vars from `.env` if needed.

## 2. Build Settings (Default is usually fine)
*   **Build Command**: `next build` (or `npm run build`)
*   **Output Directory**: `.next` (or `out` if exporting, but we are using Node server so `.next` is standard).
*   **Install Command**: `npm install`

## 3. Common Errors & Fixes
*   **Error: "The specified Root Directory does not exist"**:
    *   You likely typed the name wrong. Ensure it is exactly `frontend-next`.
*   **Error: "package.json not found"**:
    *   You forgot to set the Root Directory to `frontend-next`. Vercel is looking in the root folder where only the Python config exists.
*   **Error: "Module not found" or build failure**:
    *   Ensure `npm install` runs successfully.
    *   Check if you are importing files from outside `frontend-next/`. Next.js doesn't like importing files above the project root.

## 4. API Connection
The frontend is configured to connect to your VPS Backend:
*   **Client-Side**: Connects to `/api` -> Rewrites to `https://api.quanganh.org/api`
*   **Server-Side**: Connects directly to `https://api.quanganh.org`

Check `frontend-next/src/lib/api.ts` if you need to debug connections.
