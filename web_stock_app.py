from __future__ import annotations

import tempfile
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from stock_sync_desktop.service import DraftLine
from stock_sync_web.service import WebStockSyncService


APP_TITLE = "1С Техно - локальный прайс и заказы"
LOGO_PATH = Path(__file__).resolve().parent / "stock_sync_desktop" / "assets" / "company_logo_source.png"
ROLE_LABELS = {"admin": "Администратор", "manager": "Менеджер"}
TEST_MODE_NO_LOGIN = True
SYSTEM_SETTING_FIELDS = [
    ("base_url", "URL базы 1С"),
    ("default_organization_key", "Организация по умолчанию (Key)"),
    ("sale_operation", "ВидОперации"),
    ("currency_key", "ВалютаДокумента_Key"),
    ("order_type_key", "ВидЗаказа"),
    ("order_type_type", "ВидЗаказа_Type"),
    ("price_type_key", "ВидЦен_Key"),
    ("order_state_key", "СостояниеЗаказа"),
    ("order_state_type", "СостояниеЗаказа_Type"),
    ("sale_unit_key", "СтруктурнаяЕдиницаПродажи_Key"),
    ("reserve_unit_key", "СтруктурнаяЕдиницаРезерв_Key"),
    ("business_operation_key", "ХозяйственнаяОперация_Key"),
    ("vat_rate_key", "СтавкаНДС_Key"),
    ("vat_included", "НДСВключатьВСтоимость (1/0)"),
    ("sum_includes_vat", "СуммаВключаетНДС (1/0)"),
    ("unit_type", "ЕдиницаИзмерения_Type"),
]

st.set_page_config(page_title=APP_TITLE, page_icon="📦", layout="wide", initial_sidebar_state="expanded")
SERVICE = WebStockSyncService()
CREATED_DEFAULT_ADMIN = SERVICE.bootstrap()

CUSTOM_CSS = """
<style>
    header[data-testid="stHeader"] { display: none; }
    .stAppToolbar { display: none !important; }
    #MainMenu { visibility: hidden; }
    [data-testid="stAppViewContainer"] { padding-top: 0 !important; }
    .stApp { background: #f6f8fc; }
    [data-testid="stSidebar"] { background: #ffffff; border-right: 1px solid #e7edf5; min-width: 260px; max-width: 260px; }
    .stButton > button[kind="primary"] {
        background: linear-gradient(180deg, #4c8cff 0%, #2f6fed 100%) !important;
        border: 1px solid #2f6fed !important;
        color: #ffffff !important;
        box-shadow: 0 12px 28px rgba(47, 111, 237, 0.24) !important;
    }
    [data-testid="stSidebar"] .stButton > button {
        border-radius: 14px;
        min-height: 44px;
        border: 1px solid #e8edf5;
        background: #ffffff;
        color: #44506a;
        font-weight: 600;
        text-align: left;
        justify-content: flex-start;
        box-shadow: none;
    }
    [data-testid="stSidebar"] .stButton > button[kind="primary"] {
        background: #07162E !important;
        border: 1px solid #07162E !important;
        color: #FFFFFF !important;
        box-shadow: inset 4px 0 0 #FFC400 !important;
    }
    .page-title { font-size: 2rem; font-weight: 700; color: #1f2a44; margin-bottom: 0.25rem; }
    .page-subtitle { color: #73809a; margin-bottom: 1.25rem; }
    .card { background: #ffffff; border: 1px solid #e7edf5; border-radius: 24px; padding: 18px 20px; box-shadow: 0 14px 40px rgba(31,42,68,0.05); margin-bottom: 1rem; }
    .metric-title { color: #73809a; font-size: 0.92rem; margin-bottom: 0.35rem; }
    .metric-value { color: #1f2a44; font-size: 1.8rem; font-weight: 700; }
    .pill { display: inline-block; padding: 0.35rem 0.7rem; border-radius: 999px; background: #e9f9ef; color: #1d7f4e; font-weight: 600; font-size: 0.85rem; }
    .toolbar-label { color: #73809a; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.35rem; }
    .toolbar-hint { color: #8a96ad; font-size: 0.82rem; margin-top: 0.55rem; }
    .selected-item-label { color: #73809a; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.35rem; }
    .selected-item-title { color: #1f2a44; font-size: 1.55rem; font-weight: 700; line-height: 1.18; margin-bottom: 0.45rem; }
    .selected-item-meta { color: #8a96ad; font-size: 0.88rem; margin-bottom: 1rem; }
    .draft-note { color: #2f6fed; font-size: 0.88rem; font-weight: 600; margin-top: 0.2rem; }
    div[data-testid="stTextInput"] {
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 10px 28px rgba(31, 42, 68, 0.08);
        padding: 2px 8px;
        min-height: 48px;
        margin-bottom: 0 !important;
    }
    div[data-testid="stTextInput"] > div {
        border: none !important;
        background: transparent !important;
    }
    div[data-testid="stTextInput"] input {
        background: #ffffff !important;
        min-height: 38px !important;
        font-size: 0.97rem !important;
    }
    div[data-testid="stSelectbox"] {
        background: transparent !important;
        margin-bottom: 0 !important;
    }
    div[data-testid="stSelectbox"] > div[data-baseweb="select"] {
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 10px 28px rgba(31, 42, 68, 0.08);
        border: 1px solid #edf2f7;
        min-height: 48px;
    }
    div[data-testid="stSelectbox"] > div[data-baseweb="select"] > div {
        background: transparent !important;
        border: none !important;
    }
    div[data-testid="stDataEditor"] {
        border-radius: 20px;
        overflow: hidden;
        border: 1px solid #e7edf5;
        box-shadow: 0 12px 30px rgba(31, 42, 68, 0.05);
    }
</style>
"""

st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


def init_session_state() -> None:
    st.session_state.setdefault("auth_user", None)
    st.session_state.setdefault("onec_password", "")
    st.session_state.setdefault("nav_page", "Остатки")
    st.session_state.setdefault("draft_lines", [])
    st.session_state.setdefault("login_notice_shown", False)


def current_user() -> dict[str, Any] | None:
    user = st.session_state.get("auth_user")
    if not user:
        return None
    fresh = SERVICE.get_user(int(user["id"]))
    if not fresh:
        st.session_state["auth_user"] = None
        return None
    st.session_state["auth_user"] = fresh
    return fresh


def auto_login_test_admin() -> dict[str, Any] | None:
    admins = [
        row
        for row in SERVICE.list_users()
        if str(row.get("role") or "") == "admin" and bool(row.get("is_active", 1))
    ]
    if not admins:
        return None
    admin_user = SERVICE.get_user(int(admins[0]["id"]))
    if admin_user:
        st.session_state["auth_user"] = admin_user
    return admin_user


def user_display_name(user: dict[str, Any]) -> str:
    return str(user.get("full_name") or user.get("username") or "Пользователь")


def is_admin(user: dict[str, Any]) -> bool:
    return str(user.get("role") or "") == "admin"


def render_logo() -> None:
    if LOGO_PATH.exists():
        st.image(str(LOGO_PATH), use_container_width=True)
    else:
        st.markdown("### СМ ТЕХНО")


def render_header(title: str, subtitle: str) -> None:
    st.markdown(f'<div class="page-title">{title}</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="page-subtitle">{subtitle}</div>', unsafe_allow_html=True)


def render_metric_cards(items: list[tuple[str, str]]) -> None:
    cols = st.columns(len(items))
    for col, (title, value) in zip(cols, items):
        with col:
            st.markdown(f'<div class="card"><div class="metric-title">{title}</div><div class="metric-value">{value}</div></div>', unsafe_allow_html=True)


def filter_items(rows: list[dict[str, Any]], search: str = "", category: str = "", only_unlinked: bool = False) -> list[dict[str, Any]]:
    prepared = list(rows)
    if search.strip():
        search_text = search.strip().lower()
        prepared = [row for row in prepared if search_text in " ".join(str(row.get(field) or "") for field in ("sku", "name", "print_name", "category_name", "group_name")).lower()]
    if category.strip():
        prepared = [row for row in prepared if (row.get("category_name") or "") == category]
    if only_unlinked:
        prepared = [row for row in prepared if not (row.get("onec_key") or "").strip()]
    return prepared


def to_items_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame([
        {"Артикул": row.get("sku") or "", "Наименование": row.get("name") or "", "Категория": row.get("category_name") or "", "Группа": row.get("group_name") or "", "Остаток": float(row.get("quantity") or 0), "Цена": float(row.get("price") or 0), "Ключ 1С": row.get("onec_key") or "", "Unit key": row.get("unit_key") or ""}
        for row in rows
    ])


def save_upload_to_temp(uploaded_file: Any) -> Path:
    suffix = Path(uploaded_file.name).suffix or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(uploaded_file.getbuffer())
        return Path(tmp.name)


def ensure_draft_state() -> list[dict[str, Any]]:
    draft_lines = st.session_state.get("draft_lines")
    if draft_lines is None:
        draft_lines = []
        st.session_state["draft_lines"] = draft_lines
    return draft_lines


def build_stock_editor_frame(
    rows: list[dict[str, Any]],
    draft_lines: list[dict[str, Any]],
) -> pd.DataFrame:
    draft_quantities: dict[int, float] = {}
    for line in draft_lines:
        item_id = int(line.get("item_id", 0))
        draft_quantities[item_id] = draft_quantities.get(item_id, 0.0) + float(line.get("quantity") or 0.0)

    prepared_rows: list[dict[str, Any]] = []
    for row in rows:
        item_id = int(row["id"])
        quantity_in_order = draft_quantities.get(item_id, 0.0)
        prepared_rows.append(
            {
                "Артикул": row.get("sku") or "",
                "Наименование": row.get("name") or "",
                "Категория": row.get("category_name") or "",
                "Остаток": float(row.get("quantity") or 0),
                "Цена": float(row.get("price") or 0),
                "_item_id": item_id,
                "_draft_qty": quantity_in_order,
                "_in_order": quantity_in_order > 0,
            }
        )
    return pd.DataFrame(prepared_rows)


def build_price_editor_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    prepared_rows: list[dict[str, Any]] = []
    for row in rows:
        prepared_rows.append(
            {
                "Артикул": row.get("sku") or "",
                "Наименование": row.get("name") or "",
                "Категория": row.get("category_name") or "",
                "Остаток": float(row.get("quantity") or 0),
                "Цена": float(row.get("price") or 0),
                "Связь с 1С": "Привязан" if (row.get("onec_key") or "").strip() else "Не привязан",
                "_item_id": int(row["id"]),
                "_is_unlinked": not (row.get("onec_key") or "").strip(),
            }
        )
    return pd.DataFrame(prepared_rows)


def format_rub(value: float) -> str:
    return f"{value:,.2f}".replace(",", " ") + " ₽"


def format_stock_short(value: float) -> str:
    clean_value = int(value) if float(value).is_integer() else round(float(value), 2)
    return f"{clean_value} шт."


def draft_totals(draft_lines: list[dict[str, Any]]) -> tuple[int, float, float]:
    positions = len(draft_lines)
    total_qty = sum(float(line.get("quantity") or 0.0) for line in draft_lines)
    total_amount = sum(float(line.get("amount") or 0.0) for line in draft_lines)
    return positions, total_qty, total_amount


def show_login(service: WebStockSyncService) -> None:
    render_logo()
    render_header("Вход в веб-версию", "Общий каталог и заказы доступны из браузера. Для первой инициализации создан администратор admin / admin123.")
    if CREATED_DEFAULT_ADMIN and not st.session_state.get("login_notice_shown"):
        st.info("Создан первый администратор: логин admin, пароль admin123. После входа лучше сразу сменить пароль.")
        st.session_state["login_notice_shown"] = True
    with st.form("login_form", clear_on_submit=False):
        username = st.text_input("Логин")
        password = st.text_input("Пароль", type="password")
        submitted = st.form_submit_button("Войти", use_container_width=True)
    if submitted:
        user = service.authenticate_app_user(username, password)
        if not user:
            st.error("Неверный логин или пароль.")
        else:
            st.session_state["auth_user"] = user
            st.session_state["onec_password"] = ""
            st.session_state["draft_lines"] = []
            st.rerun()


def show_sidebar(user: dict[str, Any]) -> str:
    with st.sidebar:
        render_logo()
        st.markdown("<div style='height: 18px;'></div>", unsafe_allow_html=True)
        pages = ["Остатки", "Работа со счетом", "Заказы", "Справочники", "Настройки"]
        current_page = st.session_state.get("nav_page", "Остатки")
        for page_name in pages:
            if st.button(
                page_name,
                key=f"nav_{page_name}",
                type="primary" if current_page == page_name else "secondary",
                use_container_width=True,
            ):
                st.session_state["nav_page"] = page_name
                current_page = page_name
                st.rerun()
        st.markdown("<div style='height: 28px;'></div>", unsafe_allow_html=True)
        st.markdown(
            (
                "<div style='background:#FFFFFF; border:1px solid #E3E8F0; border-radius:20px; "
                "padding:16px; box-shadow:0 12px 30px rgba(7,22,46,0.06);'>"
                "<div style='color:#0B1736; font-weight:700; margin-bottom:6px;'>Нужна помощь?</div>"
                "<div style='color:#6B7890; font-size:0.88rem;'>Поддержка 24/7</div>"
                "</div>"
            ),
            unsafe_allow_html=True,
        )
    return current_page

def render_stock_page(service: WebStockSyncService) -> None:
    rows = service.list_items()
    draft_lines = ensure_draft_state()
    selected_item_id = st.session_state.get("stock_selected_item_id")
    page_size = int(st.session_state.get("stock_page_size", 20))
    current_page = int(st.session_state.get("stock_page", 1))

    title_col, status_col = st.columns([4.3, 1.7], gap="large", vertical_alignment="center")
    with title_col:
        render_header("Остатки", "Быстрый поиск по загруженному прайсу и добавление позиций в счет клиента.")
    with status_col:
        if rows:
            st.markdown(
                (
                    "<div style='background:#FFFFFF; border:1px solid #E3E8F0; border-radius:18px; "
                    "padding:14px 18px; box-shadow:0 12px 30px rgba(7, 22, 46, 0.06);'>"
                    "<div style='display:flex; align-items:center; gap:10px;'>"
                    "<span style='width:10px; height:10px; border-radius:999px; background:#16A34A; display:inline-block;'></span>"
                    "<span style='color:#0B1736; font-weight:600;'>Прайс загружен</span>"
                    f"<span style='margin-left:auto; color:#6B7890; font-weight:600;'>{len(rows)} позиции</span>"
                    "</div></div>"
                ),
                unsafe_allow_html=True,
            )

    if not rows:
        with st.container(border=True):
            st.markdown("### Прайс не загружен")
            st.markdown("Загрузи прайс, чтобы начать поиск позиций и добавление товаров в счет.")
            if st.button("Загрузить прайс", type="primary"):
                st.session_state["nav_page"] = "Работа с прайсом"
                st.rerun()
        return

    categories = sorted(
        {
            (row.get("category_name") or "").strip()
            for row in rows
            if (row.get("category_name") or "").strip()
        },
        key=str.lower,
    )

    with st.container(border=True):
        search_col, category_col, stock_col = st.columns([3.1, 1.35, 1.1], gap="medium", vertical_alignment="center")
        with search_col:
            search = st.text_input(
                "Поиск",
                key="stock_search",
                placeholder="Поиск по артикулу или названию запчасти",
                label_visibility="collapsed",
            )
        with category_col:
            category = st.selectbox(
                "Категория",
                ["Все категории"] + categories,
                key="stock_category",
                label_visibility="collapsed",
            )
        with stock_col:
            only_in_stock = st.toggle("Только в наличии", key="stock_only_in_stock")

    filtered = filter_items(
        rows,
        search=search,
        category="" if category == "Все категории" else category,
    )
    if only_in_stock:
        filtered = [row for row in filtered if float(row.get("quantity") or 0) > 0]

    if selected_item_id is not None and int(selected_item_id) not in {int(row["id"]) for row in filtered}:
        selected_item_id = None
        st.session_state["stock_selected_item_id"] = None

    total_filtered = len(filtered)
    total_pages = max(1, (total_filtered + page_size - 1) // page_size)
    if current_page > total_pages:
        current_page = total_pages
        st.session_state["stock_page"] = current_page
    start_index = (current_page - 1) * page_size
    end_index = start_index + page_size
    page_rows = filtered[start_index:end_index]

    draft_quantities: dict[int, float] = {}
    for line in draft_lines:
        item_id = int(line.get("item_id", 0))
        draft_quantities[item_id] = draft_quantities.get(item_id, 0.0) + float(line.get("quantity") or 0.0)

    display_rows: list[dict[str, str]] = []
    row_meta: list[dict[str, Any]] = []
    for row in page_rows:
        item_id = int(row["id"])
        quantity = float(row.get("quantity") or 0.0)
        draft_qty = draft_quantities.get(item_id, 0.0)
        display_rows.append(
            {
                "Артикул": row.get("sku") or "",
                "Наименование": row.get("name") or "",
                "Категория": row.get("category_name") or "",
                "Остаток": format_stock_short(quantity),
                "Цена": format_rub(float(row.get("price") or 0.0)),
                "Действие": "+",
            }
        )
        row_meta.append(
            {
                "item_id": item_id,
                "selected": selected_item_id is not None and int(selected_item_id) == item_id,
                "in_order": draft_qty > 0,
                "stock_positive": quantity > 0,
                "draft_qty": draft_qty,
            }
        )

    list_col, action_col = st.columns([3.2, 1.45], gap="large")

    with list_col:
        with st.container(border=True):
            if not filtered:
                st.markdown("### Ничего не найдено")
                st.markdown("Попробуйте изменить запрос, категорию или отключить фильтр наличия.")
            else:
                display_frame = pd.DataFrame(display_rows)

                def style_stock_rows(row: pd.Series) -> list[str]:
                    meta = row_meta[row.name]
                    bg = "#FFFFFF"
                    if meta["in_order"]:
                        bg = "#EEF9F0"
                    if meta["selected"]:
                        bg = "#FFF8E6"
                    base_style = f"background-color: {bg}; color: #0B1736; border-bottom: 1px solid #EEF2F7; padding-top: 14px; padding-bottom: 14px;"
                    styles = [base_style] * len(row)
                    if meta["selected"]:
                        styles[0] += "border-left: 4px solid #FFC400;"
                    stock_idx = row.index.get_loc("Остаток")
                    action_idx = row.index.get_loc("Действие")
                    styles[stock_idx] += f"font-weight: 700; color: {'#16A34A' if meta['stock_positive'] else '#EF4444'};"
                    styles[action_idx] += (
                        "font-weight: 700; text-align: center; font-size: 1.1rem; "
                        f"color: {'#07162E' if meta['selected'] else '#6B7890'};"
                    )
                    return styles

                styled_frame = display_frame.style.apply(style_stock_rows, axis=1)
                table_height = min(520, max(280, 84 + len(display_frame) * 72))
                table_event = st.dataframe(
                    styled_frame,
                    use_container_width=True,
                    hide_index=True,
                    height=table_height,
                    key="stock_table",
                    on_select="rerun",
                    selection_mode="single-row",
                    column_config={
                        "Артикул": st.column_config.TextColumn("Артикул", width="small"),
                        "Наименование": st.column_config.TextColumn("Наименование", width="large"),
                        "Категория": st.column_config.TextColumn("Категория", width="medium"),
                        "Остаток": st.column_config.TextColumn("Остаток", width="small"),
                        "Цена": st.column_config.TextColumn("Цена", width="small"),
                        "Действие": st.column_config.TextColumn("", width="small"),
                    },
                )
                selected_rows_idx = list(table_event.selection.rows)
                if selected_rows_idx:
                    selected_item_id = int(page_rows[selected_rows_idx[0]]["id"])
                    st.session_state["stock_selected_item_id"] = selected_item_id

                footer_left, footer_center, footer_right = st.columns([2.3, 1.4, 1.4], gap="medium", vertical_alignment="center")
                footer_left.caption(f"Показано {len(page_rows)} из {total_filtered}")
                with footer_center:
                    prev_col, page_col, next_col = st.columns([1, 1, 1], gap="small")
                    if prev_col.button("‹", key="stock_prev_page", disabled=current_page <= 1, use_container_width=True):
                        st.session_state["stock_page"] = current_page - 1
                        st.rerun()
                    page_col.markdown(
                        f"<div style='text-align:center; padding-top:8px; color:#0B1736; font-weight:700;'>{current_page}</div>",
                        unsafe_allow_html=True,
                    )
                    if next_col.button("›", key="stock_next_page", disabled=current_page >= total_pages, use_container_width=True):
                        st.session_state["stock_page"] = current_page + 1
                        st.rerun()
                with footer_right:
                    page_size_value = st.selectbox(
                        "Строк на странице",
                        [20, 40, 80],
                        index=[20, 40, 80].index(page_size) if page_size in [20, 40, 80] else 0,
                        key="stock_page_size_select",
                    )
                    if int(page_size_value) != page_size:
                        st.session_state["stock_page_size"] = int(page_size_value)
                        st.session_state["stock_page"] = 1
                        st.rerun()

    selected_row = next((row for row in rows if selected_item_id is not None and int(row["id"]) == int(selected_item_id)), None)

    with action_col:
        with st.container(border=True):
            st.markdown("<div class='selected-item-label'>Выбранная позиция</div>", unsafe_allow_html=True)
            if not selected_row:
                st.caption("Выбери строку в таблице, чтобы добавить товар в счет.")
            else:
                selected_item_id = int(selected_row["id"])
                current_qty_in_order = draft_quantities.get(selected_item_id, 0.0)
                qty_key = f"stock_qty_{selected_item_id}"
                if qty_key not in st.session_state:
                    st.session_state[qty_key] = int(current_qty_in_order) if current_qty_in_order > 0 else 1
                st.markdown(
                    f"<div class='selected-item-title'>{selected_row.get('name') or 'Без названия'}</div>",
                    unsafe_allow_html=True,
                )
                category_note = selected_row.get("category_name") or "Без категории"
                st.markdown(
                    f"<div class='selected-item-meta'>Артикул: {selected_row.get('sku') or '—'} · Категория: {category_note}</div>",
                    unsafe_allow_html=True,
                )

                info_col1, info_col2 = st.columns(2)
                stock_value = float(selected_row.get("quantity") or 0.0)
                info_col1.markdown(
                    f"<div style='background:#FFFFFF;border:1px solid #E3E8F0;border-radius:18px;padding:16px;'><div style='color:#6B7890;font-size:0.82rem;'>В наличии</div><div style='color:{'#16A34A' if stock_value > 0 else '#EF4444'};font-weight:700;font-size:1.6rem;'>{format_stock_short(stock_value)}</div></div>",
                    unsafe_allow_html=True,
                )
                info_col2.markdown(
                    f"<div style='background:#FFFFFF;border:1px solid #E3E8F0;border-radius:18px;padding:16px;'><div style='color:#6B7890;font-size:0.82rem;'>Цена</div><div style='color:#0B1736;font-weight:700;font-size:1.6rem;'>{format_rub(float(selected_row.get('price') or 0.0))}</div></div>",
                    unsafe_allow_html=True,
                )

                st.markdown("<div class='selected-item-label' style='margin-top:1rem;'>Количество</div>", unsafe_allow_html=True)
                qty_col1, qty_col2, qty_col3 = st.columns([1, 1.2, 1], gap="small", vertical_alignment="center")
                current_display_qty = int(st.session_state.get(qty_key, 1))
                if qty_col1.button("−", key=f"stock_minus_{selected_item_id}", use_container_width=True, disabled=current_display_qty <= 1):
                    st.session_state[qty_key] = max(1, current_display_qty - 1)
                    st.rerun()
                qty_col2.markdown(
                    f"<div style='text-align:center; padding:10px 0; border:1px solid #E3E8F0; border-radius:14px; background:#FFFFFF; font-weight:700; color:#0B1736;'>{current_display_qty}</div>",
                    unsafe_allow_html=True,
                )
                if qty_col3.button("+", key=f"stock_plus_{selected_item_id}", use_container_width=True, disabled=current_display_qty >= int(stock_value) if stock_value > 0 else True):
                    st.session_state[qty_key] = current_display_qty + 1
                    st.rerun()

                add_disabled = stock_value <= 0 or current_display_qty > stock_value
                if st.button("Добавить в счет", key=f"stock_add_to_invoice_{selected_item_id}", type="primary", use_container_width=True, disabled=add_disabled):
                    updated_lines = [
                        line for line in draft_lines if int(line.get("item_id", 0)) != selected_item_id
                    ]
                    updated_lines.append(
                        {
                            "item_id": selected_item_id,
                            "name": selected_row.get("name") or "",
                            "quantity": float(current_display_qty),
                            "price": float(selected_row.get("price") or 0.0),
                            "amount": round(float(current_display_qty) * float(selected_row.get("price") or 0.0), 2),
                            "available": float(selected_row.get("quantity") or 0.0),
                        }
                    )
                    st.session_state["draft_lines"] = updated_lines
                    st.success("Позиция добавлена в счет.")
                    st.rerun()

            st.divider()
            positions_count, total_qty, total_amount = draft_totals(draft_lines)
            st.markdown(f"<div class='selected-item-label'>Позиции в счете ({positions_count})</div>", unsafe_allow_html=True)
            if not draft_lines:
                st.caption("Счет пока пуст.")
            else:
                item_lookup = {int(row["id"]): row for row in rows}
                for index, line in enumerate(draft_lines):
                    item_row = item_lookup.get(int(line.get("item_id", 0)), {})
                    line_name = str(line.get("name") or item_row.get("name") or "Без названия")
                    line_sku = str(item_row.get("sku") or "—")
                    line_amount = float(line.get("amount") or 0.0)
                    title = line_name if len(line_name) <= 48 else line_name[:45] + "..."
                    line_col1, line_col2 = st.columns([3.2, 0.8], gap="small", vertical_alignment="center")
                    line_col1.markdown(
                        (
                            f"<div style='padding:10px 0;'>"
                            f"<div style='color:#0B1736;font-weight:600; line-height:1.25;'>{title}</div>"
                            f"<div style='color:#6B7890;font-size:0.82rem;'>{line_sku} · × {float(line.get('quantity') or 0.0):.0f} · {format_rub(line_amount)}</div>"
                            "</div>"
                        ),
                        unsafe_allow_html=True,
                    )
                    if line_col2.button("×", key=f"stock_remove_line_{index}", use_container_width=True):
                        updated_lines = draft_lines.copy()
                        updated_lines.pop(index)
                        st.session_state["draft_lines"] = updated_lines
                        st.rerun()

                st.divider()
                st.markdown(
                    (
                        f"<div style='color:#6B7890;font-size:0.88rem;'>Итого позиций: {positions_count}</div>"
                        f"<div style='color:#6B7890;font-size:0.88rem; margin-top:4px;'>Сумма без НДС: {format_rub(total_amount)}</div>"
                        f"<div style='color:#0B1736;font-weight:800;font-size:1.9rem; margin-top:12px;'>Итого: {format_rub(total_amount)}</div>"
                    ),
                    unsafe_allow_html=True,
                )
                if st.button("Перейти к счету", key="stock_go_to_invoice", use_container_width=True):
                    st.session_state["nav_page"] = "Работа со счетом"
                    st.rerun()


def render_price_page(service: WebStockSyncService, user: dict[str, Any]) -> None:
    render_header("Работа с прайсом", "Импорт каталога, привязка к 1С и обслуживание локальных позиций.")
    if not is_admin(user):
        st.error("Этот раздел доступен только администратору.")
        return
    onec_username = str(user.get("onec_username") or "")
    onec_password = st.session_state.get("onec_password", "")
    rows = service.list_items()
    total_quantity = sum(float(row.get("quantity") or 0) for row in rows)
    unlinked = sum(1 for row in rows if not (row.get("onec_key") or "").strip())

    with st.container(border=True):
        st.markdown("<div class='toolbar-label'>Быстрые действия</div>", unsafe_allow_html=True)
        action_col1, action_col2, action_col3, action_col4 = st.columns([1.1, 1.1, 1.2, 1.6], gap="medium")
        action_col1.download_button(
            "Скачать Excel-шаблон",
            data=service.create_template_bytes(),
            file_name="stock_template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )
        action_col2.download_button(
            "Выгрузить текущий срез",
            data=service.export_stock_snapshot_bytes(),
            file_name="stock_snapshot.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )
        if action_col3.button("Привязать локальные товары к 1С", use_container_width=True):
            try:
                count = service.sync_items(onec_username=onec_username, onec_password=onec_password)
                st.success(f"Связей с 1С обновлено: {count}")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))
        action_col4.markdown(
            f"<div class='toolbar-hint'>Локальных позиций: {len(rows)} · Остаток: {total_quantity:.2f} · Без 1С: {unlinked}</div>",
            unsafe_allow_html=True,
        )

        with st.expander("Импорт прайса из Excel / CSV", expanded=False):
            uploaded = st.file_uploader("Файл прайса", type=["xlsx", "xls", "csv"], key="price_upload", label_visibility="collapsed")
            if st.button("Импортировать остатки", type="primary", use_container_width=True):
                if uploaded is None:
                    st.warning("Сначала выбери файл для импорта.")
                else:
                    temp_path = save_upload_to_temp(uploaded)
                    try:
                        result = service.import_stock_excel(temp_path)
                        st.success(
                            "Импорт завершен. "
                            f"Создано: {result['created']}, обновлено: {result['updated']}, "
                            f"адресов: {result['locationUpdated']}, "
                            f"пропущено адресов: {result['locationSkipped']}."
                        )
                    except Exception as exc:
                        st.error(str(exc))
                    finally:
                        temp_path.unlink(missing_ok=True)
                    st.rerun()

    categories = sorted({(row.get("category_name") or "").strip() for row in rows if (row.get("category_name") or "").strip()}, key=str.lower)
    with st.container(border=True):
        st.markdown("<div class='toolbar-label'>Фильтры каталога</div>", unsafe_allow_html=True)
        col1, col2, col3 = st.columns([3.2, 1.5, 1.1], gap="medium", vertical_alignment="center")
        search = col1.text_input("Поиск", key="price_search", placeholder="Поиск по артикулу или названию", label_visibility="collapsed")
        category = col2.selectbox("Категория", ["Все категории"] + categories, key="price_category", label_visibility="collapsed")
        only_unlinked = col3.toggle("Только без 1С", key="price_only_unlinked")
        st.markdown(
            "<div class='toolbar-hint'>Выбери строку в каталоге, чтобы справа поменять остаток, проверить связь с 1С или удалить позицию.</div>",
            unsafe_allow_html=True,
        )

    filtered = filter_items(rows, search=search, category="" if category == "Все категории" else category, only_unlinked=only_unlinked)
    price_frame = build_price_editor_frame(filtered)
    selected_price_item_id = st.session_state.get("price_selected_item_id")

    list_col, action_col = st.columns([3.1, 1.2], gap="large")

    with list_col:
        with st.container(border=True):
            if price_frame.empty:
                st.session_state["price_selected_item_id"] = None
                st.info("По текущим фильтрам ничего не найдено.")
            else:
                table_height = min(420, max(220, 84 + len(price_frame) * 38))
                display_frame = price_frame[["Артикул", "Наименование", "Категория", "Остаток", "Цена", "Связь с 1С"]].copy()

                def style_price_rows(row: pd.Series) -> list[str]:
                    source_row = price_frame.iloc[row.name]
                    if bool(source_row["_is_unlinked"]):
                        return ["background-color: #fff7ea; color: #1f2a44;"] * len(row)
                    return [""] * len(row)

                styled_frame = display_frame.style.apply(style_price_rows, axis=1)
                table_event = st.dataframe(
                    styled_frame,
                    use_container_width=True,
                    hide_index=True,
                    height=table_height,
                    key="price_table",
                    on_select="rerun",
                    selection_mode="single-row",
                    column_config={
                        "Артикул": st.column_config.TextColumn("Артикул", width="small"),
                        "Наименование": st.column_config.TextColumn("Наименование", width="large"),
                        "Категория": st.column_config.TextColumn("Категория", width="medium"),
                        "Остаток": st.column_config.NumberColumn("Остаток", format="%.2f"),
                        "Цена": st.column_config.NumberColumn("Цена", format="%.2f"),
                        "Связь с 1С": st.column_config.TextColumn("Связь с 1С", width="small"),
                    },
                )
                selected_rows_idx = list(table_event.selection.rows)
                if selected_rows_idx:
                    selected_price_item_id = int(price_frame.iloc[selected_rows_idx[0]]["_item_id"])
                    st.session_state["price_selected_item_id"] = selected_price_item_id
                elif selected_price_item_id is not None and int(selected_price_item_id) not in {
                    int(value) for value in price_frame["_item_id"].tolist()
                }:
                    st.session_state["price_selected_item_id"] = None
            st.markdown(
                "<div class='toolbar-hint'>Позиции без привязки к 1С подсвечиваются мягким теплым цветом, чтобы их было легче обслуживать.</div>",
                unsafe_allow_html=True,
            )

    selected_price_rows = [
        row for row in filtered if selected_price_item_id is not None and int(row["id"]) == int(selected_price_item_id)
    ]

    with action_col:
        with st.container(border=True):
            st.markdown("<div class='selected-item-label'>Обслуживание позиции</div>", unsafe_allow_html=True)
            if not rows:
                st.caption("Сначала загрузи прайс или импортируй остатки.")
                return
            if not selected_price_rows:
                st.caption("Выбери строку в каталоге, чтобы изменить остаток или удалить товар.")
            else:
                selected_row = selected_price_rows[0]
                st.markdown(
                    f"<div class='selected-item-title'>{selected_row.get('name') or 'Без названия'}</div>",
                    unsafe_allow_html=True,
                )
                link_state = "Привязан к 1С" if (selected_row.get("onec_key") or "").strip() else "Не привязан к 1С"
                st.markdown(
                    f"<div class='selected-item-meta'>Артикул: {selected_row.get('sku') or '—'} · {link_state}</div>",
                    unsafe_allow_html=True,
                )
                info_col1, info_col2 = st.columns(2)
                info_col1.metric("Остаток", f"{float(selected_row.get('quantity') or 0):.2f}")
                info_col2.metric("Цена", f"{float(selected_row.get('price') or 0):.2f}")
                quantity = st.number_input(
                    "Новый остаток",
                    value=float(selected_row.get("quantity") or 0),
                    step=1.0,
                    key="adjust_qty",
                )
                if st.button("Сохранить остаток", type="primary", use_container_width=True):
                    try:
                        service.set_stock_quantity(int(selected_row["id"]), float(quantity))
                        st.success("Остаток обновлен.")
                    except Exception as exc:
                        st.error(str(exc))
                    st.rerun()
                if st.button("Удалить выбранный товар", use_container_width=True):
                    result = service.delete_local_items([int(selected_row["id"])])
                    st.warning(f"Удалено: {result['deleted']}, скрыто: {result['hidden']}")
                    st.session_state["price_selected_item_id"] = None
                    st.rerun()
            with st.expander("Опасные действия", expanded=False):
                st.caption("Используй это только для полной очистки локального каталога.")
                if st.button("Очистить весь локальный каталог", use_container_width=True):
                    result = service.delete_all_local_items()
                    st.warning(f"Каталог очищен. Удалено: {result['deleted']}, скрыто: {result['hidden']}")
                    st.session_state["price_selected_item_id"] = None
                    st.rerun()


def render_refs_page(service: WebStockSyncService, user: dict[str, Any]) -> None:
    render_header("Справочники", "Контрагенты, договоры и организации, которые участвуют в заказах.")
    onec_username = str(user.get("onec_username") or "")
    onec_password = st.session_state.get("onec_password", "")
    if is_admin(user):
        with st.container(border=True):
            st.subheader("Синхронизация справочников")
            col1, col2, col3, col4 = st.columns(4)
            if col1.button("Контрагенты", use_container_width=True):
                try:
                    st.success(f"Контрагентов обновлено: {service.sync_counterparties(onec_username=onec_username, onec_password=onec_password)}")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))
            if col2.button("Договоры", use_container_width=True):
                try:
                    st.success(f"Договоров обновлено: {service.sync_contracts(onec_username=onec_username, onec_password=onec_password)}")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))
            if col3.button("Организации", use_container_width=True):
                try:
                    st.success(f"Организаций обновлено: {service.sync_organizations(onec_username=onec_username, onec_password=onec_password)}")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))
            if col4.button("Все сразу", type="primary", use_container_width=True):
                try:
                    cp = service.sync_counterparties(onec_username=onec_username, onec_password=onec_password)
                    ctr = service.sync_contracts(onec_username=onec_username, onec_password=onec_password)
                    org = service.sync_organizations(onec_username=onec_username, onec_password=onec_password)
                    st.success(f"Справочники обновлены. Контрагенты: {cp}, договоры: {ctr}, организации: {org}")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))
    tabs = st.tabs(["Контрагенты", "Договоры", "Организации"])
    with tabs[0]:
        st.dataframe(pd.DataFrame(service.list_counterparties()), use_container_width=True, hide_index=True)
    with tabs[1]:
        st.dataframe(pd.DataFrame(service.list_contracts()), use_container_width=True, hide_index=True)
    with tabs[2]:
        st.dataframe(pd.DataFrame(service.list_organizations()), use_container_width=True, hide_index=True)

def render_orders_page(service: WebStockSyncService, user: dict[str, Any]) -> None:
    render_header("Заказы", "Собираем заказ из локального каталога и отправляем его в 1С под личной учеткой пользователя.")
    rows = service.list_items()
    counterparties = service.list_counterparties()
    organizations = service.list_organizations()
    onec_username = str(user.get("onec_username") or "")
    onec_password = st.session_state.get("onec_password", "")
    if not onec_username:
        st.warning("В профиле не заполнен логин 1С. Сначала зайди в раздел 'Профиль'.")
    if not onec_password:
        st.warning("Для отправки заказов введи пароль 1С в разделе 'Профиль'.")
    if not rows:
        st.info("Локальный каталог пока пуст. Сначала загрузи прайс в разделе 'Работа с прайсом'.")
        return
    if not counterparties:
        st.info("Справочник контрагентов пуст. Сначала синхронизируй справочники.")
        return

    counterparty_options = {f"{row.get('name')} [{row.get('inn') or row['id']}]": row for row in counterparties}
    counterparty_label = st.selectbox("Контрагент", list(counterparty_options.keys()), key="order_counterparty")
    selected_counterparty = counterparty_options[counterparty_label]
    contracts = service.list_contracts(selected_counterparty.get("onec_key"))
    contract_options: dict[str, dict[str, Any] | None] = {"Без договора": None}
    for row in contracts:
        contract_options[f"{row.get('name')} [{row.get('contract_number') or row['id']}]" ] = row
    contract_label = st.selectbox("Договор", list(contract_options.keys()), key="order_contract")
    organization_options: dict[str, dict[str, Any] | None] = {"Не указывать": None}
    for row in organizations:
        organization_options[f"{row.get('name')} [{row.get('inn') or row['id']}]" ] = row
    org_label = st.selectbox("Организация", list(organization_options.keys()), key="order_org")
    order_date = st.date_input("Дата заказа", value=date.today(), key="order_date_value")
    comment = st.text_input("Комментарий", key="order_comment")

    st.subheader("Добавление строк")
    item_search = st.text_input("Поиск товара", key="order_item_search")
    filtered_rows = filter_items(rows, search=item_search)[:200] if item_search.strip() else rows[:200]
    item_options = {f"{row.get('name')} [{row.get('sku') or row['id']}]": row for row in filtered_rows}
    if not item_options:
        st.warning("По текущему поиску товары не найдены.")
    else:
        selected_item_label = st.selectbox("Товар", list(item_options.keys()), key="order_item_label")
        selected_item = item_options[selected_item_label]
        col1, col2, col3 = st.columns(3)
        qty = col1.number_input("Количество", min_value=0.0, value=1.0, step=1.0, key="order_qty")
        price = col2.number_input("Цена", min_value=0.0, value=float(selected_item.get("price") or 0), step=100.0, key="order_price")
        col3.metric("Доступно", f"{float(selected_item.get('quantity') or 0):.2f}")
        if st.button("Добавить строку", use_container_width=True):
            if qty <= 0:
                st.error("Количество должно быть больше нуля.")
            else:
                draft_lines = ensure_draft_state()
                draft_lines.append({"item_id": int(selected_item["id"]), "name": selected_item.get("name") or "", "quantity": float(qty), "price": float(price), "amount": round(float(qty) * float(price), 2), "available": float(selected_item.get("quantity") or 0)})
                st.session_state["draft_lines"] = draft_lines
                st.rerun()

    draft_lines = ensure_draft_state()
    st.subheader("Черновик заказа")
    if draft_lines:
        draft_frame = pd.DataFrame([{"Товар": line["name"], "Количество": line["quantity"], "Цена": line["price"], "Сумма": line["amount"], "Доступно": line["available"]} for line in draft_lines])
        st.dataframe(draft_frame, use_container_width=True, hide_index=True)
        remove_options = {f"{index + 1}. {line['name']}": index for index, line in enumerate(draft_lines)}
        col1, col2 = st.columns([2, 1])
        remove_label = col1.selectbox("Удалить строку", list(remove_options.keys()), key="remove_draft_line")
        if col2.button("Удалить выбранную", use_container_width=True):
            index = remove_options[remove_label]
            draft_lines.pop(index)
            st.session_state["draft_lines"] = draft_lines
            st.rerun()
        if st.button("Отправить заказ в 1С", type="primary", use_container_width=True):
            try:
                _, doc = service.create_and_sync_order(actor_user_id=int(user["id"]), onec_username=onec_username, onec_password=onec_password, counterparty_id=int(selected_counterparty["id"]), contract_id=int(contract_options[contract_label]["id"]) if contract_options[contract_label] else None, organization_key=(organization_options[org_label] or {}).get("onec_key"), order_date=order_date.isoformat(), comment=comment, draft_lines=[DraftLine(item_id=int(line["item_id"]), quantity=float(line["quantity"]), price=float(line["price"]), amount=float(line["amount"])) for line in draft_lines])
                st.success(f"Заказ отправлен в 1С. Номер 1С: {doc.get('Number', 'без номера')}.")
                st.session_state["draft_lines"] = []
                st.rerun()
            except Exception as exc:
                st.error(str(exc))
    else:
        st.info("Черновик пока пуст.")

    st.subheader("История заказов")
    orders = service.list_orders_for_user(user_id=int(user["id"]), is_admin=is_admin(user))
    if orders:
        history_rows = [{"Локальный №": row.get("local_number") or "", "Контрагент": row.get("counterparty_name") or "", "Создал": row.get("created_by_name") or row.get("created_by_username") or "", "Статус": row.get("status") or "", "№ 1С": row.get("onec_number") or "", "Дата 1С": row.get("onec_date") or "", "Сумма": row.get("total_amount") or 0, "Ошибка": row.get("error_message") or ""} for row in orders]
        st.dataframe(pd.DataFrame(history_rows), use_container_width=True, hide_index=True)
    else:
        st.caption("История заказов пока пустая.")


def render_profile_page(service: WebStockSyncService, user: dict[str, Any]) -> None:
    render_header("Профиль", "Здесь хранится личная привязка к 1С. Пароль 1С сохраняется только на время текущей сессии браузера.")
    st.markdown(f"**Пользователь приложения:** {user.get('username')}  ")
    st.markdown(f"**Роль:** {ROLE_LABELS.get(str(user.get('role')), 'Пользователь')}  ")
    with st.form("profile_form"):
        full_name = st.text_input("Полное имя", value=str(user.get("full_name") or ""))
        onec_username = st.text_input("Логин 1С", value=str(user.get("onec_username") or ""))
        save_profile = st.form_submit_button("Сохранить профиль")
    if save_profile:
        try:
            updated = service.update_user_profile(user_id=int(user["id"]), full_name=full_name, onec_username=onec_username)
            st.session_state["auth_user"] = updated
            st.success("Профиль обновлен.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))
    with st.form("onec_session_form"):
        onec_password = st.text_input("Пароль 1С для текущей сессии", type="password", value=st.session_state.get("onec_password", ""))
        save_password = st.form_submit_button("Запомнить пароль в сессии")
    if save_password:
        st.session_state["onec_password"] = onec_password
        st.success("Пароль 1С сохранен для текущей сессии браузера.")
    if st.button("Проверить доступ к 1С", use_container_width=True):
        try:
            result = service.test_user_onec_access(onec_username=str(st.session_state["auth_user"].get("onec_username") or ""), onec_password=st.session_state.get("onec_password", ""))
            st.success(f"Подключение к 1С работает. Контрагенты: {result['counterparties']}, организации: {result['organizations']}.")
        except Exception as exc:
            st.error(str(exc))


def render_settings_page(service: WebStockSyncService, user: dict[str, Any]) -> None:
    render_header("Настройки", "Системные параметры для интеграции с 1С и управление пользователями приложения.")
    if not is_admin(user):
        st.error("Этот раздел доступен только администратору.")
        return
    settings = service.get_system_settings()
    with st.form("system_settings_form"):
        values: dict[str, str] = {}
        left, right = st.columns(2)
        for index, (key, label) in enumerate(SYSTEM_SETTING_FIELDS):
            target = left if index % 2 == 0 else right
            values[key] = target.text_input(label, value=str(settings.get(key, "")), key=f"sys_{key}")
        save_settings = st.form_submit_button("Сохранить системные настройки", use_container_width=True)
    if save_settings:
        try:
            service.save_system_settings(values)
            st.success("Системные настройки сохранены.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))
    st.subheader("Пользователи приложения")
    users = service.list_users()
    if users:
        st.dataframe(pd.DataFrame(users), use_container_width=True, hide_index=True)
    with st.form("create_user_form"):
        st.markdown("#### Создать пользователя")
        col1, col2 = st.columns(2)
        new_username = col1.text_input("Логин нового пользователя")
        new_full_name = col2.text_input("Полное имя")
        col1, col2 = st.columns(2)
        new_password = col1.text_input("Стартовый пароль", type="password")
        new_role = col2.selectbox("Роль", ["manager", "admin"], format_func=lambda value: ROLE_LABELS[value])
        create_user_button = st.form_submit_button("Создать пользователя", use_container_width=True)
    if create_user_button:
        try:
            service.create_user(username=new_username, password=new_password, role=new_role, full_name=new_full_name)
            st.success("Пользователь создан.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))
    if users:
        user_options = {f"{row['username']} ({ROLE_LABELS.get(row['role'], row['role'])})": row for row in users}
        selected_label = st.selectbox("Изменить пользователя", list(user_options.keys()), key="manage_user_select")
        selected_user = user_options[selected_label]
        with st.form("manage_user_form"):
            role = st.selectbox("Роль", ["manager", "admin"], index=0 if selected_user["role"] == "manager" else 1, format_func=lambda value: ROLE_LABELS[value])
            is_active = st.checkbox("Активен", value=bool(selected_user.get("is_active", 1)))
            new_password = st.text_input("Новый пароль (если нужно сбросить)", type="password")
            save_account = st.form_submit_button("Сохранить изменения", use_container_width=True)
        if save_account:
            try:
                service.update_user_account(user_id=int(selected_user["id"]), role=role, is_active=is_active)
                if new_password.strip():
                    service.reset_user_password(user_id=int(selected_user["id"]), new_password=new_password)
                st.success("Данные пользователя обновлены.")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))


def main() -> None:
    init_session_state()
    user = current_user()
    if not user and TEST_MODE_NO_LOGIN:
        user = auto_login_test_admin()
    if not user:
        show_login(SERVICE)
        return
    page = show_sidebar(user)
    if page == "Остатки":
        render_stock_page(SERVICE)
    elif page == "Работа со счетом":
        render_orders_page(SERVICE, user)
    elif page == "Заказы":
        render_orders_page(SERVICE, user)
    elif page == "Справочники":
        render_refs_page(SERVICE, user)
    elif page == "Настройки":
        render_settings_page(SERVICE, user)
    elif page == "Работа с прайсом":
        render_price_page(SERVICE, user)


main()
