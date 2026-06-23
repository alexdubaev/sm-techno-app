from __future__ import annotations

import threading
import tkinter as tk
from datetime import date
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Any, Callable

from PIL import Image, ImageOps, ImageTk
from stock_sync_desktop.onec_api import OneCClient, OneCClientError
from stock_sync_desktop.service import DraftLine, StockSyncService


SETTINGS_FIELDS: list[tuple[str, str]] = [
    ("base_url", "URL базы 1С"),
    ("username", "Логин OData"),
    ("password", "Пароль OData"),
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

CONNECTION_FIELDS = SETTINGS_FIELDS[:4]
ORDER_SETTINGS_FIELDS = SETTINGS_FIELDS[4:]
EMPTY_CONTRACT_OPTION = "Без договора"
DEFAULT_ORG_OPTION = "Организация по умолчанию (из настроек)"
ALL_CATEGORIES_OPTION = "Все категории"


class StockSyncDesktopApp:
    def __init__(self, root: tk.Tk | None = None, service: StockSyncService | None = None) -> None:
        self.root = root or tk.Tk()
        self.service = service or StockSyncService()

        self.root.title("1С УНФ · локальный прайс и заказы")
        self.root.geometry("1480x940")
        self.root.minsize(1180, 760)
        self.assets_dir = Path(__file__).resolve().parent / "assets"

        self.colors = {
            "bg": "#f4f1eb",
            "surface": "#ffffff",
            "surface_alt": "#fbfaf8",
            "border": "#d8d2c8",
            "ink": "#1f2a37",
            "muted": "#5d6b7b",
            "header": "#243b53",
            "header_accent": "#e6a95c",
            "accent": "#b45309",
            "success": "#2f855a",
            "danger": "#c53030",
        }

        self.status_var = tk.StringVar(value="Готово к работе.")
        self.stock_count_var = tk.StringVar(value="0")
        self.stock_quantity_var = tk.StringVar(value="0")
        self.stock_unlinked_var = tk.StringVar(value="0")
        self.order_summary_var = tk.StringVar(value="Черновик пуст.")
        self.selected_item_info_var = tk.StringVar(
            value="Выбери товар в таблице, чтобы увидеть артикул, категорию, группу и ключи 1С."
        )
        self.refs_summary_var = tk.StringVar(value="Справочники пока не загружены.")
        self.sidebar_status_var = tk.StringVar(value="1С подключена")
        self.is_busy = False
        self._stock_filter_after_id: str | None = None
        self._simple_stock_filter_after_id: str | None = None

        self.settings_vars = {key: tk.StringVar() for key, _ in SETTINGS_FIELDS}
        self.counterparty_var = tk.StringVar()
        self.contract_var = tk.StringVar(value=EMPTY_CONTRACT_OPTION)
        self.organization_var = tk.StringVar()
        self.order_date_var = tk.StringVar(value=date.today().isoformat())
        self.comment_var = tk.StringVar()
        self.item_var = tk.StringVar()
        self.qty_var = tk.StringVar(value="1")
        self.price_var = tk.StringVar(value="0")
        self.stock_search_var = tk.StringVar()
        self.simple_stock_search_var = tk.StringVar()
        self.stock_category_var = tk.StringVar(value=ALL_CATEGORIES_OPTION)
        self.stock_only_unlinked_var = tk.BooleanVar(value=False)
        self.stock_quantity_edit_var = tk.StringVar(value="0")

        self.current_draft_lines: list[DraftLine] = []
        self.counterparty_by_label: dict[str, dict[str, Any]] = {}
        self.contract_by_label: dict[str, dict[str, Any]] = {}
        self.organization_by_label: dict[str, dict[str, Any]] = {}
        self.item_by_label: dict[str, dict[str, Any]] = {}
        self.item_by_id: dict[int, dict[str, Any]] = {}
        self.all_item_labels: list[str] = []
        self.stock_rows_cache: list[dict[str, Any]] = []
        self.brand_logo_photo: ImageTk.PhotoImage | None = None
        self.sidebar_logo_photo: ImageTk.PhotoImage | None = None
        self.window_icon_photo: ImageTk.PhotoImage | None = None
        self.page_frames: dict[str, tk.Frame] = {}
        self.nav_buttons: dict[str, dict[str, Any]] = {}
        self.active_page = "stock"

        self._load_brand_assets()
        self._configure_styles()
        self._build_ui()
        self._configure_clipboard_shortcuts()
        self._bind_live_filters()
        self._load_settings()
        self.refresh_all_lists()

    def run(self) -> None:
        self.root.mainloop()

    def _load_brand_assets(self) -> None:
        source_path = self.assets_dir / "company_logo_source.png"
        header_path = self.assets_dir / "company_logo_header.png"
        sidebar_path = self.assets_dir / "company_logo_sidebar.png"
        icon_path = self.assets_dir / "company_logo_icon.png"
        if not source_path.exists():
            return

        try:
            self.assets_dir.mkdir(parents=True, exist_ok=True)
            if not header_path.exists() or not sidebar_path.exists() or not icon_path.exists():
                with Image.open(source_path) as image:
                    header_crop = image.crop((220, 250, 1310, 675))
                    header_crop = ImageOps.contain(header_crop, (360, 140), method=Image.Resampling.LANCZOS)
                    header_crop.save(header_path)

                    sidebar_crop = image.crop((220, 250, 1310, 675))
                    sidebar_crop = ImageOps.contain(sidebar_crop, (165, 64), method=Image.Resampling.LANCZOS)
                    sidebar_crop.save(sidebar_path)

                    icon_crop = image.crop((210, 220, 690, 700))
                    icon_crop = ImageOps.contain(icon_crop, (96, 96), method=Image.Resampling.LANCZOS)
                    icon_canvas = Image.new("RGBA", (96, 96), (36, 59, 83, 255))
                    offset_x = (96 - icon_crop.width) // 2
                    offset_y = (96 - icon_crop.height) // 2
                    icon_canvas.paste(icon_crop.convert("RGBA"), (offset_x, offset_y))
                    icon_canvas.save(icon_path)

            with Image.open(header_path) as header_image:
                self.brand_logo_photo = ImageTk.PhotoImage(header_image.copy())
            with Image.open(sidebar_path) as sidebar_image:
                self.sidebar_logo_photo = ImageTk.PhotoImage(sidebar_image.copy())
            with Image.open(icon_path) as icon_image:
                self.window_icon_photo = ImageTk.PhotoImage(icon_image.copy())
            self.root.iconphoto(True, self.window_icon_photo)
        except Exception:
            self.brand_logo_photo = None
            self.sidebar_logo_photo = None
            self.window_icon_photo = None

    def _configure_styles(self) -> None:
        self.colors.update(
            {
                "bg": "#f6f8fc",
                "surface": "#ffffff",
                "surface_alt": "#f3f7ff",
                "border": "#e7edf5",
                "ink": "#1f2a44",
                "muted": "#73809a",
                "header": "#101b2d",
                "header_accent": "#f8fbff",
                "accent": "#2f72ff",
                "accent_soft": "#eaf2ff",
                "success": "#27c36a",
                "success_soft": "#e9f9ef",
                "warning": "#ff9f1c",
                "warning_soft": "#fff3e5",
                "danger": "#ff5f57",
                "danger_soft": "#fff0ef",
                "sidebar": "#ffffff",
                "sidebar_active": "#edf4ff",
                "sidebar_ink": "#33415c",
                "sidebar_active_ink": "#2f72ff",
            }
        )

        self.root.configure(bg=self.colors["bg"])
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure(".", font=("Segoe UI", 10), foreground=self.colors["ink"])
        style.configure("App.TFrame", background=self.colors["bg"])
        style.configure("SectionTitle.TLabel", background=self.colors["bg"], foreground=self.colors["ink"], font=("Segoe UI Semibold", 18))
        style.configure("Subtle.TLabel", background=self.colors["bg"], foreground=self.colors["muted"], font=("Segoe UI", 10))
        style.configure("CardTitle.TLabel", background=self.colors["surface"], foreground=self.colors["ink"], font=("Segoe UI Semibold", 11))
        style.configure("CardText.TLabel", background=self.colors["surface"], foreground=self.colors["muted"], font=("Segoe UI", 10))
        style.configure("Primary.TButton", background=self.colors["accent"], foreground="#ffffff", borderwidth=0, focuscolor="", padding=(16, 10))
        style.map("Primary.TButton", background=[("active", "#255ed8"), ("pressed", "#1f4fb6")])
        style.configure("SoftPrimary.TButton", background=self.colors["accent_soft"], foreground=self.colors["accent"], borderwidth=0, focuscolor="", padding=(16, 10))
        style.map("SoftPrimary.TButton", background=[("active", "#dfeaff"), ("pressed", "#d2e2ff")])
        style.configure("Outline.TButton", background=self.colors["surface"], foreground=self.colors["ink"], bordercolor=self.colors["border"], borderwidth=1, focuscolor="", padding=(14, 10))
        style.map("Outline.TButton", background=[("active", "#f9fbff")])
        style.configure("DangerGhost.TButton", background=self.colors["surface"], foreground=self.colors["danger"], bordercolor="#ffd7d4", borderwidth=1, focuscolor="", padding=(14, 10))
        style.map("DangerGhost.TButton", background=[("active", self.colors["danger_soft"])])
        style.configure("WarningGhost.TButton", background=self.colors["surface"], foreground=self.colors["warning"], bordercolor="#ffe1b3", borderwidth=1, focuscolor="", padding=(14, 10))
        style.map("WarningGhost.TButton", background=[("active", self.colors["warning_soft"])])
        style.configure("Treeview", rowheight=34, fieldbackground=self.colors["surface"], background=self.colors["surface"], foreground=self.colors["ink"], bordercolor=self.colors["border"])
        style.configure("Treeview.Heading", background="#f8faff", foreground=self.colors["muted"], font=("Segoe UI Semibold", 9), relief="flat")
        style.map("Treeview", background=[("selected", "#e9f2ff")], foreground=[("selected", self.colors["ink"])])
        style.configure("TEntry", fieldbackground=self.colors["surface"], bordercolor=self.colors["border"], padding=8)
        style.configure("TCombobox", fieldbackground=self.colors["surface"], bordercolor=self.colors["border"], padding=6)
        style.configure("TCheckbutton", background=self.colors["bg"], foreground=self.colors["muted"])

    def _build_ui(self) -> None:
        workspace = tk.Frame(self.root, bg=self.colors["bg"], padx=14, pady=14)
        workspace.pack(fill="both", expand=True)
        workspace.grid_columnconfigure(1, weight=1)
        workspace.grid_rowconfigure(0, weight=1)

        self.sidebar = self._create_card(workspace, bg=self.colors["sidebar"], pad=16)
        self.sidebar.grid(row=0, column=0, sticky="ns", padx=(0, 16))
        self.sidebar.configure(width=220)
        self.sidebar.grid_propagate(False)
        self.sidebar.grid_rowconfigure(2, weight=1)
        self._build_sidebar()

        self.content_host = tk.Frame(workspace, bg=self.colors["bg"])
        self.content_host.grid(row=0, column=1, sticky="nsew")
        self.content_host.grid_rowconfigure(0, weight=1)
        self.content_host.grid_columnconfigure(0, weight=1)

        self.price_tab = tk.Frame(self.content_host, bg=self.colors["bg"])
        self.stock_tab = tk.Frame(self.content_host, bg=self.colors["bg"])
        self.orders_tab = tk.Frame(self.content_host, bg=self.colors["bg"])
        self.refs_tab = tk.Frame(self.content_host, bg=self.colors["bg"])
        self.settings_tab = tk.Frame(self.content_host, bg=self.colors["bg"])

        self.page_frames = {
            "price": self.price_tab,
            "stock": self.stock_tab,
            "orders": self.orders_tab,
            "refs": self.refs_tab,
            "settings": self.settings_tab,
        }
        for frame in self.page_frames.values():
            frame.grid(row=0, column=0, sticky="nsew")

        self._build_price_work_tab()
        self._build_stock_tab()
        self._build_orders_tab()
        self._build_refs_tab()
        self._build_settings_tab()
        self._show_page("stock")

    def _create_card(self, parent: tk.Widget, *, bg: str | None = None, pad: int = 14) -> tk.Frame:
        card = tk.Frame(
            parent,
            bg=bg or self.colors["surface"],
            highlightthickness=1,
            highlightbackground=self.colors["border"],
            highlightcolor=self.colors["border"],
            bd=0,
            padx=pad,
            pady=pad,
        )
        return card

    def _create_labeled_card(self, parent: tk.Widget, title: str, subtitle: str) -> tk.Frame:
        card = self._create_card(parent)
        if title or subtitle:
            header = tk.Frame(card, bg=self.colors["surface"])
            header.grid(row=0, column=0, sticky="ew")
            if title:
                tk.Label(
                    header,
                    text=title,
                    bg=self.colors["surface"],
                    fg=self.colors["ink"],
                    font=("Segoe UI Semibold", 10),
                ).pack(anchor="w")
            if subtitle:
                ttk.Label(
                    header,
                    text=subtitle,
                    style="CardText.TLabel",
                    wraplength=420,
                    justify="left",
                ).pack(anchor="w", pady=(8, 0))
        return card

    def _build_sidebar(self) -> None:
        logo_card = tk.Frame(
            self.sidebar,
            bg=self.colors["header"],
            padx=12,
            pady=12,
            highlightthickness=1,
            highlightbackground="#223553",
            highlightcolor="#223553",
        )
        logo_card.grid(row=0, column=0, sticky="ew")
        if self.sidebar_logo_photo is not None:
            tk.Label(logo_card, image=self.sidebar_logo_photo, bg=self.colors["header"], bd=0).pack()
        elif self.brand_logo_photo is not None:
            tk.Label(logo_card, image=self.brand_logo_photo, bg=self.colors["header"], bd=0).pack()
        else:
            tk.Label(logo_card, text="СМ ТЕХНО", bg=self.colors["header"], fg="#f8d648", font=("Segoe UI Semibold", 16)).pack()

        nav_wrap = tk.Frame(self.sidebar, bg=self.colors["sidebar"])
        nav_wrap.grid(row=1, column=0, sticky="new", pady=(18, 0))
        for index, (page_key, label, icon_text) in enumerate(
            (
                ("stock", "Остатки", "▣"),
                ("price", "Работа с прайсом", "¤"),
                ("orders", "Заказы", "▤"),
                ("refs", "Справочники", "⌘"),
                ("settings", "Настройки", "◌"),
            )
        ):
            card = tk.Frame(nav_wrap, bg=self.colors["sidebar"], padx=10, pady=10, cursor="hand2")
            card.grid(row=index, column=0, sticky="ew", pady=(0, 10))
            icon = tk.Canvas(card, width=22, height=22, bg=self.colors["sidebar"], highlightthickness=0, bd=0)
            icon.grid(row=0, column=0, padx=(0, 10))
            icon.create_rectangle(3, 3, 19, 19, outline=self.colors["sidebar_ink"], width=1)
            icon.create_text(11, 11, text=icon_text, fill=self.colors["sidebar_ink"], font=("Segoe UI Symbol", 9))
            label_widget = tk.Label(
                card,
                text=label,
                bg=self.colors["sidebar"],
                fg=self.colors["sidebar_ink"],
                font=("Segoe UI Semibold", 10),
            )
            label_widget.grid(row=0, column=1, sticky="w")
            for widget in (card, icon, label_widget):
                widget.bind("<Button-1>", lambda _event, key=page_key: self._show_page(key))
            self.nav_buttons[page_key] = {"frame": card, "icon": icon, "label": label_widget, "icon_text": icon_text}
        nav_wrap.grid_columnconfigure(0, weight=1)

        bottom = tk.Frame(self.sidebar, bg=self.colors["sidebar"])
        bottom.grid(row=3, column=0, sticky="sew")
        ttk.Button(bottom, text="⤴  Импорт из Excel", style="Outline.TButton", command=self.import_stock_excel).pack(fill="x", pady=(0, 12))

        status_card = self._create_card(bottom, bg=self.colors["surface"], pad=12)
        status_card.pack(fill="x")
        dot = tk.Canvas(status_card, width=14, height=14, bg=self.colors["surface"], highlightthickness=0, bd=0)
        dot.grid(row=0, column=0, rowspan=2, padx=(0, 10), sticky="n")
        dot.create_oval(3, 3, 11, 11, fill=self.colors["success"], outline=self.colors["success"])
        tk.Label(status_card, text="Готов к работе", bg=self.colors["surface"], fg=self.colors["muted"], font=("Segoe UI", 9)).grid(row=0, column=1, sticky="w")
        tk.Label(status_card, textvariable=self.sidebar_status_var, bg=self.colors["surface"], fg=self.colors["ink"], font=("Segoe UI Semibold", 10), wraplength=150, justify="left").grid(row=1, column=1, sticky="w")

    def _show_page(self, page_key: str) -> None:
        self.active_page = page_key
        frame = self.page_frames[page_key]
        frame.tkraise()
        for key, button_parts in self.nav_buttons.items():
            frame_widget = button_parts["frame"]
            icon_widget = button_parts["icon"]
            label_widget = button_parts["label"]
            icon_text = button_parts["icon_text"]
            if key == page_key:
                bg = self.colors["sidebar_active"]
                fg = self.colors["sidebar_active_ink"]
            else:
                bg = self.colors["sidebar"]
                fg = self.colors["sidebar_ink"]
            frame_widget.configure(bg=bg)
            label_widget.configure(bg=bg, fg=fg)
            icon_widget.configure(bg=bg)
            icon_widget.delete("all")
            icon_widget.create_rectangle(3, 3, 19, 19, outline=fg, width=1)
            icon_widget.create_text(11, 11, text=icon_text, fill=fg, font=("Segoe UI Symbol", 9))

    def _create_page_shell(self, parent: tk.Frame, *, title: str, subtitle: str) -> tk.Frame:
        parent.grid_columnconfigure(0, weight=1)
        parent.grid_rowconfigure(1, weight=1)

        header = tk.Frame(parent, bg=self.colors["bg"])
        header.grid(row=0, column=0, sticky="ew", pady=(0, 18))
        header.grid_columnconfigure(0, weight=1)

        title_block = tk.Frame(header, bg=self.colors["bg"])
        title_block.grid(row=0, column=0, sticky="w")
        ttk.Label(title_block, text=title, style="SectionTitle.TLabel").pack(anchor="w")
        ttk.Label(title_block, text=subtitle, style="Subtle.TLabel", wraplength=760, justify="left").pack(anchor="w", pady=(8, 0))

        status_chip = self._create_card(header, bg=self.colors["surface"], pad=14)
        status_chip.grid(row=0, column=1, sticky="e")
        dot = tk.Canvas(status_chip, width=16, height=16, bg=self.colors["surface"], highlightthickness=0, bd=0)
        dot.grid(row=0, column=0, rowspan=2, padx=(0, 10), sticky="n")
        dot.create_oval(4, 4, 12, 12, fill=self.colors["success"], outline=self.colors["success"])
        tk.Label(status_chip, text="Статус", bg=self.colors["surface"], fg=self.colors["muted"], font=("Segoe UI", 9)).grid(row=0, column=1, sticky="w")
        tk.Label(status_chip, textvariable=self.status_var, bg=self.colors["surface"], fg=self.colors["ink"], font=("Segoe UI Semibold", 11), wraplength=210, justify="left").grid(row=1, column=1, sticky="w")

        body = tk.Frame(parent, bg=self.colors["bg"])
        body.grid(row=1, column=0, sticky="nsew")
        return body

    def _build_settings_tab(self) -> None:
        body = self._create_page_shell(
            self.settings_tab,
            title="Настройки",
            subtitle="Подключение к 1С, служебные ключи и параметры создания заказа.",
        )
        body.columnconfigure(0, weight=1)

        cards = tk.Frame(body, bg=self.colors["bg"])
        cards.grid(row=0, column=0, sticky="nsew")
        cards.grid_columnconfigure(0, weight=1)
        cards.grid_columnconfigure(1, weight=1)

        connection_card = self._create_labeled_card(cards, "Подключение к 1С", "Доступ к OData и организация по умолчанию.")
        connection_card.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        connection_card.grid_columnconfigure(1, weight=1)
        self._build_settings_fields(connection_card, CONNECTION_FIELDS)

        order_card = self._create_labeled_card(cards, "Параметры заказа", "Ключи и режимы, которые ожидает 1С при создании документа.")
        order_card.grid(row=0, column=1, sticky="nsew", padx=(10, 0))
        order_card.grid_columnconfigure(1, weight=1)
        self._build_settings_fields(order_card, ORDER_SETTINGS_FIELDS)

        note_card = self._create_labeled_card(
            body,
            "Подсказка",
            "GUID можно брать из живого документа ЗаказПокупателя в OData. Договор и организацию можно не указывать в форме, если вы добавляете их уже в самой 1С.",
        )
        note_card.grid(row=1, column=0, sticky="ew", pady=(16, 0))

        actions = tk.Frame(body, bg=self.colors["bg"])
        actions.grid(row=2, column=0, sticky="w", pady=(16, 0))
        ttk.Button(actions, text="Сохранить настройки", style="Primary.TButton", command=self.save_settings).pack(side="left")
        ttk.Button(actions, text="Проверить доступ к 1С", style="Outline.TButton", command=self.test_connection).pack(side="left", padx=(10, 0))

    def _build_settings_fields(self, parent: ttk.LabelFrame, fields: list[tuple[str, str]]) -> None:
        for row_index, (key, label) in enumerate(fields):
            grid_row = row_index + 1
            ttk.Label(parent, text=label, style="CardText.TLabel").grid(row=grid_row, column=0, sticky="w", padx=(0, 10), pady=6)
            show = "*" if key == "password" else ""
            entry = ttk.Entry(parent, textvariable=self.settings_vars[key], show=show)
            entry.grid(row=grid_row, column=1, sticky="ew", pady=6)
    def _build_price_work_tab(self) -> None:
        body = self._create_page_shell(
            self.price_tab,
            title="Работа с прайсом",
            subtitle="Импорт прайса, привязка к 1С, корректировка остатков и все действия по обслуживанию локального каталога.",
        )
        body.columnconfigure(0, weight=1)
        body.rowconfigure(2, weight=1)

        metrics = tk.Frame(body, bg=self.colors["bg"])
        metrics.grid(row=0, column=0, sticky="ew")
        for index in range(3):
            metrics.grid_columnconfigure(index, weight=1)
        self._build_metric_card(metrics, 0, "Позиции в каталоге", self.stock_count_var, icon_bg=self.colors["accent_soft"], icon_fg=self.colors["accent"], icon_text="□")
        self._build_metric_card(metrics, 1, "Суммарный остаток", self.stock_quantity_var, icon_bg=self.colors["success_soft"], icon_fg=self.colors["success"], icon_text="◔")
        self._build_metric_card(metrics, 2, "Еще не связаны с 1С", self.stock_unlinked_var, icon_bg=self.colors["warning_soft"], icon_fg=self.colors["warning"], icon_text="∞")

        toolbar_card = self._create_labeled_card(body, "Действия с каталогом", "")
        toolbar_card.grid(row=1, column=0, sticky="ew", pady=(16, 12))
        actions = tk.Frame(toolbar_card, bg=self.colors["surface"])
        actions.grid(row=1, column=0, sticky="w")
        ttk.Button(actions, text="↓  Скачать Excel-шаблон", style="Outline.TButton", command=self.export_template).pack(side="left", padx=(0, 10))
        ttk.Button(actions, text="⤴  Импортировать остатки", style="SoftPrimary.TButton", command=self.import_stock_excel).pack(side="left", padx=10)
        ttk.Button(actions, text="⇪  Выгрузить текущий срез", style="Outline.TButton", command=self.export_stock_snapshot).pack(side="left", padx=10)
        ttk.Button(actions, text="∞  Привязать к 1С", style="Outline.TButton", command=self.sync_items).pack(side="left", padx=10)
        ttk.Button(actions, text="✕  Удалить выбранные", style="DangerGhost.TButton", command=self.delete_selected_stock_items).pack(side="left", padx=10)
        ttk.Button(actions, text="△  Очистить каталог", style="WarningGhost.TButton", command=self.delete_all_stock_items).pack(side="left", padx=(10, 0))

        work = tk.Frame(body, bg=self.colors["bg"])
        work.grid(row=2, column=0, sticky="nsew")
        work.grid_columnconfigure(0, weight=4)
        work.grid_columnconfigure(1, weight=1)
        work.grid_rowconfigure(1, weight=1)

        filters_card = self._create_labeled_card(work, "Быстрые фильтры", "")
        filters_card.grid(row=0, column=0, sticky="ew", pady=(0, 12), padx=(0, 14))
        filters_card.grid_columnconfigure(0, weight=3)
        filters_card.grid_columnconfigure(2, weight=1)
        ttk.Entry(filters_card, textvariable=self.stock_search_var).grid(row=1, column=0, sticky="ew", padx=(0, 12))
        ttk.Label(filters_card, text="Категория", style="CardText.TLabel").grid(row=1, column=1, sticky="w", padx=(0, 8))
        self.stock_category_combo = ttk.Combobox(filters_card, textvariable=self.stock_category_var, state="readonly", values=[ALL_CATEGORIES_OPTION], width=22)
        self.stock_category_combo.grid(row=1, column=2, sticky="w")
        ttk.Checkbutton(filters_card, text="Только непривязанные к 1С", variable=self.stock_only_unlinked_var).grid(row=1, column=3, sticky="w", padx=(16, 0))

        detail_card = self._create_labeled_card(work, "Карточка выбранного товара", "")
        detail_card.grid(row=0, column=1, sticky="nsew", pady=(0, 12))
        ttk.Label(detail_card, textvariable=self.selected_item_info_var, style="CardText.TLabel", wraplength=290, justify="left").grid(row=1, column=0, sticky="w")

        tree_card = self._create_labeled_card(work, "Локальные товары", "")
        tree_card.grid(row=1, column=0, sticky="nsew", padx=(0, 14))
        tree_card.grid_columnconfigure(0, weight=1)
        tree_card.grid_rowconfigure(1, weight=1)

        self.stock_tree = ttk.Treeview(tree_card, columns=("sku", "name", "category", "group", "quantity", "price", "onec_key", "unit_key"), show="headings", selectmode="extended")
        stock_columns = {
            "sku": ("Артикул", 95, "w"),
            "name": ("Наименование", 260, "w"),
            "category": ("Категория", 120, "w"),
            "group": ("Группа", 90, "w"),
            "quantity": ("Остаток", 80, "e"),
            "price": ("Цена", 95, "e"),
            "onec_key": ("Ключ 1С", 170, "w"),
            "unit_key": ("Unit key", 170, "w"),
        }
        for key, (title, width, anchor) in stock_columns.items():
            self.stock_tree.heading(key, text=title)
            self.stock_tree.column(key, width=width, anchor=anchor)
        self.stock_tree.grid(row=1, column=0, sticky="nsew")
        self.stock_tree.bind("<<TreeviewSelect>>", self.on_stock_selection_changed)
        stock_scroll = ttk.Scrollbar(tree_card, orient="vertical", command=self.stock_tree.yview)
        stock_scroll.grid(row=1, column=1, sticky="ns")
        stock_xscroll = ttk.Scrollbar(tree_card, orient="horizontal", command=self.stock_tree.xview)
        stock_xscroll.grid(row=2, column=0, sticky="ew", pady=(8, 0))
        self.stock_tree.configure(yscrollcommand=stock_scroll.set, xscrollcommand=stock_xscroll.set)

        adjust_card = self._create_labeled_card(work, "Ручная корректировка остатка", "Можно быстро проставить остаток для выбранной позиции без повторного импорта Excel.")
        adjust_card.grid(row=1, column=1, sticky="nsew")
        ttk.Label(adjust_card, text="Новый остаток", style="CardText.TLabel").grid(row=2, column=0, sticky="w", pady=(8, 6))
        ttk.Entry(adjust_card, textvariable=self.stock_quantity_edit_var).grid(row=3, column=0, sticky="ew")
        ttk.Button(adjust_card, text="Сохранить остаток", style="SoftPrimary.TButton", command=self.update_selected_stock).grid(row=4, column=0, sticky="ew", pady=(14, 0))

    def _build_stock_tab(self) -> None:
        body = self._create_page_shell(
            self.stock_tab,
            title="Остатки",
            subtitle="Быстрый поиск по локальному каталогу без действий по прайсу, синхронизации и ручного обслуживания.",
        )
        body.columnconfigure(0, weight=1)
        body.rowconfigure(1, weight=1)

        search_card = self._create_labeled_card(body, "Поиск по локальным товарам", "")
        search_card.grid(row=0, column=0, sticky="ew", pady=(0, 14))
        search_card.grid_columnconfigure(0, weight=1)
        ttk.Entry(search_card, textvariable=self.simple_stock_search_var).grid(row=1, column=0, sticky="ew")

        tree_card = self._create_labeled_card(body, "Список локальных товаров", "")
        tree_card.grid(row=1, column=0, sticky="nsew")
        tree_card.grid_columnconfigure(0, weight=1)
        tree_card.grid_rowconfigure(1, weight=1)

        self.simple_stock_tree = ttk.Treeview(
            tree_card,
            columns=("sku", "name", "category", "group", "quantity", "price"),
            show="headings",
        )
        stock_columns = {
            "sku": ("Артикул", 120, "w"),
            "name": ("Наименование", 420, "w"),
            "category": ("Категория", 140, "w"),
            "group": ("Группа", 120, "w"),
            "quantity": ("Остаток", 110, "e"),
            "price": ("Цена", 120, "e"),
        }
        for key, (title, width, anchor) in stock_columns.items():
            self.simple_stock_tree.heading(key, text=title)
            self.simple_stock_tree.column(key, width=width, anchor=anchor)
        self.simple_stock_tree.grid(row=1, column=0, sticky="nsew")

        stock_scroll = ttk.Scrollbar(tree_card, orient="vertical", command=self.simple_stock_tree.yview)
        stock_scroll.grid(row=1, column=1, sticky="ns")
        stock_xscroll = ttk.Scrollbar(tree_card, orient="horizontal", command=self.simple_stock_tree.xview)
        stock_xscroll.grid(row=2, column=0, sticky="ew", pady=(8, 0))
        self.simple_stock_tree.configure(yscrollcommand=stock_scroll.set, xscrollcommand=stock_xscroll.set)

    def _build_refs_tab(self) -> None:
        body = self._create_page_shell(
            self.refs_tab,
            title="Справочники из 1С",
            subtitle="Контрагенты, договоры и организации, которые участвуют в заказах.",
        )
        body.columnconfigure(0, weight=1)
        body.rowconfigure(1, weight=1)

        toolbar = self._create_labeled_card(body, "Синхронизация", "")
        toolbar.grid(row=0, column=0, sticky="ew")
        action_row = tk.Frame(toolbar, bg=self.colors["surface"])
        action_row.grid(row=1, column=0, sticky="w")
        ttk.Button(action_row, text="Все три справочника", style="Primary.TButton", command=self.sync_all_references).pack(side="left", padx=(0, 10))
        ttk.Button(action_row, text="Контрагенты", style="Outline.TButton", command=self.sync_counterparties).pack(side="left", padx=10)
        ttk.Button(action_row, text="Договоры", style="Outline.TButton", command=self.sync_contracts).pack(side="left", padx=10)
        ttk.Button(action_row, text="Организации", style="Outline.TButton", command=self.sync_organizations).pack(side="left", padx=10)
        ttk.Label(toolbar, textvariable=self.refs_summary_var, style="CardText.TLabel").grid(row=2, column=0, sticky="w", pady=(12, 0))

        panels = tk.Frame(body, bg=self.colors["bg"])
        panels.grid(row=1, column=0, sticky="nsew", pady=(14, 0))
        panels.grid_columnconfigure(0, weight=1)
        panels.grid_columnconfigure(1, weight=1)
        panels.grid_columnconfigure(2, weight=1)
        panels.grid_rowconfigure(0, weight=1)

        cp_frame = self._build_tree_card(panels, title="Контрагенты", subtitle="Кого выбираем в заказе")
        self.counterparty_tree = ttk.Treeview(cp_frame, columns=("name", "inn", "onec_key"), show="headings")
        for column, title, width in (("name", "Наименование", 280), ("inn", "ИНН", 140), ("onec_key", "Ключ 1С", 240)):
            self.counterparty_tree.heading(column, text=title)
            self.counterparty_tree.column(column, width=width, anchor="w")
        self.counterparty_tree.grid(row=1, column=0, sticky="nsew")
        cp_scroll = ttk.Scrollbar(cp_frame, orient="vertical", command=self.counterparty_tree.yview)
        cp_scroll.grid(row=1, column=1, sticky="ns")
        self.counterparty_tree.configure(yscrollcommand=cp_scroll.set)

        contract_frame = self._build_tree_card(panels, title="Договоры", subtitle="Опционально, если нужно подставлять сразу")
        self.contract_tree = ttk.Treeview(contract_frame, columns=("name", "number", "counterparty"), show="headings")
        for column, title, width in (("name", "Наименование", 280), ("number", "Номер", 130), ("counterparty", "Контрагент_Key", 220)):
            self.contract_tree.heading(column, text=title)
            self.contract_tree.column(column, width=width, anchor="w")
        self.contract_tree.grid(row=1, column=0, sticky="nsew")
        contract_scroll = ttk.Scrollbar(contract_frame, orient="vertical", command=self.contract_tree.yview)
        contract_scroll.grid(row=1, column=1, sticky="ns")
        self.contract_tree.configure(yscrollcommand=contract_scroll.set)

        org_frame = self._build_tree_card(panels, title="Организации", subtitle="Что можно подставлять в шапку заказа")
        self.organization_tree = ttk.Treeview(org_frame, columns=("name", "inn", "onec_key"), show="headings")
        for column, title, width in (("name", "Наименование", 240), ("inn", "ИНН", 140), ("onec_key", "Ключ 1С", 240)):
            self.organization_tree.heading(column, text=title)
            self.organization_tree.column(column, width=width, anchor="w")
        self.organization_tree.grid(row=1, column=0, sticky="nsew")
        org_scroll = ttk.Scrollbar(org_frame, orient="vertical", command=self.organization_tree.yview)
        org_scroll.grid(row=1, column=1, sticky="ns")
        self.organization_tree.configure(yscrollcommand=org_scroll.set)

        cp_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        contract_frame.grid(row=0, column=1, sticky="nsew", padx=10)
        org_frame.grid(row=0, column=2, sticky="nsew", padx=(10, 0))
    def _build_orders_tab(self) -> None:
        body = self._create_page_shell(
            self.orders_tab,
            title="Заказы",
            subtitle="Собираем заказ из локального каталога и отправляем его в 1С. Если товара там еще нет, приложение попробует создать номенклатуру автоматически.",
        )
        body.columnconfigure(0, weight=1)
        body.rowconfigure(2, weight=1)

        order_head = self._create_labeled_card(body, "Шапка заказа", "")
        order_head.grid(row=0, column=0, sticky="ew")
        for idx in range(4):
            order_head.grid_columnconfigure(idx, weight=1)
        ttk.Label(order_head, text="Контрагент", style="CardText.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 10), pady=6)
        ttk.Label(order_head, text="Договор", style="CardText.TLabel").grid(row=0, column=1, sticky="w", padx=(10, 10), pady=6)
        ttk.Label(order_head, text="Организация", style="CardText.TLabel").grid(row=0, column=2, sticky="w", padx=(10, 10), pady=6)
        ttk.Label(order_head, text="Дата", style="CardText.TLabel").grid(row=0, column=3, sticky="w", padx=(10, 0), pady=6)

        self.counterparty_combo = ttk.Combobox(order_head, textvariable=self.counterparty_var, state="readonly")
        self.counterparty_combo.grid(row=1, column=0, sticky="ew", padx=(0, 10), pady=4)
        self.counterparty_combo.bind("<<ComboboxSelected>>", self.on_counterparty_changed)
        self.contract_combo = ttk.Combobox(order_head, textvariable=self.contract_var, state="readonly")
        self.contract_combo.grid(row=1, column=1, sticky="ew", padx=(10, 10), pady=4)
        self.organization_combo = ttk.Combobox(order_head, textvariable=self.organization_var, state="readonly")
        self.organization_combo.grid(row=1, column=2, sticky="ew", padx=(10, 10), pady=4)
        ttk.Entry(order_head, textvariable=self.order_date_var).grid(row=1, column=3, sticky="ew", padx=(10, 0), pady=4)
        ttk.Label(order_head, text="Комментарий", style="CardText.TLabel").grid(row=2, column=0, sticky="w", pady=(12, 6))
        ttk.Entry(order_head, textvariable=self.comment_var).grid(row=3, column=0, columnspan=4, sticky="ew")

        line_builder = self._create_labeled_card(body, "Добавление строк", "")
        line_builder.grid(row=1, column=0, sticky="ew", pady=(12, 12))
        line_builder.grid_columnconfigure(0, weight=1)
        ttk.Label(line_builder, text="Товар", style="CardText.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 10), pady=6)
        ttk.Label(line_builder, text="Количество", style="CardText.TLabel").grid(row=0, column=1, sticky="w", padx=(10, 10), pady=6)
        ttk.Label(line_builder, text="Цена", style="CardText.TLabel").grid(row=0, column=2, sticky="w", padx=(10, 10), pady=6)

        self.item_combo = ttk.Combobox(line_builder, textvariable=self.item_var)
        self.item_combo.grid(row=1, column=0, sticky="ew", padx=(0, 10), pady=4)
        self.item_combo.bind("<<ComboboxSelected>>", self.on_item_changed)
        self.item_combo.bind("<KeyRelease>", self._filter_item_suggestions)
        ttk.Entry(line_builder, textvariable=self.qty_var, width=12).grid(row=1, column=1, sticky="w", padx=(10, 10), pady=4)
        ttk.Entry(line_builder, textvariable=self.price_var, width=14).grid(row=1, column=2, sticky="w", padx=(10, 10), pady=4)
        ttk.Button(line_builder, text="Добавить строку", style="Primary.TButton", command=self.add_draft_line).grid(row=1, column=3, padx=(10, 8), pady=4)
        ttk.Button(line_builder, text="Удалить выбранную", style="Outline.TButton", command=self.remove_draft_line).grid(row=1, column=4, padx=8, pady=4)
        ttk.Button(line_builder, text="Отправить в 1С", style="Primary.TButton", command=self.submit_order).grid(row=1, column=5, padx=(8, 0), pady=4)

        main = tk.Frame(body, bg=self.colors["bg"])
        main.grid(row=2, column=0, sticky="nsew")
        main.grid_columnconfigure(0, weight=1)
        main.grid_rowconfigure(0, weight=1)
        main.grid_rowconfigure(1, weight=1)

        draft_card = self._create_labeled_card(main, "Черновик заказа", "")
        draft_card.grid(row=0, column=0, sticky="nsew")
        draft_card.grid_columnconfigure(0, weight=1)
        draft_card.grid_rowconfigure(2, weight=1)
        ttk.Label(draft_card, textvariable=self.order_summary_var, style="CardText.TLabel").grid(row=0, column=0, sticky="w", pady=(0, 10))
        self.draft_tree = ttk.Treeview(draft_card, columns=("name", "qty", "price", "amount", "available"), show="headings")
        for column, title, width, anchor in (("name", "Товар", 420, "w"), ("qty", "Количество", 110, "e"), ("price", "Цена", 110, "e"), ("amount", "Сумма", 120, "e"), ("available", "Доступно", 110, "e")):
            self.draft_tree.heading(column, text=title)
            self.draft_tree.column(column, width=width, anchor=anchor)
        self.draft_tree.grid(row=2, column=0, sticky="nsew")
        draft_scroll = ttk.Scrollbar(draft_card, orient="vertical", command=self.draft_tree.yview)
        draft_scroll.grid(row=2, column=1, sticky="ns")
        self.draft_tree.configure(yscrollcommand=draft_scroll.set)

        history_card = self._create_labeled_card(main, "История заказов", "")
        history_card.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        history_card.grid_columnconfigure(0, weight=1)
        history_card.grid_rowconfigure(1, weight=1)
        self.orders_tree = ttk.Treeview(history_card, columns=("local_number", "counterparty", "status", "onec_number", "onec_date", "amount", "error"), show="headings")
        for column, title, width, anchor in (("local_number", "Локальный №", 160, "w"), ("counterparty", "Контрагент", 260, "w"), ("status", "Статус", 120, "w"), ("onec_number", "№ 1С", 120, "w"), ("onec_date", "Дата 1С", 150, "w"), ("amount", "Сумма", 110, "e"), ("error", "Ошибка", 360, "w")):
            self.orders_tree.heading(column, text=title)
            self.orders_tree.column(column, width=width, anchor=anchor)
        self.orders_tree.grid(row=1, column=0, sticky="nsew")
        history_scroll = ttk.Scrollbar(history_card, orient="vertical", command=self.orders_tree.yview)
        history_scroll.grid(row=1, column=1, sticky="ns")
        self.orders_tree.configure(yscrollcommand=history_scroll.set)
        self.orders_tree.tag_configure("posted", foreground=self.colors["success"])
        self.orders_tree.tag_configure("error", foreground=self.colors["danger"])

    def _build_metric_card(
        self,
        parent: tk.Frame,
        column: int,
        caption: str,
        value_var: tk.StringVar,
        *,
        icon_bg: str,
        icon_fg: str,
        icon_text: str,
    ) -> None:
        card = self._create_card(parent, pad=18)
        card.grid(row=0, column=column, sticky="ew", padx=(0 if column == 0 else 8, 0), pady=0)
        card.grid_columnconfigure(1, weight=1)
        icon_wrap = tk.Canvas(card, width=54, height=54, bg=self.colors["surface"], highlightthickness=0, bd=0)
        icon_wrap.grid(row=0, column=0, rowspan=2, sticky="w", padx=(0, 16))
        icon_wrap.create_oval(3, 3, 51, 51, fill=icon_bg, outline=icon_bg)
        icon_wrap.create_text(27, 27, text=icon_text, fill=icon_fg, font=("Segoe UI Semibold", 18))
        tk.Label(card, text=caption, bg=self.colors["surface"], fg=self.colors["muted"], font=("Segoe UI", 9)).grid(row=0, column=1, sticky="w")
        tk.Label(card, textvariable=value_var, bg=self.colors["surface"], fg=self.colors["ink"], font=("Segoe UI Semibold", 23)).grid(row=1, column=1, sticky="w", pady=(6, 0))

    def _build_tree_card(self, parent: tk.Frame, *, title: str, subtitle: str) -> tk.Frame:
        frame = self._create_labeled_card(parent, title, subtitle)
        frame.grid_columnconfigure(0, weight=1)
        frame.grid_rowconfigure(1, weight=1)
        return frame

    def _bind_live_filters(self) -> None:
        self.stock_search_var.trace_add("write", lambda *_: self._schedule_stock_refresh())
        self.simple_stock_search_var.trace_add("write", lambda *_: self._schedule_simple_stock_refresh())
        self.stock_category_var.trace_add("write", lambda *_: self.refresh_stock_tree())
        self.stock_only_unlinked_var.trace_add("write", lambda *_: self.refresh_stock_tree())

    def _schedule_stock_refresh(self) -> None:
        if not hasattr(self, "stock_tree"):
            return
        if self._stock_filter_after_id:
            self.root.after_cancel(self._stock_filter_after_id)
        self._stock_filter_after_id = self.root.after(140, self.refresh_stock_tree)

    def _schedule_simple_stock_refresh(self) -> None:
        if not hasattr(self, "simple_stock_tree"):
            return
        if self._simple_stock_filter_after_id:
            self.root.after_cancel(self._simple_stock_filter_after_id)
        self._simple_stock_filter_after_id = self.root.after(140, self.refresh_simple_stock_tree)

    def _configure_clipboard_shortcuts(self) -> None:
        self.root.bind_all("<Control-KeyPress>", self._handle_ctrl_shortcut, add=True)

    def _handle_ctrl_shortcut(self, event: tk.Event) -> str | None:
        action = self._detect_shortcut_action(event)
        if not action:
            return None
        widget = self.root.focus_get()
        if widget is None:
            return None
        if action == "copy":
            self._copy_selection(widget)
            return "break"
        if action == "cut":
            self._cut_selection(widget)
            return "break"
        if action == "paste":
            self._paste_clipboard(widget)
            return "break"
        if action == "select_all":
            self._select_all(widget)
            return "break"
        return None

    def _detect_shortcut_action(self, event: tk.Event) -> str | None:
        keysym = (getattr(event, "keysym", "") or "").lower()
        return {
            "c": "copy",
            "с": "copy",
            "x": "cut",
            "ч": "cut",
            "v": "paste",
            "м": "paste",
            "a": "select_all",
            "ф": "select_all",
        }.get(keysym)

    @staticmethod
    def _widget_state(widget: Any) -> str:
        try:
            return str(widget.cget("state"))
        except Exception:
            return "normal"

    def _copy_selection(self, widget: Any) -> None:
        try:
            widget.event_generate("<<Copy>>")
        except Exception:
            pass

    def _cut_selection(self, widget: Any) -> None:
        if self._widget_state(widget) in {"disabled", "readonly"}:
            self._copy_selection(widget)
            return
        try:
            widget.event_generate("<<Cut>>")
        except Exception:
            pass

    def _paste_clipboard(self, widget: Any) -> None:
        if self._widget_state(widget) in {"disabled", "readonly"}:
            return
        try:
            widget.event_generate("<<Paste>>")
        except Exception:
            pass

    def _select_all(self, widget: Any) -> None:
        try:
            if isinstance(widget, tk.Text):
                widget.tag_add("sel", "1.0", "end")
            else:
                widget.selection_range(0, tk.END)
                widget.icursor(tk.END)
        except Exception:
            pass

    def _load_settings(self) -> None:
        values = self.service.get_settings()
        for key, _ in SETTINGS_FIELDS:
            self.settings_vars[key].set(values.get(key, ""))

    def save_settings(self) -> None:
        payload = {key: self.settings_vars[key].get().strip() for key, _ in SETTINGS_FIELDS}
        self.service.save_settings(payload)
        self.set_status("Настройки сохранены.")
        self.refresh_order_form_options()
        messagebox.showinfo("Настройки сохранены", "Параметры подключения и заказа обновлены.")

    def test_connection(self) -> None:
        snapshot = {key: self.settings_vars[key].get().strip() for key, _ in SETTINGS_FIELDS}
        self._run_action_async("Проверяю доступ к 1С...", lambda: self._test_connection_impl(snapshot), on_success=self._after_test_connection)

    def _test_connection_impl(self, settings_snapshot: dict[str, str]) -> dict[str, int]:
        client = OneCClient(base_url=settings_snapshot["base_url"], username=settings_snapshot["username"], password=settings_snapshot["password"])
        counterparties = client.fetch_entity("Catalog_Контрагенты", top=1)
        organizations = client.fetch_entity("Catalog_Организации", top=1)
        return {"counterparties": len(counterparties), "organizations": len(organizations)}

    def _after_test_connection(self, result: dict[str, int]) -> None:
        self.set_status("Подключение к 1С работает.")
        messagebox.showinfo("Подключение успешно", f"1С ответила корректно.\n\nКонтрагенты в тестовом запросе: {result['counterparties']}\nОрганизации в тестовом запросе: {result['organizations']}")

    def export_template(self) -> None:
        path = filedialog.asksaveasfilename(title="Сохранить шаблон Excel", defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")], initialfile="stock_template.xlsx")
        if not path:
            return
        created = self.service.create_template(path)
        self.set_status(f"Шаблон сохранен: {created.name}")
        messagebox.showinfo("Шаблон готов", f"Excel-шаблон сохранен:\n{created}")

    def import_stock_excel(self) -> None:
        path = filedialog.askopenfilename(title="Выбери файл с остатками", filetypes=[("Excel и CSV", "*.xlsx *.csv"), ("Все файлы", "*.*")])
        if not path:
            return
        self._run_action_async("Импортирую локальные остатки...", lambda: self.service.import_stock_excel(path), on_success=lambda result: self._after_import_stock(path, result))

    def _after_import_stock(self, path: str, result: tuple[int, int]) -> None:
        created, updated = result
        self.refresh_all_lists()
        self.set_status(f"Импорт завершен. Создано: {created}, обновлено: {updated}.")
        messagebox.showinfo("Импорт завершен", f"Файл: {Path(path).name}\nСоздано позиций: {created}\nОбновлено позиций: {updated}")

    def export_stock_snapshot(self) -> None:
        path = filedialog.asksaveasfilename(title="Сохранить текущий срез каталога", defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")], initialfile="stock_snapshot.xlsx")
        if not path:
            return
        created = self.service.export_stock_snapshot(path)
        self.set_status(f"Срез каталога выгружен: {created.name}")
        messagebox.showinfo("Выгрузка готова", f"Текущий срез локального каталога сохранен:\n{created}")

    def update_selected_stock(self) -> None:
        selection = self.stock_tree.selection()
        if len(selection) != 1:
            messagebox.showwarning("Нужен выбор", "Выбери одну позицию в таблице остатков.")
            return
        try:
            item_id = int(selection[0])
            quantity = self._parse_float(self.stock_quantity_edit_var.get(), "остаток")
            self.service.set_stock_quantity(item_id, quantity)
        except Exception as exc:
            messagebox.showerror("Ошибка", str(exc))
            return
        self.refresh_all_lists()
        self.set_status("Остаток обновлен.")

    def delete_selected_stock_items(self) -> None:
        selection = self.stock_tree.selection()
        if not selection:
            messagebox.showwarning("Нечего удалять", "Сначала выдели одну или несколько позиций.")
            return
        item_ids = [int(item_id) for item_id in selection]
        if not messagebox.askyesno("Удалить выбранные", f"Удалить выбранные позиции: {len(item_ids)} шт.?\n\nЕсли товар уже участвовал в заказах, история сохранится, но позиция исчезнет из локального каталога."):
            return
        result = self.service.delete_local_items(item_ids)
        self._remove_deleted_items_from_draft(item_ids)
        self.refresh_all_lists()
        self.set_status(f"Удалено: {result['deleted']}, скрыто из каталога: {result['hidden']}.")
        messagebox.showinfo("Удаление завершено", f"Удалено полностью: {result['deleted']}\nСкрыто с сохранением истории: {result['hidden']}")

    def delete_all_stock_items(self) -> None:
        if not self.stock_rows_cache:
            messagebox.showinfo("Каталог пуст", "Локальный каталог уже пуст.")
            return
        if not messagebox.askyesno("Очистить локальный каталог", "Очистить весь локальный каталог?\n\nПозиции, которые уже были в заказах, сохранят историю, но будут скрыты из рабочего списка."):
            return
        result = self.service.delete_all_local_items()
        self.current_draft_lines.clear()
        self.refresh_all_lists()
        self.set_status(f"Каталог очищен. Удалено: {result['deleted']}, скрыто: {result['hidden']}.")
        messagebox.showinfo("Каталог очищен", f"Удалено полностью: {result['deleted']}\nСкрыто с сохранением истории: {result['hidden']}")

    def _remove_deleted_items_from_draft(self, item_ids: list[int]) -> None:
        item_id_set = set(item_ids)
        self.current_draft_lines = [line for line in self.current_draft_lines if line.item_id not in item_id_set]
        self.refresh_draft_lines()
    def sync_counterparties(self) -> None:
        self._run_sync("Синхронизирую контрагентов из 1С...", self.service.sync_counterparties, lambda count: f"Контрагенты обновлены: {count}")

    def sync_contracts(self) -> None:
        self._run_sync("Синхронизирую договоры из 1С...", self.service.sync_contracts, lambda count: f"Договоры обновлены: {count}")

    def sync_organizations(self) -> None:
        self._run_sync("Синхронизирую организации из 1С...", self.service.sync_organizations, lambda count: f"Организации обновлены: {count}")

    def sync_items(self) -> None:
        self._run_sync("Привязываю локальные товары к 1С...", self.service.sync_items, lambda count: f"Связи товаров с 1С обновлены: {count}")

    def sync_all_references(self) -> None:
        def task() -> dict[str, int]:
            return {
                "counterparties": self.service.sync_counterparties(),
                "contracts": self.service.sync_contracts(),
                "organizations": self.service.sync_organizations(),
            }
        self._run_action_async("Синхронизирую все основные справочники...", task, on_success=self._after_sync_all_references)

    def _after_sync_all_references(self, result: dict[str, int]) -> None:
        self.refresh_all_lists()
        messagebox.showinfo("Синхронизация завершена", f"Контрагенты: {result['counterparties']}\nДоговоры: {result['contracts']}\nОрганизации: {result['organizations']}")
        self.set_status("Основные справочники обновлены.")

    def _run_sync(self, status_message: str, action: Callable[[], int], success_text: Callable[[int], str]) -> None:
        self._run_action_async(status_message, action, on_success=lambda count: self._after_single_sync(count, success_text))

    def _after_single_sync(self, count: int, success_text: Callable[[int], str]) -> None:
        self.refresh_all_lists()
        self.set_status(success_text(count))
        messagebox.showinfo("Синхронизация завершена", success_text(count))

    def refresh_all_lists(self) -> None:
        self.stock_rows_cache = self.service.list_items()
        self.item_by_id = {int(row["id"]): row for row in self.stock_rows_cache}
        self.refresh_stock_tree()
        self.refresh_simple_stock_tree()
        self.refresh_reference_trees()
        self.refresh_order_form_options()
        self.refresh_orders_tree()
        self.refresh_draft_lines()

    def refresh_stock_tree(self) -> None:
        if self._stock_filter_after_id:
            self.root.after_cancel(self._stock_filter_after_id)
            self._stock_filter_after_id = None
        rows = self._get_filtered_stock_rows()
        self._refresh_stock_category_values()
        tree_rows = []
        for row in rows:
            tree_rows.append((str(row["id"]), (row.get("sku") or "", row.get("name") or "", row.get("category_name") or "", row.get("group_name") or "", self._format_quantity(row.get("quantity")), self._format_money(row.get("price")), row.get("onec_key") or "", row.get("unit_key") or "")))
        self._replace_tree_rows(self.stock_tree, tree_rows)
        self._refresh_stock_metrics(rows)
        self.selected_item_info_var.set("Выбери товар в таблице, чтобы увидеть артикул, категорию, группу и ключи 1С." if rows else "По текущим фильтрам ничего не найдено.")

    def refresh_simple_stock_tree(self) -> None:
        if self._simple_stock_filter_after_id:
            self.root.after_cancel(self._simple_stock_filter_after_id)
            self._simple_stock_filter_after_id = None
        rows = self._get_simple_stock_rows()
        tree_rows = []
        for row in rows:
            tree_rows.append(
                (
                    str(row["id"]),
                    (
                        row.get("sku") or "",
                        row.get("name") or "",
                        row.get("category_name") or "",
                        row.get("group_name") or "",
                        self._format_quantity(row.get("quantity")),
                        self._format_money(row.get("price")),
                    ),
                )
            )
        self._replace_tree_rows(self.simple_stock_tree, tree_rows)

    def _get_filtered_stock_rows(self) -> list[dict[str, Any]]:
        rows = list(self.stock_rows_cache)
        search = self.stock_search_var.get().strip().lower()
        category = self.stock_category_var.get().strip()
        only_unlinked = self.stock_only_unlinked_var.get()
        if search:
            rows = [row for row in rows if search in " ".join(str(row.get(field) or "") for field in ("sku", "name", "print_name", "category_name", "group_name")).lower()]
        if category and category != ALL_CATEGORIES_OPTION:
            rows = [row for row in rows if (row.get("category_name") or "") == category]
        if only_unlinked:
            rows = [row for row in rows if not (row.get("onec_key") or "").strip()]
        return rows

    def _get_simple_stock_rows(self) -> list[dict[str, Any]]:
        rows = list(self.stock_rows_cache)
        search = self.simple_stock_search_var.get().strip().lower()
        if search:
            rows = [
                row
                for row in rows
                if search
                in " ".join(
                    str(row.get(field) or "")
                    for field in ("sku", "name", "print_name", "category_name", "group_name")
                ).lower()
            ]
        return rows

    def _refresh_stock_category_values(self) -> None:
        categories = sorted({(row.get("category_name") or "").strip() for row in self.stock_rows_cache if (row.get("category_name") or "").strip()}, key=str.lower)
        values = [ALL_CATEGORIES_OPTION] + categories
        current = self.stock_category_var.get().strip() or ALL_CATEGORIES_OPTION
        self.stock_category_combo.configure(values=values)
        if current not in values:
            self.stock_category_var.set(ALL_CATEGORIES_OPTION)

    def _refresh_stock_metrics(self, rows: list[dict[str, Any]]) -> None:
        self.stock_count_var.set(str(len(rows)))
        total_quantity = sum(float(row.get("quantity") or 0) for row in rows)
        unlinked = sum(1 for row in rows if not (row.get("onec_key") or "").strip())
        self.stock_quantity_var.set(self._format_quantity(total_quantity))
        self.stock_unlinked_var.set(str(unlinked))

    def on_stock_selection_changed(self, _event: tk.Event | None = None) -> None:
        selection = self.stock_tree.selection()
        if len(selection) != 1:
            self.stock_quantity_edit_var.set("0")
            return
        item_id = int(selection[0])
        row = self.item_by_id.get(item_id)
        if not row:
            return
        self.stock_quantity_edit_var.set(self._format_raw_quantity(row.get("quantity")))
        self.selected_item_info_var.set(f"Артикул: {row.get('sku') or '—'}\nНаименование: {row.get('name') or '—'}\nПечать: {row.get('print_name') or row.get('name') or '—'}\nКатегория: {row.get('category_name') or '—'}\nГруппа: {row.get('group_name') or '—'}\nКлюч 1С: {row.get('onec_key') or 'не задан'}\nUnit key: {row.get('unit_key') or 'не задан'}")

    def refresh_reference_trees(self) -> None:
        counterparties = self.service.list_counterparties()
        contracts = self.service.list_contracts()
        organizations = self.service.list_organizations()
        self._replace_tree_rows(self.counterparty_tree, [(str(row["id"]), (row.get("name") or "", row.get("inn") or "", row.get("onec_key") or "")) for row in counterparties])
        self._replace_tree_rows(self.contract_tree, [(str(row["id"]), (row.get("name") or "", row.get("contract_number") or "", row.get("counterparty_key") or "")) for row in contracts])
        self._replace_tree_rows(self.organization_tree, [(str(row["id"]), (row.get("name") or "", row.get("inn") or "", row.get("onec_key") or "")) for row in organizations])
        self.refs_summary_var.set(f"Контрагентов: {len(counterparties)} · договоров: {len(contracts)} · организаций: {len(organizations)}")

    def refresh_order_form_options(self) -> None:
        counterparties = self.service.list_counterparties()
        self.counterparty_by_label = {}
        counterparty_labels: list[str] = []
        for row in counterparties:
            label = self._build_counterparty_label(row)
            self.counterparty_by_label[label] = row
            counterparty_labels.append(label)
        self.counterparty_combo.configure(values=counterparty_labels)
        if self.counterparty_var.get() not in counterparty_labels:
            self.counterparty_var.set(counterparty_labels[0] if counterparty_labels else "")

        selected_counterparty = self.counterparty_by_label.get(self.counterparty_var.get())
        counterparty_key = selected_counterparty.get("onec_key") if selected_counterparty else None
        contracts = self.service.list_contracts(counterparty_key)
        self.contract_by_label = {}
        contract_labels = [EMPTY_CONTRACT_OPTION]
        for row in contracts:
            label = self._build_contract_label(row)
            self.contract_by_label[label] = row
            contract_labels.append(label)
        self.contract_combo.configure(values=contract_labels)
        if self.contract_var.get() not in contract_labels:
            self.contract_var.set(EMPTY_CONTRACT_OPTION)

        organizations = self.service.list_organizations()
        self.organization_by_label = {}
        org_labels: list[str] = []
        for row in organizations:
            label = self._build_organization_label(row)
            self.organization_by_label[label] = row
            org_labels.append(label)
        if self.settings_vars["default_organization_key"].get().strip():
            org_labels = [DEFAULT_ORG_OPTION] + org_labels
        self.organization_combo.configure(values=org_labels)
        if self.organization_var.get() not in org_labels:
            self.organization_var.set(DEFAULT_ORG_OPTION if DEFAULT_ORG_OPTION in org_labels else (org_labels[0] if org_labels else ""))

        self.item_by_label = {}
        self.all_item_labels = []
        for row in self.stock_rows_cache:
            label = self._build_item_label(row)
            self.item_by_label[label] = row
            self.all_item_labels.append(label)
        self.item_combo.configure(values=self.all_item_labels[:200])

    def _filter_item_suggestions(self, _event: tk.Event | None = None) -> None:
        query = self.item_var.get().strip().lower()
        matches = self.all_item_labels[:200] if not query else [label for label in self.all_item_labels if query in label.lower()][:200]
        self.item_combo.configure(values=matches)

    def refresh_orders_tree(self) -> None:
        orders = self.service.list_orders()
        rows = []
        for row in orders:
            status = row.get("status") or ""
            tags: tuple[str, ...] = ()
            if status == "posted_to_1c":
                tags = ("posted",)
            elif status == "error":
                tags = ("error",)
            rows.append((str(row["id"]), (row.get("local_number") or "", row.get("counterparty_name") or "", status, row.get("onec_number") or "", row.get("onec_date") or "", self._format_money(row.get("total_amount")), row.get("error_message") or ""), tags))
        self._replace_tree_rows(self.orders_tree, rows)
    def on_counterparty_changed(self, _event: tk.Event | None = None) -> None:
        self.refresh_order_form_options()

    def on_item_changed(self, _event: tk.Event | None = None) -> None:
        row = self._resolve_item_from_input()
        if row and float(row.get("price") or 0) > 0:
            self.price_var.set(self._format_raw_quantity(row.get("price")))

    def _resolve_item_from_input(self) -> dict[str, Any] | None:
        text = self.item_var.get().strip()
        if not text:
            return None
        exact = self.item_by_label.get(text)
        if exact is not None:
            return exact
        lowered = text.lower()
        matches = [row for label, row in self.item_by_label.items() if lowered in label.lower()]
        return matches[0] if len(matches) == 1 else None

    def add_draft_line(self) -> None:
        try:
            row = self._resolve_item_from_input()
            if row is None:
                raise ValueError("Выбери товар из локального каталога. Если печатал вручную, уточни запрос, чтобы остался один вариант.")
            quantity = self._parse_float(self.qty_var.get(), "количество")
            if quantity <= 0:
                raise ValueError("Количество должно быть больше нуля.")
            price = self._parse_float(self.price_var.get(), "цена")
            if price < 0:
                raise ValueError("Цена не может быть отрицательной.")
        except Exception as exc:
            messagebox.showerror("Ошибка", str(exc))
            return

        for line in self.current_draft_lines:
            if line.item_id == int(row["id"]) and abs(line.price - price) < 0.000001:
                line.quantity = round(line.quantity + quantity, 4)
                line.amount = round(line.quantity * line.price, 2)
                self.refresh_draft_lines()
                self.qty_var.set("1")
                return

        self.current_draft_lines.append(DraftLine(item_id=int(row["id"]), quantity=quantity, price=price, amount=round(quantity * price, 2)))
        self.refresh_draft_lines()
        self.qty_var.set("1")

    def remove_draft_line(self) -> None:
        selection = self.draft_tree.selection()
        if not selection:
            messagebox.showwarning("Нечего удалять", "Сначала выдели строку в черновике заказа.")
            return
        indexes = sorted((int(item_id) for item_id in selection), reverse=True)
        for index in indexes:
            if 0 <= index < len(self.current_draft_lines):
                self.current_draft_lines.pop(index)
        self.refresh_draft_lines()

    def refresh_draft_lines(self) -> None:
        rows = []
        total_amount = 0.0
        total_quantity = 0.0
        for index, line in enumerate(self.current_draft_lines):
            item = self.item_by_id.get(line.item_id)
            name = item.get("name") if item else f"Товар #{line.item_id}"
            available = float(item.get("quantity") or 0) if item else 0.0
            rows.append((str(index), (name, self._format_quantity(line.quantity), self._format_money(line.price), self._format_money(line.amount), self._format_quantity(available))))
            total_amount += line.amount
            total_quantity += line.quantity
        self._replace_tree_rows(self.draft_tree, rows)
        self.order_summary_var.set("Черновик пуст." if not self.current_draft_lines else f"Строк: {len(self.current_draft_lines)} · Количество: {self._format_quantity(total_quantity)} · Сумма: {self._format_money(total_amount)}")

    def submit_order(self) -> None:
        if not self.current_draft_lines:
            messagebox.showwarning("Пустой заказ", "Сначала добавь хотя бы одну строку в заказ.")
            return
        counterparty = self.counterparty_by_label.get(self.counterparty_var.get().strip())
        if counterparty is None:
            messagebox.showwarning("Нет контрагента", "Выбери контрагента из списка.")
            return
        try:
            contract_id: int | None = None
            contract_label = self.contract_var.get().strip()
            if contract_label and contract_label != EMPTY_CONTRACT_OPTION:
                contract = self.contract_by_label.get(contract_label)
                if contract:
                    contract_id = int(contract["id"])

            organization_key: str | None = None
            org_label = self.organization_var.get().strip()
            if org_label and org_label != DEFAULT_ORG_OPTION:
                organization = self.organization_by_label.get(org_label)
                if organization:
                    organization_key = organization.get("onec_key") or None
            elif self.settings_vars["default_organization_key"].get().strip():
                organization_key = self.settings_vars["default_organization_key"].get().strip()

            order_date = self.order_date_var.get().strip()
            date.fromisoformat(order_date)
            comment = self.comment_var.get().strip()
            draft_lines = [DraftLine(item_id=line.item_id, quantity=line.quantity, price=line.price, amount=line.amount) for line in self.current_draft_lines]
        except Exception as exc:
            messagebox.showerror("Ошибка", "Дата должна быть в формате ГГГГ-ММ-ДД." if isinstance(exc, ValueError) and "isoformat" in repr(exc) else str(exc))
            return

        def task() -> tuple[int, dict[str, Any]]:
            return self.service.create_and_sync_order(counterparty_id=int(counterparty["id"]), contract_id=contract_id, organization_key=organization_key, order_date=order_date, comment=comment, draft_lines=draft_lines)

        self._run_action_async("Отправляю заказ в 1С...", task, on_success=self._after_submit_order)

    def _after_submit_order(self, result: tuple[int, dict[str, Any]]) -> None:
        order_id, created_doc = result
        self.current_draft_lines.clear()
        self.item_var.set("")
        self.qty_var.set("1")
        self.price_var.set("0")
        self.comment_var.set("")
        self.refresh_all_lists()
        number = created_doc.get("Number") or "без номера"
        doc_date = created_doc.get("Date") or ""
        self.set_status(f"Заказ отправлен в 1С: {number}")
        messagebox.showinfo("Заказ создан", f"Локальный заказ ID: {order_id}\nНомер в 1С: {number}\nДата в 1С: {doc_date}")

    def _replace_tree_rows(self, tree: ttk.Treeview, rows: list[tuple[str, tuple[Any, ...]] | tuple[str, tuple[Any, ...], tuple[str, ...]]]) -> None:
        for item in tree.get_children():
            tree.delete(item)
        for row in rows:
            if len(row) == 2:
                iid, values = row
                tree.insert("", "end", iid=iid, values=values)
            else:
                iid, values, tags = row
                tree.insert("", "end", iid=iid, values=values, tags=tags)

    def _build_counterparty_label(self, row: dict[str, Any]) -> str:
        base = row.get("name") or "Без названия"
        return f"{base} [{row['inn']}]" if row.get("inn") else f"{base} [ID {row['id']}]"

    def _build_contract_label(self, row: dict[str, Any]) -> str:
        base = row.get("name") or "Договор"
        number = row.get("contract_number")
        return f"{base} ({number})" if number else f"{base} [ID {row['id']}]"

    def _build_organization_label(self, row: dict[str, Any]) -> str:
        base = row.get("name") or "Организация"
        return f"{base} [{row['inn']}]" if row.get("inn") else f"{base} [ID {row['id']}]"

    def _build_item_label(self, row: dict[str, Any]) -> str:
        name = (row.get("name") or "").strip() or f"Товар #{row['id']}"
        sku = (row.get("sku") or "").strip()
        return f"{name} [{sku}]" if sku else f"{name} [ID {row['id']}]"

    @staticmethod
    def _format_quantity(value: Any) -> str:
        number = float(value or 0)
        if abs(number - round(number)) < 0.000001:
            return str(int(round(number)))
        return f"{number:.2f}"

    @staticmethod
    def _format_raw_quantity(value: Any) -> str:
        number = float(value or 0)
        return f"{number:.4f}".rstrip("0").rstrip(".") or "0"

    @staticmethod
    def _format_money(value: Any) -> str:
        return f"{float(value or 0):.2f}"

    @staticmethod
    def _parse_float(value: str, field_name: str) -> float:
        text = (value or "").strip().replace(",", ".")
        if not text:
            raise ValueError(f"Заполни поле '{field_name}'.")
        try:
            return float(text)
        except ValueError as exc:
            raise ValueError(f"Поле '{field_name}' должно быть числом.") from exc

    def set_status(self, message: str) -> None:
        self.status_var.set(message)
        lowered = message.lower()
        if lowered.startswith("ошибка"):
            self.sidebar_status_var.set("Проверь связь с 1С")
        elif any(word in lowered for word in ("проверяю", "синхронизир", "импортир", "отправляю", "выгружа")):
            self.sidebar_status_var.set("Операция выполняется")
        else:
            self.sidebar_status_var.set("1С подключена")

    def _run_action_async(self, status_message: str, action: Callable[[], Any], *, on_success: Callable[[Any], None] | None = None) -> None:
        if self.is_busy:
            self.set_status("Операция уже выполняется. Подожди, пожалуйста, пока она завершится.")
            return
        self.is_busy = True
        self.set_status(status_message)

        def worker() -> None:
            try:
                result = action()
            except Exception as exc:
                self.root.after(0, lambda: self._finish_async_error(exc))
                return
            self.root.after(0, lambda: self._finish_async_success(result, on_success))

        threading.Thread(target=worker, daemon=True).start()

    def _finish_async_success(self, result: Any, on_success: Callable[[Any], None] | None) -> None:
        self.is_busy = False
        try:
            if on_success is not None:
                on_success(result)
            else:
                self.set_status("Готово.")
        except Exception as exc:
            self._finish_async_error(exc)

    def _finish_async_error(self, exc: Exception) -> None:
        self.is_busy = False
        message = str(exc)
        self.set_status(f"Ошибка: {message}")
        messagebox.showerror("Ошибка 1С" if isinstance(exc, OneCClientError) else "Ошибка", message)
