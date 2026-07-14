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

    def test_sidebar_has_separate_documents_and_journal_sections(self) -> None:
        source = Path("sm-techno-web/components/app-shell.tsx").read_text(encoding="utf-8")

        self.assertIn('label: "Документы"', source)
        self.assertIn('href: "/documents"', source)
        self.assertIn('isActive: (path) => path === "/documents"', source)

        self.assertIn('label: "Журнал"', source)
        self.assertIn('href: "/documents/journal"', source)
        self.assertIn('label: "Журнал документов"', source)


if __name__ == "__main__":
    unittest.main()
