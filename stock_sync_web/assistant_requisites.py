"""Complete review fields from extracted facts without inventing legal details."""
import re

from stock_sync_web.documents import (
    decline_person_name_genitive,
    decline_signer_position_genitive,
    format_person_short_name,
)

_SIGNER_FORMS = (
    ('signer_position_genitive', 'signer_position', decline_signer_position_genitive),
    ('signer_name_genitive', 'signer_name', decline_person_name_genitive),
    ('signer_short_name', 'signer_name', format_person_short_name),
)


def _is_document_heading(value):
    text = ' '.join(str(value or '').casefold().split()).strip(' :.-«»"')
    return bool(re.fullmatch(
        r'(?:карточка|реквизиты)(?: (?:организации|предприятия|компании|контрагента|клиента))?', text))


def complete_requisites_review(result):
    """Return a view of an unconfirmed result; never mutate the stored extraction."""
    raw = result.get('payload') or {}
    fields = dict(raw)
    warnings = list(result.get('warnings') or [])
    missing = list(result.get('missing_fields') or [])
    heading_removed = False
    for key in ('document_name', 'full_name'):
        if _is_document_heading(fields.get(key)):
            fields[key] = None
            heading_removed = True
    if not fields.get('document_name') and fields.get('full_name'):
        fields['document_name'] = fields['full_name']
    if heading_removed:
        warnings.append('Заголовок карточки исключён из названия компании. Проверьте наименование для документов.')
        if not fields.get('document_name'):
            missing.append('document_name')

    derived = False
    for target, source, transform in _SIGNER_FORMS:
        if str(fields.get(target) or '').strip() or not str(fields.get(source) or '').strip():
            continue
        value = transform(fields[source])
        # An unknown title or incomplete name is not evidence of its grammatical form.
        if value and value.casefold() != ' '.join(fields[source].split()).casefold():
            fields[target] = value
            derived = True
    if derived:
        warnings.append('Падежные формы и инициалы подписанта заполнены автоматически. Проверьте их перед подтверждением.')
    return {**result, 'extracted_payload': result.get('extracted_payload', dict(raw)),
            'payload': fields, 'warnings': list(dict.fromkeys(warnings)),
            'missing_fields': list(dict.fromkeys(key for key in missing if not fields.get(key)))}


def complete_requisites_submission(fields, result):
    """Refresh untouched automatic forms when the manager corrects their source.

    Compare to the immutable extraction so an identical POST replay is stable.
    Printed or manually changed forms remain authoritative.
    """
    original = result.get('extracted_payload', result.get('payload') or {})
    initial = complete_requisites_review({'payload': original})['payload']
    updated = dict(fields)
    for target, source, _ in _SIGNER_FORMS:
        if (not original.get(target) and fields.get(source) != original.get(source)
                and fields.get(target) == initial.get(target)):
            updated[target] = None
    return complete_requisites_review({'payload': updated})['payload']
