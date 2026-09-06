from __future__ import annotations

from datetime import datetime
from io import BytesIO
import unittest

from openpyxl import load_workbook

from stock_sync_web.crm_export import build_crm_export_xlsx


class CrmExportTest(unittest.TestCase):
    def test_export_creates_readable_client_and_contact_sheets(self) -> None:
        """Removing the CRM-specific workbook structure must break this test."""
        content = build_crm_export_xlsx(
            client_rows=[
                {
                    "id": 7,
                    "document_name": "ООО Ромашка",
                    "inn": "001234567890",
                    "kpp": "001234567",
                    "city": "Москва",
                    "website": "https://example.test",
                    "contact_name": "Ирина",
                    "phone": "01234567890",
                    "email": "irina@example.test",
                    "comment": "Перезвонить после выставки",
                    "last_call_at": "2026-09-04T10:15:00+00:00",
                    "reminder_at": "2026-09-05T09:00:00+00:00",
                    "tab_name": "В работе",
                    "sync_status": "linked",
                    "color_key": "blue",
                }
            ],
            contact_rows=[
                {
                    "id": 13,
                    "client_id": 7,
                    "name": "Ирина",
                    "phone": "01234567890",
                    "email": "irina@example.test",
                    "is_primary": True,
                }
            ],
        )

        workbook = load_workbook(BytesIO(content), data_only=False)
        clients = workbook["Клиенты"]
        contacts = workbook["Контакты"]

        self.assertEqual(
            [
                "Компания", "ИНН", "КПП", "Город", "Сайт", "Основной контакт",
                "Телефон", "Почта", "Комментарий", "Дата звонка", "Напоминание",
                "Личная вкладка", "Связь с 1С",
            ],
            [cell.value for cell in clients[1][:13]],
        )
        self.assertEqual("A2", clients.freeze_panes)
        self.assertEqual("A1:M2", clients.auto_filter.ref)
        self.assertGreaterEqual(clients.column_dimensions["A"].width, 24)
        self.assertGreaterEqual(clients.column_dimensions["I"].width, 40)
        self.assertGreaterEqual(contacts.column_dimensions["A"].width, 24)
        self.assertTrue(clients["I2"].alignment.wrap_text)
        self.assertEqual("@", clients["B2"].number_format)
        self.assertEqual("@", clients["C2"].number_format)
        self.assertEqual("@", clients["G2"].number_format)
        self.assertEqual("001234567890", clients["B2"].value)
        self.assertEqual("01234567890", clients["G2"].value)
        self.assertEqual(datetime(2026, 9, 4, 13, 15), clients["J2"].value)
        self.assertEqual("DDEBF7", clients["A2"].fill.fgColor.rgb[-6:])
        self.assertEqual(
            ["Компания", "Контактное лицо", "Телефон", "Почта", "Основной контакт"],
            [cell.value for cell in contacts[1][:5]],
        )
        self.assertEqual("ООО Ромашка", contacts["A2"].value)
        self.assertEqual("Да", contacts["E2"].value)
        self.assertEqual("@", contacts["C2"].number_format)
        self.assertEqual("A1:E2", contacts.auto_filter.ref)
        self.assertEqual("A2", contacts.freeze_panes)

    def test_export_adds_hidden_round_trip_identifiers_after_visible_columns(self) -> None:
        """Removing the import matching metadata must break this round-trip contract."""
        content = build_crm_export_xlsx(
            client_rows=[{"id": 7, "document_name": "ООО Ромашка", "color_key": "blue"}],
            contact_rows=[{"id": 13, "client_id": 7, "name": "Ирина"}],
        )

        workbook = load_workbook(BytesIO(content), data_only=False)
        clients = workbook["Клиенты"]
        contacts = workbook["Контакты"]

        self.assertEqual(
            ["__crm_client_id", "__color_key", "__export_version"],
            [clients.cell(1, column).value for column in range(14, 17)],
        )
        self.assertEqual([7, "blue", 1], [clients.cell(2, column).value for column in range(14, 17)])
        self.assertTrue(all(clients.column_dimensions[column].hidden for column in ("N", "O", "P")))
        self.assertEqual("A1:M2", clients.auto_filter.ref)

        self.assertEqual(
            ["__crm_client_id", "__crm_contact_id"],
            [contacts.cell(1, column).value for column in range(6, 8)],
        )
        self.assertEqual([7, 13], [contacts.cell(2, column).value for column in range(6, 8)])
        self.assertTrue(all(contacts.column_dimensions[column].hidden for column in ("F", "G")))
        self.assertEqual("A1:E2", contacts.auto_filter.ref)

    def test_export_preserves_camel_case_round_trip_identifiers(self) -> None:
        """API-shaped camelCase mappings retain their hidden import identifiers."""
        content = build_crm_export_xlsx(
            client_rows=[{"clientId": 17, "documentName": "ООО Василёк", "colorKey": "green"}],
            contact_rows=[{"clientId": 17, "contactId": 23, "contactName": "Николай"}],
        )

        workbook = load_workbook(BytesIO(content), data_only=False)
        clients = workbook["Клиенты"]
        contacts = workbook["Контакты"]

        self.assertEqual([17, "green", 1], [clients.cell(2, column).value for column in range(14, 17)])
        self.assertEqual([17, 23], [contacts.cell(2, column).value for column in range(6, 8)])

    def test_export_treats_user_text_as_text_instead_of_excel_formulas(self) -> None:
        """Dropping the formula guard would turn untrusted CRM fields into formulas."""
        content = build_crm_export_xlsx(
            client_rows=[
                {
                    "document_name": "=HYPERLINK(\"https://bad.test\",\"Нажми\")",
                    "comment": " +SUM(1,1)",
                    "phone": "-12345",
                }
            ],
            contact_rows=[{"company_name": "@danger", "name": "+cmd", "phone": "=123"}],
        )

        workbook = load_workbook(BytesIO(content), data_only=False)
        clients = workbook["Клиенты"]
        contacts = workbook["Контакты"]

        self.assertEqual("'=HYPERLINK(\"https://bad.test\",\"Нажми\")", clients["A2"].value)
        self.assertEqual("' +SUM(1,1)", clients["I2"].value)
        self.assertEqual("'-12345", clients["G2"].value)
        self.assertEqual("'@danger", contacts["A2"].value)
        self.assertEqual("'+cmd", contacts["B2"].value)
        self.assertEqual("'=123", contacts["C2"].value)
        self.assertEqual("s", clients["A2"].data_type)
        self.assertEqual("s", contacts["C2"].data_type)

    def test_empty_export_keeps_both_sheets_ready_for_filtering(self) -> None:
        """An empty tab must still download a useful, valid workbook."""
        content = build_crm_export_xlsx(client_rows=[], contact_rows=[])

        workbook = load_workbook(BytesIO(content))
        self.assertEqual(["Клиенты", "Контакты"], workbook.sheetnames)
        self.assertEqual("A1:M1", workbook["Клиенты"].auto_filter.ref)
        self.assertEqual("A1:E1", workbook["Контакты"].auto_filter.ref)
        self.assertEqual(1, workbook["Клиенты"].max_row)
        self.assertEqual(1, workbook["Контакты"].max_row)

    def test_export_preserves_the_saved_gray_row_color(self) -> None:
        """Ignoring a valid saved palette key would lose a user's row marker."""
        content = build_crm_export_xlsx(
            client_rows=[{"document_name": "Серый маркер", "color_key": "gray"}],
            contact_rows=[],
        )

        workbook = load_workbook(BytesIO(content))

        self.assertEqual("D9EAD3", workbook["Клиенты"]["A2"].fill.fgColor.rgb[-6:])


if __name__ == "__main__":
    unittest.main()
