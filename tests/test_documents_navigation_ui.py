from __future__ import annotations

import unittest
from pathlib import Path


class DocumentsNavigationUiTest(unittest.TestCase):
    def test_documents_route_is_generator_and_journal_route_is_list(self) -> None:
        generator_path = Path("sm-techno-web/app/documents/page.tsx")
        journal_path = Path("sm-techno-web/app/documents/journal/page.tsx")

        self.assertTrue(generator_path.exists())
        self.assertTrue(journal_path.exists())

        generator_source = generator_path.read_text(encoding="utf-8")
        journal_source = journal_path.read_text(encoding="utf-8")

        self.assertIn("createDocument", generator_source)
        self.assertIn('router.push("/documents/journal")', generator_source)
        self.assertIn('href="/documents/journal"', generator_source)
        self.assertNotIn("fetchDocuments", generator_source)

        self.assertIn("fetchDocuments", journal_source)
        self.assertIn("downloadDocumentFile", journal_source)
        self.assertIn('href="/documents"', journal_source)

    def test_documents_generator_uses_searchable_client_picker(self) -> None:
        source = Path("sm-techno-web/app/documents/page.tsx").read_text(encoding="utf-8")

        self.assertIn("clientSearch", source)
        self.assertIn("filteredClients", source)
        self.assertIn('placeholder="Поиск по названию, ИНН или КПП"', source)
        self.assertNotIn("setClientValue(event.target.value)", source)

    def test_documents_preview_shows_bank_requisites(self) -> None:
        source = Path("sm-techno-web/app/documents/page.tsx").read_text(encoding="utf-8")

        self.assertIn('label="Название банка"', source)
        self.assertIn('label="Расчетный счет"', source)
        self.assertIn('label="БИК"', source)
        self.assertIn('label="Корр. счет"', source)
        self.assertIn("selectedClient?.bankAccount", source)
        self.assertIn("selectedClient?.bankBik", source)
        self.assertIn("selectedClient?.correspondentAccount", source)

    def test_sidebar_places_journal_inside_documents_section(self) -> None:
        source = Path("sm-techno-web/components/app-shell.tsx").read_text(encoding="utf-8")

        documents_start = source.index('label: "Документы"')
        admin_start = source.index('label: "Администрирование"', documents_start)
        documents_block = source[documents_start:admin_start]

        self.assertIn('href: "/documents"', documents_block)
        self.assertIn('isActive: (path) => path === "/documents"', documents_block)
        self.assertIn('href: "/documents/journal"', documents_block)
        self.assertIn('label: "Журнал документов"', documents_block)
        self.assertNotIn('label: "Журнал",', source)


if __name__ == "__main__":
    unittest.main()
