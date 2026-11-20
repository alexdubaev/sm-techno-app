"""Separate printed article codes from descriptions; model results must be grounded in source tokens."""
import json
import re

from stock_sync_web.assistant_extraction import ExtractionError, ExtractionRequest

_TOKEN = re.compile(r'\w+(?:[./-]\w+)*', re.UNICODE)
_LABEL = re.compile(r'\b(?:артикул|арт|код|sku|part\s*(?:number|no))\b', re.I)
_MEASURE = re.compile(r'(?:[MМ]\d+(?:[xх]\d+(?:[.,]\d+)?)?|(?:DIN|ISO|DN)\d+|\d+(?:[xх]\d+)+)', re.I)


def _clean(value):
    # Preserve existing standalone codes, including numeric and Cyrillic codes.
    return bool(_TOKEN.fullmatch(value)) and not (re.search(r'[а-яё]', value, re.I) and re.search(r'[a-z]', value, re.I))


def _candidates(source):
    tokens = list(_TOKEN.finditer(source))
    candidates = {}
    consumed = set()
    for i, token in enumerate(tokens[:-1]):
        following = tokens[i + 1]
        prefix, suffix = token.group(), following.group()
        if (re.fullmatch(r'[A-Z]{1,4}', prefix) and re.match(r'\d', suffix)
                and source[token.end():following.start()].isspace()):
            value = prefix + suffix
            candidates[value.casefold()] = value
            consumed.add(i + 1)
    for i, token in enumerate(tokens):
        if i not in consumed:
            value = token.group()
            candidates[value.casefold()] = value
    explicit = bool(_LABEL.search(source))
    return {key: value for key, value in candidates.items()
            if re.search(r'\d', value) and (explicit or not _MEASURE.fullmatch(value))}


def extract_article_cells(rows, infer=None):
    resolved = {}
    pending = []
    candidates = {}
    unresolved = set()
    for index, row in enumerate(rows):
        source = row['article'].strip()
        if _clean(source):
            resolved[index] = source
            continue
        printed = _candidates(source)
        candidates[index] = printed
        strong = [value for value in printed.values() if value.isascii() and re.search(r'[a-z]', value, re.I)]
        alternatives = [value for value in printed.values() if value not in strong and len(value) >= 4]
        if len(strong) == 1 and not alternatives:
            resolved[index] = strong[0]
        elif printed:
            pending.append(index)
        else:
            unresolved.add(index)

    # Only ambiguous cells go to the model, in bounded batches. Quantities and
    # source-row identities are never supplied as writable output fields.
    while pending:
        batch, size = [], 0
        while pending and len(batch) < 40:
            index = pending[0]
            addition = len(rows[index]['article']) + 100
            if batch and size + addition > 60000:
                break
            batch.append(pending.pop(0)); size += addition
        if infer is None:
            unresolved.update(batch)
            continue
        values = [{'rowIndex': i + 1, 'sourceRow': rows[i]['source_row'], 'text': rows[i]['article']} for i in batch]
        try:
            answer = infer(ExtractionRequest('articles', [json.dumps(values, ensure_ascii=False)], [], [], article_cells=True))
            cells = answer.payload['cells']
            if len(cells) != len(batch) or [c['rowIndex'] for c in cells] != [i + 1 for i in batch]:
                raise ValueError('Model changed cell identities')
            for index, cell in zip(batch, cells):
                code = cell['article']
                compact = re.sub(r'\s+', '', code) if type(code) is str else ''
                original = candidates[index].get(compact.casefold())
                if original:
                    resolved[index] = original
                else:
                    unresolved.add(index)
        except (ExtractionError, ValueError, KeyError, TypeError):
            unresolved.update(batch)

    result = [{**row, 'article': resolved[i]} for i, row in enumerate(rows) if i in resolved]
    warnings = []
    if unresolved:
        warnings.append(f'Не выделен однозначный артикул в {len(unresolved)} строках. Эти строки не включены в поиск остатков.')
        for i in sorted(unresolved)[:20]:
            warnings.append(f"Строка {rows[i]['source_row']}: артикул не выделен — {rows[i]['article'][:200]}")
    if not result:
        raise ValueError('Не удалось выделить артикулы из текста. Проверьте, что в файле указаны коды товаров.')
    return result, warnings
