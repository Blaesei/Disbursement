# STLAF Disbursement Portal — Payment Request Form (PRF) System

A secure, enterprise-grade disbursement voucher management system built for STLAF. It tracks payment request workflows through a structured state-machine: **Draft ➔ Pending Approval ➔ Approved ➔ Received ➔ Completed (or Rejected)**, syncing states, signature images, PDF vouchers, and master ledgers in real-time.

---

## ══════════════════════════════════════════════════════
## ⚡ CORE ARCHITECTURAL SECURITY PRINCIPLES
## ══════════════════════════════════════════════════════

1. **OAuth2 Credentials Rotation (No Service Accounts keys uploads):** To prevent authority bypasses, all Google API integrations use an OAuth2 client configured with a Client ID, Secret, and Refresh Token to request temporary access tokens globally on the server.
2. **Strict Server-Side Isolation:** Absolutely no Google APIs are invoked from the user's browser client.
3. **Serial Writing Safe Queue:** Failsafe async FIFO serial execution wraps all Google Sheets and Drive spreadsheet operations to avoid concurrency overlaps.

---

## 🛠️ ENVIRONMENT INTEGRATIONS SETUP STEPS

### 1. Drive Upload Folder
- Create a dedicated folder inside your Google Drive.
- Grab the ID from the URL (e.g., `https://drive.google.com/drive/folders/YOUR_FOLDER_ID`).
- Store this as `GOOGLE_DRIVE_FOLDER_ID`.

### 2. Google Sheets Vouchers Template Setup
1. Create a fresh Google Spreadsheet to act as your PRF Master Template.
2. Ensure the sheet name is **`Sheet1`**.
3. Clear cells and style your voucher with STLAF Navy borders and structures. Set the following ranges for automatic overwrite cell-fittings:
   - **`Sheet1!B2`**: PRF Identifier Number
   - **`Sheet1!B3`**: Requestor Department Unit
   - **`Sheet1!B4`**: Client / Entity Name
   - **`Sheet1!B5`**: Bank & Transfer Account
   - **`Sheet1!B6`**: Date of request
   - **`Sheet1!B7`**: Billable status checkbox (configured as a native Google Sheets TRUE/FALSE checkbox)
   - **`Sheet1!C20`**: Requestor full name
   - **`Sheet1!C21`**: Requestor `=IMAGE("direct_drive_url")`
   - **`Sheet1!C22`**: Requestor signed date
   - **`Sheet1!D20`**: Approver full name
   - **`Sheet1!D21`**: Approver `=IMAGE("direct_drive_url")`
   - **`Sheet1!D22`**: Approver signed date
   - **`Sheet1!E20`**: Receiver full name
   - **`Sheet1!E21`**: Receiver `=IMAGE("direct_drive_url")`
   - **`Sheet1!E22`**: Receiver signed date
   - **`Sheet1!A10:CXX`**: Transaction particulars lines (filled dynamically on submit).
4. Capture its Spreadsheet ID from the URL and save to `GOOGLE_SHEETS_PRF_TEMPLATE_ID`.

### 3. Master Ledger Spreadsheet Configuration
1. Create a separate, second empty Google Spreadsheet in Drive.
2. Label the columns on row 1 of `Sheet1` in this specific sequence (Columns A to S):
   `PRF No | Department | Client | Bank | Billable | Status | Total Amount | Date | Requestor | Sig1 URL | Date1 | Approver | Sig2 URL | Date2 | Receiver | Sig3 URL | Date3 | Line Items JSON | Sheet URL`
3. Capture this Ledger Sheet ID and configure as `GOOGLE_SHEETS_LEDGER_ID`.

---

## ⚙️ ENVIRONMENTAL DESIGN KEYS CHECKLIST
Rename your local `.env` and fill the variables:
```env
# OAuth Credentials
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxx"
GOOGLE_REFRESH_TOKEN="1//xxx"

# Folder / Template IDs
GOOGLE_DRIVE_FOLDER_ID="xxx"
GOOGLE_SHEETS_PRF_TEMPLATE_ID="xxx"
GOOGLE_SHEETS_LEDGER_ID="xxx"
```

---

## 🧑‍💻 WORKFLOW ROLES TESTING PROTOCOLS
This portal includes an **Integrity Testing & Preview Role Swapper** card on the dashboard allowing real-time impersonations during testing:
- **`Requestor`**: Submits drawings particulars, saves drafts, applies signature drawings, routes requests to Pending.
- **`Approver`**: Re-examines pending requests. Applies drawn signature approvals, comments rejections.
- **`Receiver`**: Marks disbursement requests as active-received.
- **`Administrator`**: Controls user profiles promotions, views system-wide audit ledgers, and monitors environment connection states.
