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

    # 9. Test Participant Workflow Markup & Client Scripts
    print("\n9. Testing Participant Workflow Markup & Scripts...")
    r_landing = client.get("/")
    assert "participant-card" in r_landing.text
    assert "participant-sectors-container" in r_landing.text
    assert "recent-participants-box" in r_landing.text
    r_js = client.get("/static/app.js")
    assert "showParticipantPicker" in r_js.text
    assert "getParticipantProgress" in r_js.text
    assert "selectParticipantSector" in r_js.text
    assert "viewParticipantWorksheet" in r_js.text
    print("[PASS] Participant department picker UI and JS methods verified.")

    # 10. Test Individual Participant Submission & Isolation
    print("\n10. Testing Individual Participant Submissions...")
    tariq_payload = {
        "participant_name": "Dr. Tariq",
        "table_number": "Table 3 - Education Team",
        "answers": {
            "A5": {
                "pdf_searched": "Citizen_Budget_2024-25.pdf",
                "book_page": "14",
                "pdf_page": "15",
                "page_ref": "Doc p. 14 / PDF p. 15",
                "evidence": "Civil society consultations with teachers and disability rights groups.",
                "dimensions": ["Gender (Women & Girls)", "Disability (Special Needs)"],
                "status": "YES",
                "rationale": "Special education teacher consultations were documented."
            }
        }
    }
    r_tariq = client.post("/api/submissions/education", json=tariq_payload)
    assert r_tariq.status_code == 200
    tariq_res = r_tariq.json()
    assert tariq_res["participant_name"] == "Dr. Tariq"
    assert tariq_res["completed_count"] == 1

    # 11. Test Multi-Participant Coexistence in Facilitator Desk
    print("\n11. Testing Multi-Participant Coexistence in Same Department...")
    ayesha_payload = {
        "participant_name": "Ayesha Siddiqa",
        "table_number": "Table 3 - Education Team",
        "answers": {
            "A5": {
                "pdf_searched": "Citizen_Budget_2024-25.pdf",
                "book_page": "14",
                "pdf_page": "15",
                "evidence": "Separate Girls stipend budget lines confirmed.",
                "dimensions": ["Gender (Women & Girls)"],
                "status": "YES",
                "rationale": "Gender equity allocation benchmarked."
            },
            "B1": {
                "pdf_searched": "Output_Based_Budget_Education.pdf",
                "book_page": "45",
                "pdf_page": "48",
                "evidence": "Enrollment KPI targets set for rural schools.",
                "dimensions": ["Ethnicity / Merged Tribal Areas"],
                "status": "YES",
                "rationale": "KPI targets formalized."
            }
        }
    }
    r_ayesha = client.post("/api/submissions/education", json=ayesha_payload)
    assert r_ayesha.status_code == 200

    # Verify both participants exist in education submissions
    r_edu_all = client.get("/api/submissions")
    assert r_edu_all.status_code == 200
    all_data = r_edu_all.json()
    edu_parts = all_data["education"]["participants"]
    assert "Dr. Tariq" in edu_parts
    assert "Ayesha Siddiqa" in edu_parts
    assert edu_parts["Dr. Tariq"]["completed_count"] == 1
    assert edu_parts["Ayesha Siddiqa"]["completed_count"] == 2
    print("[PASS] Both participants tracked simultaneously under Education department.")

    # 12. Test Participant Multi-Department Progress Preservation
    print("\n12. Testing Cross-Department Progress Preservation for Same Participant...")
    tariq_finance_payload = {
        "participant_name": "Dr. Tariq",
        "table_number": "Table 4 - PFM",
        "answers": {
            "A5": {
                "pdf_searched": "Budget_Strategy_Paper.pdf",
                "evidence": "Civil society consultation framework in Medium-Term Fiscal Framework.",
                "status": "PARTIAL",
                "rationale": "Mentioned but no dedicated seat."
            }
        }
    }
    r_tariq_fin = client.post("/api/submissions/finance", json=tariq_finance_payload)
    assert r_tariq_fin.status_code == 200

    # Retrieve Tariq's education and finance submissions
    r_tariq_edu = client.get("/api/submissions/education?participant=Dr.+Tariq")
    assert r_tariq_edu.status_code == 200
    assert r_tariq_edu.json()["participant_name"] == "Dr. Tariq"
    assert r_tariq_edu.json()["completed_count"] == 1

    r_tariq_fin_get = client.get("/api/submissions/finance?participant=Dr.+Tariq")
    assert r_tariq_fin_get.status_code == 200
    assert r_tariq_fin_get.json()["participant_name"] == "Dr. Tariq"
    assert r_tariq_fin_get.json()["completed_count"] == 1
    # 13. Testing Department Live Lock and Unlock
    print("\n13. Testing Department Live Lock and Unlock...")
    r_locks = client.get("/api/locks")
    assert r_locks.status_code == 200
    initial_locks = r_locks.json()
    assert "health" in initial_locks

    # Lock all 4
    lock_payload = {"health": True, "local": True, "education": True, "finance": True}
    r_lock_update = client.post("/api/locks", json=lock_payload)
    assert r_lock_update.status_code == 200
    assert r_lock_update.json()["locks"]["health"] is True

    # Unlock health only
    unlock_health_payload = {"health": False, "local": True, "education": True, "finance": True}
    r_unlock_h = client.post("/api/locks", json=unlock_health_payload)
    assert r_unlock_h.status_code == 200
    assert r_unlock_h.json()["locks"]["health"] is False
    assert r_unlock_h.json()["locks"]["local"] is True
    print("[PASS] Department Live Lock & Unlock API verified.")

    print("\n====================================================")
    print("ALL TESTS PASSED WITH 100% SUCCESS!")
    print("====================================================")

if __name__ == "__main__":
    run_tests()


