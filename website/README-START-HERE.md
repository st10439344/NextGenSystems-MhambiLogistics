# MHAMBI LOGISTICS — MODERNISED WEBSITE

## Contents
- `public/` — fully redesigned and responsive public site (11 pages).
- `portal/` — redesigned role-based workspaces for Administrator, Client, Dispatcher, Driver, Warehouse, Fleet, Finance and Procurement (all navigation pages).
- `assets/` — embedded, locally stored logistics imagery and original uploaded logo.
- `css/modern.css` — responsive design system.
- `js/api.js` — configurable API adapter for shared Android/backend login and public forms.
- `js/portal.js` — authenticated session handling and attempted backend data views.
- Original legacy demo files are intentionally excluded from this integration ZIP. Keep your original ZIP backup separately.

## RUN IT LOCALLY (WINDOWS)
1. Start your existing Node.js backend as before in its `backend` directory:
   `node --env-file=.env src/server.js`
2. Serve **this folder**, not the original `legacy-demo` directory, over HTTP. From the unzipped `Mhambi-Logistics-Modern` folder, with Python installed:
   `python -m http.server 5500`
   OR use VS Code Live Server to serve the folder.
3. Open `http://localhost:5500/public/index.html`.
4. Open Login → **Server settings** and set `http://localhost:3000/api/v1/` (for a browser on the same Windows PC). BlueStacks uses `10.0.2.2`, but your Windows browser normally uses `localhost`.
5. Test your existing Android/Neon account with website login.

## AUTHENTICATION INTEGRATION — VERIFIED AGAINST PROVIDED BACKEND SOURCE
Reviewed non-secret source files only: `backend/src/routes/auth.js`, `backend/src/routes/index.js`, `backend/src/services/sessions.js`, `backend/src/services/users.js`, and `android/.../AuthRepository.kt`. No database configuration, migrations, seeds, or secrets were included in this output.

- `POST /api/v1/auth/login` accepts `{email,password}` and returns `{accessToken,refreshToken,user}`. The `user.role` value is supplied by the backend. The website redirects using this server-provided role.
- `POST /api/v1/auth/register` accepts `{fullName,email,phone,companyName,password,confirmPassword}` and creates client accounts. The website form now includes phone.
- `POST /api/v1/auth/logout` accepts `{refreshToken}`; website logout makes a best-effort call.
- `GET /api/v1/auth/me` exists and requires a bearer token.
- Public tracking uses `GET /api/v1/track/:ref`.
- Quotations use `/api/v1/quotations` (the backend may require authentication and a particular request body; quote form not end-to-end tested).
- The backend has no general public `POST /contact` endpoint. Contact form requires a deliberate backend feature or external service before it can submit.
- The current website is a development integration, not a production-verified secure portal. Dashboard data views still need API/role verification, session expiry/refresh handling, and proper workflow implementation.
- No live login was performed, and no Neon credentials or database information were read or stored.

### Serve website from existing Express backend (recommended local test)
Copy the *contents* of this folder into the existing project's `website` directory only after backing up the original; the backend's `src/app.js` serves its sibling `website` folder. Then open `http://localhost:3000/public/login.html` while the backend is running. This serves web pages and API from the same origin, avoiding browser CORS issues. **Do not replace your backend files with this package.**

### Security notes
Do not use `file://` for sign-in testing. Keep `.env`, Neon credentials and JWT secrets strictly in the backend. All role authorization is enforced on the server; front-end navigation guards alone are insufficient. The current prototype uses sessionStorage for access tokens; move to a hardened session strategy (e.g. secure, HttpOnly cookies with CSRF mitigations) before deploying publicly.

## RECOMMENDATIONS FOR PRODUCTION
- Verify all endpoint contracts and replace provisional dashboard views with proper workflows and validated API writes.
- Test all eight roles against backend-enforced authorisation; do not use the `legacy-demo` login logic as authentication.
- Confirm frontend form fields and endpoint permissions with your actual backend.
- Review backend npm security audit warnings; do not run breaking upgrades blindly.
- Replace or approve the new generated illustrative logistics imagery with licensed company photos if required.
- Check factual marketing claims against actual services before launch. The new site deliberately avoids invented fleet sizes, clients and testimonials.
- Host the API over HTTPS and configure the web deployment to use the public API hostname rather than localhost.

## PAGE INDEX
- `public/index.html` homepage
- `public/about.html`, `services.html`, `fleet.html`, `industries.html`, `careers.html`
- `public/track.html`, `quote.html`, `contact.html`
- `public/login.html`, `register.html`
- `portal/<role>/index.html` and linked role screens

The original user-uploaded website is retained under `legacy-demo` to ensure its JS-rich dashboards are not lost while you finish integration.
