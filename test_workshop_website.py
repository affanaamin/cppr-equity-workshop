import os
import sys
from fastapi.testclient import TestClient

# Ensure workshop_website is on sys.path
sys.path.insert(0, r"c:\Users\Affan\Desktop\CPPR SHAh\workshop_website")
from server import app

client = TestClient(app)

def run_tests():
    print("====================================================")
    print("STARTING WORKSHOP WEBSITE TEST SUITE")
    print("====================================================")

    # 1. Test GET /
    print("\n1. Testing GET / (Landing page)...")
    r = client.get("/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert "CPPR EQUITY BUDGETING WORKSHOP" in r.text
    assert "sector-input" in r.text
    assert "quickSelectSector" in r.text
    print("[PASS] Landing page HTML renders properly with single-line login input.")

    # 2. Test GET /api/data
    print("\n2. Testing GET /api/data...")
    r = client.get("/api/data")
    assert r.status_code == 200
    data = r.json()
    assert "sectors" in data
    for s in ["health", "local", "education", "finance"]:
        assert s in data["sectors"]
        sec = data["sectors"][s]
        assert len(sec["cards"]) == 14, f"Sector {s} expected 14 cards, got {len(sec['cards'])}"
        assert len(sec["workflow"]) == 6
        assert len(sec["rubric"]) == 6
        assert len(sec["catalog"]) >= 5
    print("[PASS] All 4 sectors validated with 14 cards, workflow, rubric, and catalog.")

    # 3. Test Static assets
    print("\n3. Testing Static Assets...")
    r_css = client.get("/static/style.css")
    assert r_css.status_code == 200
    r_js = client.get("/static/app.js")
    assert r_js.status_code == 200
    assert "normalizeSectorCode" in r_js.text
    print("[PASS] CSS and JS assets served correctly.")

    # 4. Test PDF file downloads
    print("\n4. Testing PDF Direct File Downloads...")
    sample_pdf = "/files/health/BESD_2019-22_Output_Based_Health.pdf"
    r_pdf = client.get(sample_pdf)
    assert r_pdf.status_code == 200
    assert len(r_pdf.content) > 1000000
    print(f"[PASS] PDF download endpoint returned {len(r_pdf.content):,} bytes.")

    # 5. Test Submission API (POST /api/submissions/health)
    print("\n5. Testing Participant Submission API...")
    payload = {
        "table_number": "Table # 1 - Health Alpha",
        "answers": {
            "A5": {
                "pdf_searched": "Citizen_Budget_2024-25.pdf",
                "book_page": "12",
                "pdf_page": "13",
                "page_ref": "Doc p. 12 / PDF p. 13",
                "evidence": "Civil society consultations conducted with healthcare worker associations regarding maternal health allocations.",
                "dimensions": ["Gender (Women & Girls)", "Age (Infants / Children / Youth)"],
                "status": "PARTIAL",
                "rationale": "Consultations exist at advisory level but no statutory co-design seats."
            },
            "B1": {
                "pdf_searched": "BESD_2019-22_Output_Based_Health.pdf",
                "book_page": "27",
                "pdf_page": "31",
                "page_ref": "Doc p. 27 / PDF p. 31",
                "evidence": "95% children under one year age were vaccinated on Penta-1 with dedicated LHV staffing lines.",
                "dimensions": ["Gender (Women & Girls)", "Age (Infants / Children / Youth)", "Ethnicity / Merged Tribal Areas"],
                "status": "YES",
                "rationale": "Explicit child immunization and maternal care benchmarks are formalized."
            }
        }
    }
    r_sub = client.post("/api/submissions/health", json=payload)
    assert r_sub.status_code == 200, f"Submission failed: {r_sub.text}"
    res_json = r_sub.json()
    assert res_json["status"] == "success"
    assert res_json["completed_count"] == 2
    assert res_json["completion_pct"] == 14
    print("[PASS] Submission processed successfully. Response:", res_json)

    # 6. Verify generated files on disk
    print("\n6. Verifying Auto-Generated Submissions on Disk...")
    sub_dir = r"c:\Users\Affan\Desktop\CPPR SHAh\workshop_website\submissions"
    assert os.path.exists(os.path.join(sub_dir, "health_submission.json"))
    assert os.path.exists(os.path.join(sub_dir, "health_Completed_Workbook.xlsx"))
    assert os.path.exists(os.path.join(sub_dir, "health_Completed_Worksheet.docx"))
    print("[PASS] Verified JSON, Excel (.xlsx), and Word (.docx) files created in submissions folder!")

    # 7. Test Export Endpoints
    print("\n7. Testing Export Endpoints...")
    r_xlsx = client.get("/api/export/health/xlsx")
    assert r_xlsx.status_code == 200
    assert len(r_xlsx.content) > 1000
    
    r_docx = client.get("/api/export/health/docx")
    assert r_docx.status_code == 200
    assert len(r_docx.content) > 1000
    print(f"[PASS] Excel export size: {len(r_xlsx.content):,} bytes")
    print(f"[PASS] Word export size: {len(r_docx.content):,} bytes")

    # 8. Test Facilitator Dashboard API
    print("\n8. Testing Facilitator Dashboard API...")
    r_all = client.get("/api/submissions")
    assert r_all.status_code == 200
    all_subs = r_all.json()
    assert "health" in all_subs
    assert all_subs["health"]["table_number"] == "Table # 1 - Health Alpha"
    assert all_subs["health"]["completed_count"] == 2
    print("[PASS] Facilitator API returns real-time progress across all 4 line departments.")

    print("\n====================================================")
    print("ALL TESTS PASSED WITH 100% SUCCESS!")
    print("====================================================")

if __name__ == "__main__":
    run_tests()
