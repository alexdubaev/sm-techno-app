from __future__ import annotations

import os

import streamlit as st

from seo_gen.columns import detect_columns
from seo_gen.io_utils import dataframe_to_xlsx_bytes, read_table
from seo_gen.llm import FallbackSEOGenerator, LLMSEOGenerator
from seo_gen.pipeline import process_dataframe


st.set_page_config(page_title="SEO Generator for Products", layout="wide")
st.title("Генератор SEO-данных для карточек товаров")
st.caption(
    "Загрузите XLSX/CSV с колонками Артикул, Наименование и Бренд/Производитель. "
    "Приложение переведет английские названия, заполнит пропуски по интернет-источникам и "
    "сгенерирует SEO-поля + уникальные описания."
)

with st.sidebar:
    st.subheader("Настройки")
    api_key = st.text_input(
        "OpenAI API key",
        value=os.getenv("OPENAI_API_KEY", ""),
        type="password",
        help="Если не указать ключ, будет использоваться fallback-режим без LLM.",
    )
    model = st.text_input(
        "Модель",
        value=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
    )
    max_search_results = st.slider("Результатов поиска на строку", 3, 12, 8)
    max_pages = st.slider("Страниц для извлечения текста", 1, 6, 3)
    search_only_missing = st.checkbox(
        "Искать в интернете только если нет наименования",
        value=True,
    )

uploaded = st.file_uploader("Файл товаров (.xlsx, .xls, .csv)", type=["xlsx", "xls", "csv"])

if uploaded:
    try:
        source_df = read_table(uploaded)
    except Exception as exc:
        st.error(f"Ошибка чтения файла: {exc}")
        st.stop()

    st.success(f"Файл загружен. Строк: {len(source_df)}")
    mapping = detect_columns(source_df.columns)
    st.write(
        {
            "Определение колонок": {
                "Артикул": mapping.article,
                "Наименование": mapping.name,
                "Бренд/Производитель": mapping.brand,
            }
        }
    )

    if not mapping.article and not mapping.name:
        st.error("Не найдены колонки Артикул или Наименование. Переименуйте колонки и загрузите файл снова.")
        st.stop()

    run = st.button("Сгенерировать SEO-данные", type="primary")
    if run:
        if api_key:
            generator = LLMSEOGenerator(api_key=api_key, model=model)
            st.info("Режим: LLM + интернет-поиск.")
            effective_search_if_missing = search_only_missing
        else:
            generator = FallbackSEOGenerator()
            st.warning("API key не задан. Используется офлайн-режим без LLM.")
            effective_search_if_missing = search_only_missing

        progress = st.progress(0)
        status = st.empty()

        def on_progress(done: int, total: int) -> None:
            pct = int(done * 100 / max(total, 1))
            progress.progress(pct)
            status.text(f"Обработано: {done}/{total}")

        try:
            result_df, mapping = process_dataframe(
                source_df,
                generator=generator,
                mapping=mapping,
                max_search_results=max_search_results,
                max_pages_per_row=max_pages,
                search_if_name_missing_only=effective_search_if_missing,
                progress_callback=on_progress,
            )
        except Exception as exc:
            st.error(f"Ошибка обработки: {exc}")
            st.stop()

        st.success("Готово. SEO-данные сгенерированы.")
        st.dataframe(result_df.head(50), use_container_width=True)

        xlsx_bytes = dataframe_to_xlsx_bytes(result_df)
        st.download_button(
            "Скачать результат XLSX",
            data=xlsx_bytes,
            file_name="seo_result.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        csv_bytes = result_df.to_csv(index=False).encode("utf-8-sig")
        st.download_button(
            "Скачать результат CSV",
            data=csv_bytes,
            file_name="seo_result.csv",
            mime="text/csv",
        )
