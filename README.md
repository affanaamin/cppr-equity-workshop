# CPPR Equity Budgeting Workshop — Interactive Participant Portal

A modern, responsive, mobile/tablet/desktop web application serving exclusively the participant worksheets for the **CPPR Equity Budgeting Workshop**.

---

## 🌐 Live Access URLs

- **Participant Portal (GitHub Pages):**  
  👉 **[https://affanaamin.github.io/cppr-equity-workshop/](https://affanaamin.github.io/cppr-equity-workshop/)**

- **Facilitator Real-Time Desk:**  
  👉 **[https://affanaamin.github.io/cppr-equity-workshop/?sector=admin](https://affanaamin.github.io/cppr-equity-workshop/?sector=admin)**

---

## 🔑 Single-Line Login Codes

When opening the website, enter any of the following departmental codes into the single input line:

| Login Code | Department / Focus | Assigned Budget Files | Direct Sector Link |
| :--- | :--- | :--- | :--- |
| **`health`** | **Team 1: Health Sector** | 5 Official Budget PDFs | [Open Health Worksheet](https://affanaamin.github.io/cppr-equity-workshop/?sector=health) |
| **`local`** | **Team 2: Local Government & Rural Dev.** | 6 Official Budget PDFs | [Open Local Gov Worksheet](https://affanaamin.github.io/cppr-equity-workshop/?sector=local) |
| **`education`** | **Team 3: Education Sector** | 5 Official Budget PDFs | [Open Education Worksheet](https://affanaamin.github.io/cppr-equity-workshop/?sector=education) |
| **`finance`** | **Team 4: Finance & Planning** | 5 Official Budget PDFs | [Open Finance Worksheet](https://affanaamin.github.io/cppr-equity-workshop/?sector=finance) |
| **`admin`** | **Facilitator Live Monitoring Desk** | Cross-Team Comparative Grid | [Open Facilitator Desk](https://affanaamin.github.io/cppr-equity-workshop/?sector=admin) |

---

## 📋 Features

1. **100% Faithful to Workshop Framework:**
   - 14 Indicator Cards covering all budget lifecycle phases (Planning, Formulation, Execution, Monitoring, Outcomes).
   - Dual Citation: Printed Book Page and PDF Viewer Page.
   - 6 Equity Dimensions: Gender, Age, Ethnicity/Merged Areas, Religion, Physical Disability, Culture.
   - Status Assessment: **YES**, **PARTIAL**, **NO**.
   - Verbatim evidence and analytical rationale inputs.

2. **Budget PDFs Direct Downloads:**
   - All 21 official budget documents from the Departmental corpus are hosted directly for 1-click download on mobile or computer.
   - Google Drive search links for every document.

3. **Submissions Return Directly to Facilitator:**
   - **Real-Time Cloud Push:** Submissions are automatically published via cloud synchronization so the facilitator can track progress live.
   - **Client-Side Excel Export (`.xlsx`):** Instant generation and download of completed Excel workbooks in the browser.
   - **Client-Side Word Export (`.doc`):** Instant generation of formatted Word documents that open natively in MS Word.
   - **Direct Email:** Built-in button to email the complete submission directly to `affanaminbat@gmail.com`.
   - **Local Storage Cache:** Never lose progress even on page refresh or unstable Wi-Fi.

---

## 🚀 Running Locally (Optional)

If running locally on your computer:
```bash
python server.py
```
Open `http://localhost:8000`.
Submissions will automatically be saved to `submissions/` as JSON, Excel, and Word documents.

---

## ☁️ Deploying to Vercel (Optional)

This repository is pre-configured with `vercel.json` for 1-click deployment on [Vercel](https://vercel.com):
1. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
2. Import **`affanaamin/cppr-equity-workshop`**.
3. Click **"Deploy"**.
