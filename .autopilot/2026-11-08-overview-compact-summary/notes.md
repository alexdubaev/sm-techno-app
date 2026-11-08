# Актуальная поверхность кода

Read-only scout overview_context проверил main72be5a0a.
- dashboard.tsx: Dashboard, periods week/month/quarter/year, today через Intl/Europe/Moscow. shift:week±7дней, другие от первого числа ±1/3/12месяцев. Отображать response только если kind/anchorDate совпали. Нынешний отдельный header содержит только ссылку Мои продажи — причина пустой строки.
- lib/admin-dashboard-types.ts: SalesOverview.period/totals/series/managers/monthlyPlans/sources. managers salesTotal/count — выбранный период, monthlyPlans — month-anchor отдельно; link сохраняет monthlyPlans.month.
- lib/api.ts:fetchAdminSales(period,date), fetchAdminUsage/fetchAdminBalance; backend contracts не менять. tests/auth/test_admin_dashboard.py — настоящие ISOweek/month semantics, не пересчитывать на фронте.
- components/ui/dialog.tsx: controlled Dialog, DialogPortal, DialogPopup/DialogBackdrop иTitle/Description для полноэкранной панели. Native inputtype=date — существующий проектный паттерн; кастомный picker не обязателен.
- components/app-shell.tsx: глобальная навигация/chrome, не менять ради одного dashboard. Lucide иRecharts установлены. Мобильныйappheader ужеоколо65CSSpx инижняянавигациясуществует.
- tests/auth/admin-dashboard.integration.test.tsx — публичные render-сценарии; tests/e2e/admin-dashboard.spec.ts —periods,selected totals/plan150%; manager-bank-import.spec.ts —upload/history fromdashboard, manager link andrate override. «Мои продажи →», «Сегодня», «Предыдущий период»/«Следующий период», «Загрузить выписку»/«История выписок» — существующие доступные имена; визуальные короткие labels можно при сохранённом aria-label.
- После bank-import release main включает общие продажи без назначенного менеджера, file-only XLSX, INN/KPP resolver, sale_rate correction и перенос bankentryтольковdashboard, удалённый h1/subtitle. Их не откатывать.
