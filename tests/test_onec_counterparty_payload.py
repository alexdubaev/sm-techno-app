from __future__ import annotations

import unittest
from typing import Any
from urllib.parse import unquote

from stock_sync_desktop.onec_api import OneCClient


CP = "Catalog_\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b"
BANK_ACCOUNTS = "Catalog_\u0411\u0430\u043d\u043a\u043e\u0432\u0441\u043a\u0438\u0435\u0421\u0447\u0435\u0442\u0430"
BANKS = "Catalog_\u041a\u043b\u0430\u0441\u0441\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0440\u0411\u0430\u043d\u043a\u043e\u0432"
CONTACT_KINDS = "Catalog_\u0412\u0438\u0434\u044b\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u043e\u0439\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u0438"

CONTACT_INFO = "\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u0430\u044f\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f"
BANK_DEFAULT_KEY = "\u0411\u0430\u043d\u043a\u043e\u0432\u0441\u043a\u0438\u0439\u0421\u0447\u0435\u0442\u041f\u043e\u0423\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e_Key"
BANK_KEY = "\u0411\u0430\u043d\u043a_Key"
ACCOUNT_NUMBER = "\u041d\u043e\u043c\u0435\u0440\u0421\u0447\u0435\u0442\u0430"
CURRENCY_KEY = "\u0412\u0430\u043b\u044e\u0442\u0430\u0414\u0435\u043d\u0435\u0436\u043d\u044b\u0445\u0421\u0440\u0435\u0434\u0441\u0442\u0432_Key"
ACCOUNT_KIND = "\u0412\u0438\u0434\u0421\u0447\u0435\u0442\u0430"

TYPE = "\u0422\u0438\u043f"
KIND_KEY = "\u0412\u0438\u0434_Key"
PRESENTATION = "\u041f\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u0435"
VALUE = "\u0417\u043d\u0430\u0447\u0435\u043d\u0438\u0435"
FIELD_VALUES = "\u0417\u043d\u0430\u0447\u0435\u043d\u0438\u044f\u041f\u043e\u043b\u0435\u0439"
EMAIL_FIELD = "\u0410\u0434\u0440\u0435\u0441\u042d\u041f"
PHONE_FIELD = "\u041d\u043e\u043c\u0435\u0440\u0422\u0435\u043b\u0435\u0444\u043e\u043d\u0430"
PHONE_SEARCH = "\u041d\u043e\u043c\u0435\u0440\u0422\u0435\u043b\u0435\u0444\u043e\u043d\u0430\u0414\u043b\u044f\u041f\u043e\u0438\u0441\u043a\u0430"
EMAIL_SEARCH = "\u0410\u0434\u0440\u0435\u0441\u042d\u041f\u0414\u043b\u044f\u041f\u043e\u0438\u0441\u043a\u0430"

PREDEF_NAME = "PredefinedDataName"
PHONE_PREDEF = "\u0422\u0435\u043b\u0435\u0444\u043e\u043d\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430"
EMAIL_PREDEF = "Email\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430"
LEGAL_ADDRESS_PREDEF = "\u042e\u0440\u0410\u0434\u0440\u0435\u0441\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430"
ACTUAL_ADDRESS_PREDEF = "\u0424\u0430\u043a\u0442\u0410\u0434\u0440\u0435\u0441\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430"

CONTACT_KIND_REFS = {
    PHONE_PREDEF: ("phone-kind", "\u0422\u0435\u043b\u0435\u0444\u043e\u043d"),
    EMAIL_PREDEF: ("email-kind", "\u0410\u0434\u0440\u0435\u0441\u042d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u043e\u0439\u041f\u043e\u0447\u0442\u044b"),
    LEGAL_ADDRESS_PREDEF: ("legal-address-kind", "\u0410\u0434\u0440\u0435\u0441"),
    ACTUAL_ADDRESS_PREDEF: ("actual-address-kind", "\u0410\u0434\u0440\u0435\u0441"),
}


METADATA = f"""<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices>
    <Schema Namespace="StandardODATA" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityContainer Name="Container">
        <EntitySet Name="{CP}" EntityType="StandardODATA.{CP}" />
        <EntitySet Name="{BANK_ACCOUNTS}" EntityType="StandardODATA.{BANK_ACCOUNTS}" />
      </EntityContainer>
      <EntityType Name="{CP}">
        <Property Name="Description" Type="Edm.String" />
        <Property Name="\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435\u041f\u043e\u043b\u043d\u043e\u0435" Type="Edm.String" />
        <Property Name="\u042e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u043e\u0435\u0424\u0438\u0437\u0438\u0447\u0435\u0441\u043a\u043e\u0435\u041b\u0438\u0446\u043e" Type="Edm.String" />
        <Property Name="\u0418\u041d\u041d" Type="Edm.String" />
        <Property Name="\u041a\u041f\u041f" Type="Edm.String" />
        <Property Name="\u041f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044c" Type="Edm.Boolean" />
        <Property Name="\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a" Type="Edm.Boolean" />
        <Property Name="\u041d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u0435\u043d" Type="Edm.Boolean" />
        <Property Name="\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439" Type="Edm.String" />
        <Property Name="{PHONE_SEARCH}" Type="Edm.String" />
        <Property Name="{EMAIL_SEARCH}" Type="Edm.String" />
        <Property Name="{BANK_DEFAULT_KEY}" Type="Edm.Guid" />
        <Property Name="{CONTACT_INFO}" Type="Collection(StandardODATA.{CP}_{CONTACT_INFO}_RowType)" />
      </EntityType>
      <EntityType Name="{BANK_ACCOUNTS}">
        <Property Name="Ref_Key" Type="Edm.Guid" />
        <Property Name="Description" Type="Edm.String" />
        <Property Name="Owner" Type="Edm.String" />
        <Property Name="Owner_Type" Type="Edm.String" />
        <Property Name="{ACCOUNT_NUMBER}" Type="Edm.String" />
        <Property Name="{BANK_KEY}" Type="Edm.Guid" />
        <Property Name="{CURRENCY_KEY}" Type="Edm.Guid" />
        <Property Name="{ACCOUNT_KIND}" Type="Edm.String" />
      </EntityType>
      <ComplexType Name="{CP}_{CONTACT_INFO}_RowType">
        <Property Name="Ref_Key" Type="Edm.Guid" />
        <Property Name="LineNumber" Type="Edm.Int64" />
        <Property Name="{TYPE}" Type="Edm.String" />
        <Property Name="{KIND_KEY}" Type="Edm.Guid" />
        <Property Name="{PRESENTATION}" Type="Edm.String" />
        <Property Name="{FIELD_VALUES}" Type="Edm.String" />
        <Property Name="{EMAIL_FIELD}" Type="Edm.String" />
        <Property Name="{PHONE_FIELD}" Type="Edm.String" />
        <Property Name="{VALUE}" Type="Edm.String" />
      </ComplexType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>"""


VALID_CARD = {
    "legal_type": "legal_entity",
    "document_name": "OOO Romashka",
    "full_name": "OOO Romashka Full",
    "inn": "7707083893",
    "kpp": "770701001",
    "is_buyer": True,
    "is_supplier": True,
    "is_inactive": False,
    "bank_name_or_bik": "044525225",
    "bank_account": "40702810900000000001",
    "phone": "+7 495 100-00-00",
    "email": "client@example.ru",
    "legal_address": "Legal address",
    "actual_address": "Actual address",
    "notes": "Note",
}


class FakeODataOneCClient(OneCClient):
    def __init__(self) -> None:
        super().__init__("http://onec.example", "user", "password")
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []

    def _request_raw(
        self,
        method: str,
        endpoint_or_url: str,
        payload: dict[str, Any] | None = None,
        *,
        accept: str = "application/json",
    ) -> str:
        if endpoint_or_url == "$metadata":
            return METADATA
        raise AssertionError(f"unexpected raw request: {method} {endpoint_or_url}")

    def _request(
        self,
        method: str,
        endpoint_or_url: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self.calls.append((method, endpoint_or_url, payload))
        decoded_endpoint = unquote(endpoint_or_url)
        if method == "POST" and endpoint_or_url.startswith(f"{CP}?"):
            return {
                "Ref_Key": "counterparty-ref",
                "Description": VALID_CARD["document_name"],
                "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435\u041f\u043e\u043b\u043d\u043e\u0435": VALID_CARD["full_name"],
                "\u0418\u041d\u041d": VALID_CARD["inn"],
                "\u041a\u041f\u041f": VALID_CARD["kpp"],
            }
        if method == "GET" and endpoint_or_url.startswith(CONTACT_KINDS):
            for predefined, (ref_key, contact_type) in CONTACT_KIND_REFS.items():
                if predefined in decoded_endpoint:
                    return {"value": [{"Ref_Key": ref_key, TYPE: contact_type, PREDEF_NAME: predefined}]}
            return {"value": []}
        if method == "GET" and endpoint_or_url.startswith(BANKS):
            return {"value": [{"Ref_Key": "bank-ref", "Description": "PAO Sberbank", "Code": "044525225"}]}
        if method == "GET" and endpoint_or_url.startswith(BANK_ACCOUNTS):
            return {"value": []}
        if method == "GET" and endpoint_or_url.startswith("Catalog_\u0412\u0430\u043b\u044e\u0442\u044b"):
            return {"value": []}
        if method == "POST" and endpoint_or_url.startswith(f"{BANK_ACCOUNTS}?"):
            return {"Ref_Key": "bank-account-ref", **(payload or {})}
        if method == "PATCH" and endpoint_or_url.startswith(f"{CP}(guid'counterparty-ref')"):
            return {}
        raise AssertionError(f"unexpected request: {method} {endpoint_or_url}")


class OneCCounterpartyPayloadTest(unittest.TestCase):
    def test_create_counterparty_writes_contact_info_and_default_bank_account(self) -> None:
        client = FakeODataOneCClient()

        client.create_counterparty(VALID_CARD)

        counterparty_patches = [
            payload
            for method, endpoint, payload in client.calls
            if method == "PATCH" and endpoint.startswith(f"{CP}(guid'counterparty-ref')")
        ]
        self.assertTrue(counterparty_patches)
        merged_patch: dict[str, Any] = {}
        for patch in counterparty_patches:
            merged_patch.update(patch or {})

        self.assertEqual(merged_patch[PHONE_SEARCH], "+7 495 100-00-00")
        self.assertEqual(merged_patch[EMAIL_SEARCH], "client@example.ru")
        self.assertEqual(merged_patch[BANK_DEFAULT_KEY], "bank-account-ref")

        contact_rows = merged_patch[CONTACT_INFO]
        self.assertEqual([row[KIND_KEY] for row in contact_rows], ["phone-kind", "email-kind", "legal-address-kind", "actual-address-kind"])
        self.assertEqual(contact_rows[0][PHONE_FIELD], "74951000000")
        self.assertEqual(contact_rows[1][EMAIL_FIELD], "client@example.ru")
        self.assertIn("Legal address", contact_rows[2][VALUE])
        self.assertIn("Actual address", contact_rows[3][VALUE])

        bank_posts = [
            payload
            for method, endpoint, payload in client.calls
            if method == "POST" and endpoint.startswith(f"{BANK_ACCOUNTS}?")
        ]
        self.assertEqual(len(bank_posts), 1)
        self.assertEqual(bank_posts[0][ACCOUNT_NUMBER], "40702810900000000001")
        self.assertEqual(bank_posts[0][BANK_KEY], "bank-ref")
        self.assertEqual(bank_posts[0]["Owner"], "counterparty-ref")
        self.assertEqual(bank_posts[0]["Owner_Type"], f"StandardODATA.{CP}")

    def test_create_counterparty_uses_separate_bank_bik_and_name(self) -> None:
        client = FakeODataOneCClient()
        card = {
            **VALID_CARD,
            "bank_name_or_bik": "",
            "bank_name": "PAO Sberbank",
            "bank_bik": "044525225",
            "correspondent_account": "30101810400000000225",
        }

        client.create_counterparty(card)

        bank_posts = [
            payload
            for method, endpoint, payload in client.calls
            if method == "POST" and endpoint.startswith(f"{BANK_ACCOUNTS}?")
        ]
        self.assertEqual(len(bank_posts), 1)
        self.assertEqual(bank_posts[0][ACCOUNT_NUMBER], "40702810900000000001")
        self.assertEqual(bank_posts[0][BANK_KEY], "bank-ref")
        self.assertIn("PAO Sberbank", bank_posts[0]["Description"])

    def test_list_counterparties_reads_contact_info_and_default_bank_account(self) -> None:
        class RichReadOneCClient(FakeODataOneCClient):
            def _request(
                self,
                method: str,
                endpoint_or_url: str,
                payload: dict[str, Any] | None = None,
            ) -> dict[str, Any]:
                self.calls.append((method, endpoint_or_url, payload))
                decoded_endpoint = unquote(endpoint_or_url)
                if method == "GET" and (
                    endpoint_or_url.startswith(f"{CP}?") or f"/{CP}?" in decoded_endpoint
                ):
                    return {
                        "value": [
                            {
                                "Ref_Key": "counterparty-ref",
                                "Description": "ИП Кочкин Александр Александрович",
                                "НаименованиеПолное": "ИП Кочкин Александр Александрович",
                                "ЮридическоеФизическоеЛицо": "ИндивидуальныйПредприниматель",
                                "ИНН": "340301024150",
                                "КПП": "",
                                "Покупатель": True,
                                "Поставщик": False,
                                "Недействителен": False,
                                "Комментарий": "Любая дополнительная информация",
                                BANK_DEFAULT_KEY: "bank-account-ref",
                                CONTACT_INFO: [
                                    {KIND_KEY: "phone-kind", PRESENTATION: "+7 8442 00-00-00"},
                                    {KIND_KEY: "email-kind", PRESENTATION: "kochkin@example.ru"},
                                    {KIND_KEY: "legal-address-kind", PRESENTATION: "400007, Волгоградская область"},
                                    {KIND_KEY: "actual-address-kind", PRESENTATION: "400007, г. Волгоград"},
                                ],
                            }
                        ]
                    }
                if method == "GET" and endpoint_or_url.startswith(CONTACT_KINDS):
                    for predefined, (ref_key, contact_type) in CONTACT_KIND_REFS.items():
                        if predefined in decoded_endpoint:
                            return {"value": [{"Ref_Key": ref_key, TYPE: contact_type, PREDEF_NAME: predefined}]}
                    return {"value": []}
                if method == "GET" and endpoint_or_url.startswith(f"{BANK_ACCOUNTS}(guid'bank-account-ref')"):
                    return {
                        "Ref_Key": "bank-account-ref",
                        ACCOUNT_NUMBER: "40802810226110001854",
                        BANK_KEY: "bank-ref",
                    }
                if method == "GET" and endpoint_or_url.startswith(f"{BANKS}(guid'bank-ref')"):
                    return {
                        "Ref_Key": "bank-ref",
                        "Description": 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"',
                        "Code": "046015207",
                        "КоррСчет": "30101810500000000207",
                    }
                return super()._request(method, endpoint_or_url, payload)

        client = RichReadOneCClient()

        rows = client.list_counterparties()

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["onec_key"], "counterparty-ref")
        self.assertEqual(row["legal_type"], "individual_entrepreneur")
        self.assertEqual(row["inn"], "340301024150")
        self.assertEqual(row["kpp"], "")
        self.assertEqual(row["is_buyer"], True)
        self.assertEqual(row["is_supplier"], False)
        self.assertEqual(row["bank_name_or_bik"], "046015207")
        self.assertEqual(row["bank_name"], 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"')
        self.assertEqual(row["bank_bik"], "046015207")
        self.assertEqual(row["bank_account"], "40802810226110001854")
        self.assertEqual(row["correspondent_account"], "30101810500000000207")
        self.assertEqual(row["phone"], "+7 8442 00-00-00")
        self.assertEqual(row["email"], "kochkin@example.ru")
        self.assertEqual(row["legal_address"], "400007, Волгоградская область")
        self.assertEqual(row["actual_address"], "400007, г. Волгоград")
        self.assertEqual(row["notes"], "Любая дополнительная информация")

    def test_list_counterparties_reads_bank_details_from_account_fields(self) -> None:
        class AccountBankDetailsOneCClient(FakeODataOneCClient):
            def _request(
                self,
                method: str,
                endpoint_or_url: str,
                payload: dict[str, Any] | None = None,
            ) -> dict[str, Any]:
                self.calls.append((method, endpoint_or_url, payload))
                decoded_endpoint = unquote(endpoint_or_url)
                if method == "GET" and (
                    endpoint_or_url.startswith(f"{CP}?") or f"/{CP}?" in decoded_endpoint
                ):
                    return {
                        "value": [
                            {
                                "Ref_Key": "counterparty-ref",
                                "Description": "ИП Кочкин Александр Александрович",
                                "НаименованиеПолное": "ИП Кочкин Александр Александрович",
                                "ЮридическоеФизическоеЛицо": "ИндивидуальныйПредприниматель",
                                "ИНН": "340301024150",
                                "КПП": "",
                                BANK_DEFAULT_KEY: "bank-account-ref",
                                CONTACT_INFO: [],
                            }
                        ]
                    }
                if method == "GET" and endpoint_or_url.startswith(CONTACT_KINDS):
                    return {"value": []}
                if method == "GET" and endpoint_or_url.startswith(f"{BANK_ACCOUNTS}(guid'bank-account-ref')"):
                    return {
                        "Ref_Key": "bank-account-ref",
                        "Description": '40802810226110001854, ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"',
                        ACCOUNT_NUMBER: "40802810226110001854",
                        "НаименованиеБанка": 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"',
                        "БИКБанка": "046015207",
                        "КорреспондентскийСчет": "30101810500000000207",
                    }
                return super()._request(method, endpoint_or_url, payload)

        client = AccountBankDetailsOneCClient()

        rows = client.list_counterparties()

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["bank_name_or_bik"], "046015207")
        self.assertEqual(row["bank_name"], 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"')
        self.assertEqual(row["bank_bik"], "046015207")
        self.assertEqual(row["bank_account"], "40802810226110001854")
        self.assertEqual(row["correspondent_account"], "30101810500000000207")


if __name__ == "__main__":
    unittest.main()
