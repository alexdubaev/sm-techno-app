from __future__ import annotations

import unittest
from pathlib import Path


class ClientsUiTest(unittest.TestCase):
    def test_clients_page_has_onec_sync_action(self) -> None:
        source = Path("sm-techno-web/app/clients/page.tsx").read_text(encoding="utf-8")

        self.assertIn("syncReferences", source)
        self.assertIn("handleSyncReferences", source)
        self.assertIn("Синхронизировать с 1С", source)
        self.assertIn("await loadClients()", source)

    def test_clients_page_uses_signer_position_select(self) -> None:
        source = Path("sm-techno-web/app/clients/page.tsx").read_text(encoding="utf-8")

        self.assertIn("SIGNER_POSITION_OPTIONS", source)
        self.assertIn('"Директор"', source)
        self.assertIn('"Генеральный директор"', source)
        self.assertIn('value={form.signerPosition ?? ""}', source)
        self.assertIn('onChange={(event) => updateForm("signerPosition", event.target.value)}', source)


if __name__ == "__main__":
    unittest.main()
