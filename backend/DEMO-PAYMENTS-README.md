# Mhambi Logistics — Demo Payments (NextGen Systems)

This is a **test-only simulated payment workflow**. No real money moves; there is no gateway or card collection.

## Run
1. Use the included updated backend code (not an old backend version). **Back up your existing project first.**
2. Keep your existing private `.env` file on your own machine; never copy it into the ZIP. Add `DEMO_PAYMENTS_ENABLED=true` locally, with `NODE_ENV=development`. Do not turn on in production.
3. From the backend folder: `npm ci` then `node --env-file=.env src/server.js`.
4. Run the updated Android app from the supplied `android` folder (Gradle sync and Run).
5. Serve the website through a local server; if opened from another origin set API base on the login page to `http://localhost:3000/api/v1/`. BlueStacks generally uses `http://10.0.2.2:3000/api/v1/`.
6. Sign in with existing **test** accounts. A client requests a quotation; authorised staff price it; client accepts; then select **Demo payments** in the client website portal or **Simulate full payment (DEMO)** in Android's client quotations.
7. In Finance/Admin, open **Demo payments** to see the shared simulated transaction. The Android Finance/Admin navigation has a corresponding **Demo Payments (Test Only)** table.

## Financial safety — read carefully
- **Never** interpret these records as paid invoices, receipts or revenue. The backend does not write to `invoices`, `payments`, `receipts`, `shipments` or any database table.
- Demo records are held only in Node.js process memory and are lost when the server restarts. Web and Android connected to the same running backend see the same temporary records.
- This does **not** prevent real dispatch, change real invoice statuses or verify money received. Payment-before-dispatch enforcement needs a separate production-ready design and payment gateway.
- Amounts are based on the accepted quotation price **excluding VAT**, with the project's default 15% VAT applied for demo display. Confirm VAT rules for real invoices.
- Existing backend finance endpoints for recording **actual** received payments are intentionally untouched.

## Demo sequence
Register test Client → Request quotation → Admin/Dispatcher price quotation → Client accepts → Client simulates full payment → Finance/Admin sees TEST ONLY record → discuss future dispatch rule and tracking.

## Other notes
Keep this on a local development environment. No `.env`, private credentials, seed data or migration SQL files are included in the updated archive. Do not overwrite a production server with this sample.
