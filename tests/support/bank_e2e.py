"""Synthetic bank data for disposable test processes, never production startup."""
from __future__ import annotations

import base64

from tests.support.bank_statement_fixture import (
    SYNTHETIC_BIK,
    make_statement,
    synthetic_inn,
)


def browser_dataset(scope: int) -> dict:
    """Separate requisites per browser project, with the same six control sums."""
    if type(scope) is not int or not 1 <= scope <= 6:
        raise ValueError("Synthetic browser scope must be 1–6.")
    organization_name = f"Синтетическая организация выписки {scope}"
    owner_inn = synthetic_inn(9900 + scope)
    account = f"{scope + 100:020d}"
    payer_inns = [synthetic_inn(scope * 10 + i + 1) for i in range(5)]
    client_names = [f"Синтетический покупатель выписки {scope} · {i + 1}" for i in range(5)]

    def edit(sheet):
        sheet["B1"] = organization_name
        sheet["B2"] = owner_inn
        sheet["B3"] = account
        for i in range(6):
            payer = min(i, 4)
            row = 13 + i
            sheet.cell(row, 5, client_names[payer])
            sheet.cell(row, 6, payer_inns[payer])
            sheet.cell(row, 8, f"{scope * 100 + payer + 1:020d}")

    return {
        "organizationName": organization_name,
        "ownerInn": owner_inn,
        "account": account,
        "bik": SYNTHETIC_BIK,
        "payerInns": payer_inns,
        "clientNames": client_names,
        "kpp": "000001001",
        "workbookBase64": base64.b64encode(make_statement(edit=edit)).decode("ascii"),
    }


def install_bank_browser_fixture(api) -> None:
    """Seed only the existing organization directory in an isolated harness."""
    api.SERVICE.db.upsert_organizations([
        {
            "onec_key": f"synthetic-bank-browser-{scope}",
            "name": f"Синтетическая организация выписки {scope}",
            "inn": synthetic_inn(9900 + scope),
            "kpp": "000001001",
        }
        for scope in range(1, 7)
    ])
