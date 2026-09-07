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

    def test_commercial_offer_generator_uses_searchable_client_picker_with_dropdown(self) -> None:
        source = Path("sm-techno-web/app/commercial-offers/new/page.tsx").read_text(encoding="utf-8")

        self.assertIn("clientSearch", source)
        self.assertIn("isClientPickerOpen", source)
        self.assertIn('className="relative"', source)
        self.assertIn("absolute left-0 right-0 top-[calc(100%+4px)]", source)
        self.assertIn("handleClientSearchChange", source)
        self.assertNotIn('list="commercial-offer-client-options"', source)
        self.assertNotIn("<datalist", source)
        self.assertNotIn("<select\n                  value={clientValue}", source)

    def test_commercial_offer_generator_uses_excel_dropzone_without_source_tabs(self) -> None:
        source = Path("sm-techno-web/app/commercial-offers/new/page.tsx").read_text(encoding="utf-8")

        self.assertIn("fileInputRef", source)
        self.assertIn("handleExcelDrop", source)
        self.assertIn("Перетащите Excel-файл", source)
        self.assertIn("Выбрать файл", source)
        self.assertNotIn('"draft" | "excel"', source)
        self.assertNotIn("Из прайса", source)
        self.assertNotIn("ModeButton", source)

    def test_documents_journal_uses_single_line_search_with_dropdown(self) -> None:
        source = Path("sm-techno-web/app/documents/journal/page.tsx").read_text(encoding="utf-8")

        self.assertIn("documentSearch", source)
        self.assertIn("filteredDocuments", source)
        self.assertIn('list="document-search-options"', source)
        self.assertIn('<datalist id="document-search-options">', source)
        self.assertIn("documents.map((document) => buildDocumentSearchLabel(document))", source)

    def test_documents_journal_can_delete_documents(self) -> None:
        source = Path("sm-techno-web/app/documents/journal/page.tsx").read_text(encoding="utf-8")
        api_source = Path("sm-techno-web/lib/api.ts").read_text(encoding="utf-8")

        self.assertIn("deleteDocument", source)
        self.assertIn("deletingId", source)
        self.assertIn("handleDelete", source)
        self.assertIn("window.confirm", source)
        self.assertIn("setDocuments((current) => current.filter((item) => item.id !== document.id))", source)
        self.assertIn("export async function deleteDocument", api_source)
        self.assertIn('method: "DELETE"', api_source)

    def test_documents_generator_client_search_dropdown_does_not_resize_form(self) -> None:
        source = Path("sm-techno-web/app/documents/page.tsx").read_text(encoding="utf-8")

        self.assertIn("isClientPickerOpen", source)
        self.assertIn("handleClientSearchFocus", source)
        self.assertIn("absolute left-0 right-0 top-[calc(100%+4px)]", source)
        self.assertIn("onMouseDown={(event) => event.preventDefault()}", source)
        self.assertNotIn('type="search"', source)

    def test_documents_generator_displays_document_name_before_program_name(self) -> None:
        source = Path("sm-techno-web/app/documents/page.tsx").read_text(encoding="utf-8")

        self.assertIn("formatClientDisplayName(client)", source)
        self.assertIn("client.documentName || client.fullName || client.name", source)
        self.assertNotIn("client.documentName || client.name || client.fullName", source)

    def test_documents_preview_shows_bank_requisites(self) -> None:
        source = Path("sm-techno-web/app/documents/page.tsx").read_text(encoding="utf-8")

        self.assertIn('label="Название банка"', source)
        self.assertIn('label="Расчетный счет"', source)
        self.assertIn('label="БИК"', source)
        self.assertIn('label="Корр. счет"', source)
        self.assertIn("selectedClient?.bankAccount", source)
        self.assertIn("selectedClient?.bankBik", source)
        self.assertIn("correspondentAccount", source)
        self.assertIn("setCorrespondentAccount", source)
        self.assertIn("correspondentAccount: correspondentAccount.trim()", source)

    def test_documents_preview_shows_signer_position(self) -> None:
        source = Path("sm-techno-web/app/documents/page.tsx").read_text(encoding="utf-8")

        self.assertIn('label="Должность"', source)
        self.assertIn("SignerPositionSelect", source)
        self.assertIn("signerPosition={signerPosition}", source)

    def test_documents_generator_uses_signer_position_select(self) -> None:
        source = Path("sm-techno-web/app/documents/page.tsx").read_text(encoding="utf-8")

        self.assertIn("SIGNER_POSITION_OPTIONS", source)
        self.assertIn('"Директор"', source)
        self.assertIn('"Генеральный директор"', source)
        self.assertIn('value={signerPosition}', source)
        self.assertIn('onChange={(event) => setSignerPosition(event.target.value)}', source)

    def test_sidebar_places_journal_inside_documents_section(self) -> None:
        source = Path("sm-techno-web/components/navigation/app-navigation.tsx").read_text(encoding="utf-8")

        documents_start = source.index("label: 'Документы'")
        admin_start = source.index("label: 'Администрирование'", documents_start)
        documents_block = source[documents_start:admin_start]

        self.assertIn("href: '/documents'", documents_block)
        self.assertIn("isActive: (path) => path === '/documents'", documents_block)
        self.assertIn("href: '/documents/journal'", documents_block)
        self.assertIn("label: 'Журнал документов'", documents_block)
        self.assertNotIn("label: 'Журнал',", source)

    def test_parent_menu_click_only_toggles_its_group_without_navigation(self) -> None:
        source = Path("sm-techno-web/components/app-shell.tsx").read_text(encoding="utf-8")

        self.assertNotIn("useRouter", source)
        self.assertNotIn("router.push", source)
        self.assertIn(
            'expandedGroupLabel: current.expandedGroupLabel === group.label ? "" : group.label',
            source,
        )

    def test_stock_load_waits_for_persisted_state_and_ignores_stale_detail_results(self) -> None:
        source = Path("sm-techno-web/components/stock-page.tsx").read_text(encoding="utf-8")

        catalog_load = source.index("void fetchStockCatalog")
        catalog_effect = source[source.rfind("useEffect(() => {", 0, catalog_load):catalog_load]
        self.assertIn("if (!isHydrated) {\n      return;\n    }", catalog_effect)
        self.assertIn("const detailRequestIdRef = useRef(0);", source)
        self.assertIn("const detailRequestId = ++detailRequestIdRef.current;", source)
        self.assertIn("detailRequestId === detailRequestIdRef.current", source)
        self.assertIn(".catch(() => {\n        // Keep the lightweight catalog row when details cannot be refreshed.\n      });", source)

    def test_price_catalog_and_detail_requests_ignore_superseded_responses(self) -> None:
        source = Path("sm-techno-web/app/work-with-price/page.tsx").read_text(encoding="utf-8")

        self.assertIn("const catalogRequestIdRef = useRef(0);", source)
        self.assertIn("const catalogRequestId = ++catalogRequestIdRef.current;", source)
        self.assertIn("catalogRequestId !== catalogRequestIdRef.current", source)
        self.assertIn("const detailRequestIdRef = useRef(0);", source)
        self.assertIn("const detailRequestId = ++detailRequestIdRef.current;", source)
        self.assertIn("detailRequestId === detailRequestIdRef.current", source)


if __name__ == "__main__":
    unittest.main()
