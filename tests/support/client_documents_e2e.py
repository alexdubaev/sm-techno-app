"""Synthetic records and a fixed model double for the isolated browser harness only."""
from stock_sync_web.assistant_extraction import ExtractionResult


DOCUMENT_CLIENT_NAME = "ООО Синтетический клиент документов"
LONG_WAREHOUSE_NAME = "Склад центральный региональный распределительный комплекс Московской области, зона хранения номер семь"


def seed_document_demo(service, owner_id):
    client = service.db.create_crm_client_card({
        "document_name": DOCUMENT_CLIENT_NAME, "full_name": DOCUMENT_CLIENT_NAME,
        "inn": "7701234560", "kpp": "770101001",
        "notes": "SYNTHETIC PRIVATE NOTE — document API must not expose this",
    }, owner_user_id=owner_id)
    item = service.db.create_local_item(
        sku="00123", name="Синтетическая позиция", print_name="Документное наименование товара",
        category_name="Демо", group_name="Демо", price=100,
        warehouses=[{"warehouse_name": LONG_WAREHOUSE_NAME, "quantity": 2},
                    {"warehouse_name": "Склад Южный", "quantity": 5}],
    )
    with service.db.transaction(immediate=True) as conn:
        conn.execute("UPDATE item_warehouse_balances SET price=CASE WHEN warehouse_id=(SELECT id FROM warehouses WHERE name=?) THEN 100 ELSE 250 END WHERE item_id=?", (LONG_WAREHOUSE_NAME, item["id"]))
    return int(client["id"])


class FixedArticleExtractor:
    timeout = 5

    def extract(self, request):
        # Fail closed if another test accidentally relies on this fixture.
        if request.kind != "articles" or not any("00123 4" in text for text in request.texts):
            raise ValueError("The browser fixture only accepts its synthetic article request.")
        return ExtractionResult("articles", {"rows": [
            {"article": "00123", "requested_qty": "4", "source_row": 1},
        ]}, provenance=[{"assetId": aid} for aid in request.source_asset_ids])


def install_document_browser_fixture(api):
    from stock_sync_web.assistant_service import DocumentAssistantService

    owner_id = api.SERVICE.db.get_user_by_username("operator")["id"]
    seed_document_demo(api.SERVICE, owner_id)
    seed_related_navigation(api.SERVICE, owner_id)
    assistant = DocumentAssistantService(api.SERVICE, extractor=FixedArticleExtractor())
    api._document_assistant = lambda: assistant


def seed_related_navigation(service, actor_id):
    """Distinct CRM/counterparty IDs and a same-name unlinked legacy record."""
    name = "ООО Клиент переходов"
    private_owner = service.db.create_user(username="navigation-owner", password="synthetic-password", role="user")
    client = service.db.create_crm_client_card({"document_name": name, "full_name": name,
        "notes": "NAVIGATION PRIVATE NOTE", "crm_owner_user_id": private_owner})
    with service.db.transaction() as conn:
        for cp_id in (901, 902):
            conn.execute("INSERT INTO counterparties(id,onec_key,name,full_name,updated_at) VALUES(?,?,?,?,?)",
                (cp_id, f"synthetic-navigation-{cp_id}", name, name, "2026-10-30"))
        conn.execute("UPDATE crm_clients SET linked_counterparty_id=901 WHERE id=?", (client["id"],))
    for cp_id, marker in [(901, "LINKED"), (902, "UNLINKED")]:
        order_id = service.db.create_order(counterparty_id=cp_id, contract_id=None, organization_key=None,
            order_date="2026-10-30", comment="", lines=[], created_by_user_id=actor_id)
        with service.db.transaction() as conn:
            conn.execute("UPDATE orders SET local_number=?,status='error' WHERE id=?", (f"NAV-{marker}", order_id))
        service.db.create_commercial_offer(number=f"NAV-{marker}", client_source="onec",
            counterparty_id=cp_id, crm_client_id=None, client_name=name, offer_date="2026-10-30",
            source_filename=None, source_path=None, output_path="synthetic-navigation-not-downloaded.xlsx", notes="",
            lines=[{"row_no":1, "name":"Synthetic navigation item", "qty":1, "price_vat":100, "amount_vat":100}],
            created_by_user_id=actor_id)
