from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET_FILES = [
    ROOT / "components" / "stock-page.tsx",
    ROOT / "app" / "work-with-price" / "page.tsx",
    ROOT / "app" / "work-with-invoice" / "page.tsx",
    ROOT / "app" / "orders" / "page.tsx",
    ROOT / "app" / "orders" / "[id]" / "page.tsx",
]

STRING_LITERAL_RE = re.compile(
    r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`',
    re.S,
)
JSX_TEXT_RE = re.compile(r">([^<>]*[^\x00-\x7F][^<>]*)<", re.S)


def quality(value: str) -> int:
    good = len(re.findall(r"[А-Яа-яЁё№₽]", value))
    bad = (
        value.count("Р")
        + value.count("С")
        + value.count("вЂ")
        + value.count("Ð")
        + value.count("Ñ")
        + value.count("�")
    )
    return good * 2 - bad * 3


def to_mixed_bytes(value: str) -> bytes | None:
    data = bytearray()

    for char in value:
        codepoint = ord(char)
        if codepoint <= 255:
            data.append(codepoint)
            continue

        try:
            data.extend(char.encode("cp1251"))
        except UnicodeEncodeError:
            return None

    return bytes(data)


def try_fix(value: str) -> str | None:
    if not any(ord(ch) > 127 for ch in value):
        return None

    current = value
    best = value
    best_quality = quality(value)

    for _ in range(4):
        iteration_best = current
        iteration_quality = quality(current)

        mixed_bytes = to_mixed_bytes(current)
        if mixed_bytes is None:
            break

        try:
            fixed = mixed_bytes.decode("utf-8")
        except UnicodeDecodeError:
            break

        if fixed != current:
            fixed_quality = quality(fixed)
            if fixed_quality > iteration_quality:
                iteration_best = fixed
                iteration_quality = fixed_quality

        if iteration_best == current:
            break

        current = iteration_best

        if iteration_quality > best_quality:
            best = current
            best_quality = iteration_quality

    if best == value:
        return None

    return best


def replace_string_literals(text: str) -> tuple[str, int]:
    replacements = 0
    chunks: list[str] = []
    last_index = 0

    for match in STRING_LITERAL_RE.finditer(text):
        chunks.append(text[last_index : match.start()])
        literal = match.group(0)
        quote = literal[0]
        inner = literal[1:-1]
        fixed = try_fix(inner)
        if fixed is not None:
            literal = f"{quote}{fixed}{quote}"
            replacements += 1
        chunks.append(literal)
        last_index = match.end()

    chunks.append(text[last_index:])
    return "".join(chunks), replacements


def replace_jsx_text(text: str) -> tuple[str, int]:
    replacements = 0

    def replacer(match: re.Match[str]) -> str:
        nonlocal replacements
        inner = match.group(1)
        fixed = try_fix(inner)
        if fixed is None:
            return match.group(0)
        replacements += 1
        return f">{fixed}<"

    updated = JSX_TEXT_RE.sub(replacer, text)
    return updated, replacements


def process_file(path: Path) -> None:
    original = path.read_text(encoding="utf-8")
    updated, string_count = replace_string_literals(original)
    updated, jsx_count = replace_jsx_text(updated)

    if updated != original:
        path.write_text(updated, encoding="utf-8", newline="\n")
        print(f"fixed {path.relative_to(ROOT)}: strings={string_count}, jsx={jsx_count}")
    else:
        print(f"no changes {path.relative_to(ROOT)}")


def main() -> None:
    for path in TARGET_FILES:
        process_file(path)


if __name__ == "__main__":
    main()
