"""One real HTTP-to-ledger acceptance of the owner's six-payment example."""
import base64
import os

from tests.auth.conftest import auth_api  # noqa: F401 - shared isolated pytest fixture
from tests.support.bank_e2e import browser_dataset, install_bank_browser_fixture


def test_six_gross_payments_reach_existing_ledger_once_via_authenticated_api(auth_api):
    harness = auth_api
    client = harness.client
    install_bank_browser_fixture(harness.api)
    data = browser_dataset(1)
    headers = harness.bearer(harness.login("admin", "admin-test-password"))
    admin_id = harness.service.db.get_user_by_username("admin")["id"]
    assert not os.environ.get("DEEPSEEK_API_KEY")

    def json_response(response, status=200):
        assert response.status_code == status, response.text
        return response.json()

    created = json_response(client.post("/api/users", headers=headers, json={
        "username": "synthetic-bank-acceptance", "password": "synthetic-manager-password",
        "role": "user", "fullName": "Синтетический менеджер выписки",
    }))["user"]
    employee_headers = harness.bearer(harness.login("synthetic-bank-acceptance", "synthetic-manager-password"))
    own = json_response(client.get("/api/manager/dashboard?month=2026-11", headers=employee_headers))
    manager_id = own["account"]["id"]
    # The API returns an account ID, never assume it equals this user's ID.
    assert own["account"]["userId"] == created["id"]
    json_response(client.post("/api/manager/changes", headers=headers, json={
        "managerId": manager_id, "month": "2026-11", "version": own["version"],
        "kind": "terms", "plan": 0, "fixed": 0, "rate": 500, "mode": "always",
        "reason": "Только синтетические условия контрольного примера",
    }))
    client_ids = []
    for name, inn in zip(data["clientNames"], data["payerInns"]):
        card = json_response(client.post(f"/api/crm/clients?ownerId={admin_id}", headers=headers, json={
            "documentName": name, "fullName": name, "inn": inn, "kpp": data["kpp"],
            "legalType": "legal_entity",
        }), 201)["client"]
        client_ids.append(card["id"])
        json_response(client.put(f"/api/bank-statements/clients/{card['id']}/assignment", headers=headers, json={
            "version": 0, "managerId": manager_id, "startDate": "2026-11-01",
            "reason": "Первоначальное синтетическое закрепление",
        }))

    accounts = json_response(client.get("/api/bank-statements/accounts", headers=headers))
    organization = next(org for org in accounts["organizations"] if org["name"] == data["organizationName"])
    account = json_response(client.post("/api/bank-statements/accounts", headers=headers, json={
        "organizationId": organization["id"], "ownerInn": data["ownerInn"],
        "account": data["account"], "bik": data["bik"], "reason": "Подтверждённый синтетический счёт",
    }))
    raw = base64.b64decode(data["workbookBase64"])

    def upload(filename):
        return json_response(client.post("/api/bank-statements/uploads", headers=headers,
            data={"accountId": str(account["id"])},
            files={"file": (filename, raw, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}))

    detail = upload("synthetic-six-payments.xlsx")
    assert detail["reconciliation"]["valid"] is True
    assert detail["creditTotal"] == 198_906_300 and detail["debitTotal"] == 0
    assert detail["metadata"]["openingBalance"] is None
    assert detail["metadata"]["closingBalance"] is None
    assert len(detail["operations"]) == 6
    assert {op["status"] for op in detail["operations"]} == {"ready"}
    assert len({op["inn"] for op in detail["operations"]}) == 5
    by_document = {op["documentNumber"]: op for op in detail["operations"]}
    assert by_document["5471"]["invoiceDate"] == "2026-09-09"
    assert by_document["5471"]["date"] == "2026-11-03"
    assert by_document["606"]["invoiceNumber"] == "255"
    assert by_document["606"]["invoiceDate"] is None and by_document["606"]["warnings"]
    assert by_document["847"]["id"] != by_document["846"]["id"]

    selection = {"items": [{"operationId": op["id"], "version": op["version"],
                              "fingerprint": op["fingerprint"]} for op in detail["operations"]]}
    preview = json_response(client.post("/api/bank-statements/preview", headers=headers, json=selection))
    assert preview["count"] == 6 and preview["amount"] == 198_906_300
    assert len(preview["effects"]) == 1
    assert preview["effects"][0]["after"]["salesTotal"] == 198_906_300
    assert preview["effects"][0]["after"]["commission"] == 9_945_315
    assert json_response(client.get("/api/manager/dashboard?month=2026-11", headers=employee_headers))["summary"]["count"] == 0

    request = {**selection, "idempotencyKey": "synthetic-six-control-request"}
    result = json_response(client.post("/api/bank-statements/commit", headers=headers, json=request))
    assert result["createdCount"] == 6 and result["linkedCount"] == 0
    repeated = json_response(client.post("/api/bank-statements/commit", headers=headers, json=request))
    assert repeated == result  # A replay returns the saved response, rather than inserting again.
    again = upload("same-bytes-different-name.xlsx")
    assert again["id"] == detail["id"]
    assert again["summary"]["accountedCount"] == 6
    assert client.post("/api/bank-statements/commit", headers=headers,
                       json={**selection, "idempotencyKey": "different-key-cannot-bypass-link"}).status_code == 409

    dashboard = json_response(client.get("/api/manager/dashboard?month=2026-11", headers=employee_headers))
    assert {key: dashboard["summary"][key] for key in ("salesTotal", "commission", "fixed", "income", "count")} == {
        "salesTotal": 198_906_300, "commission": 9_945_315, "fixed": 0, "income": 9_945_315, "count": 6,
    }
    assert len(dashboard["sales"]) == 6
    assert all(sale["source"] == "bank_statement" and sale["rate"] == 500 for sale in dashboard["sales"])
    assert all(sale["date"].startswith("2026-11-") for sale in dashboard["sales"])
    receipts = json_response(client.get(f"/api/bank-statements/clients/{client_ids[-1]}", headers=headers))
    assert len(receipts["payments"]) == 2
    assert sum(payment["amount"] for payment in receipts["payments"]) == 76_306_300
    assert client.get(f"/api/bank-statements/uploads/{detail['id']}/file", headers=employee_headers).status_code == 403
    assert client.get("/api/bank-statements/uploads", headers=employee_headers).status_code == 403
