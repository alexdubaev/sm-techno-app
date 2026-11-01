# G02 — Перенос настройки iPhone

Owner quote2026-11-01: «Перенести этот пункт настройки для айфона в раздел настройки».

Known bounded follow-up from freshmain39e94e1; branchcodex/iphone-settings-placement, worktreeD:/codex-iphone-settings-placement-20261101. Existing owner small-change workflow: oneexecutor, affectedchecks, one bounded review only for UI access boundary. No new heavy AP/scout/spec ritual.

Scenario: logged-in admin/user opens Settings and manages ONLY personal phone connections there; stock valuation retains list/intake/results/twoExcel but no device configuration. Existing admin usermanagement/1C routes and APIs retain their gates. /settings becomes shared landing for personal controls, admin cards/data requested only foradmin; Settings nav becomes visible toexisting permitted employees. This is presentation placement preserving already-approved reader access, no API/schema/session/1C change. Prefer direct reusedpanel on Settings page; do not introduce new route/card/permissions unless necessary.

Productzone: sm-techno-web/app/settings/page.tsx; components/stock/stock-valuation-panel.tsx; components/navigation/app-navigation.tsx; optionally components/settings/shared/settings-landing.tsx ifnecessary. Testzone tests/settings/settings-page.test.tsx, tests/settings/settings-routes.test.tsx, tests/auth/mobile-navigation.integration.test.tsx, tests/navigation-links.test.mjs, tests/e2e/auth.spec.ts, tests/stock*. Docs ios-shortcuts.md and assets/shortcuts/README.md update current setup path. No backend/deps/refactor/newcopyofpanel/AGENTS/AP edits.

Affectedchecks: readycopiednode_modules; npmrun test:settings; targeted stock/navigation authVitest; narrow existing authE2E for operatorpersonalsettings+adminpagesdenied andadminpositivecontrol via isolatednpm script only (SM_TECHNO_TEST_PYTHON=C:/Users/Alexandr/AppData/Local/Temp/sm-shortcut-py313/Scripts/python.exe); types/lint/build once finalsource. Don't run hugeviewportmatrix. APIsecurityalreadytested unchanged. Root onefreshUIaccessreview whencommitavailable. Independent finalsourcecheck willnotbe repeatedformally. No deploy fromworker. New targetSHAreleaseapproval perAGENTS later, not inherited96faf42release.

Read user AGENTS root+frontend; executor C:/Users/Alexandr/.codex/skills/autopilot/prompts/executor.md. RoothandlesGit/AP notes/ops. Use requestedTerra6.1. No nestedagents, no commits/push/deploy. Return <=25line contract exactchecks/changecriteria/concerns.

Implementation check record2026-11-01T09:12UTC: worker settings68PASS, stock/navigation14PASS, navigationlinks1PASS, isolatedChrome390E2E1PASS(employeepersonalsettings/adminchilddenied/adminpositive), type/lint/buildPASS. REDemployeeSettingsmissingpanel beforecode. Rootsettingspage/routes5PASS1.66s. API/session/schema/backend unchanged. Generatedownnext-envrestored toHEAD. NativeiPhonegate remainsseparatepending, no claimactualphonePASS.


Fresh independent UIaccessreview455448d: clean, no confirmedfindings; admincomponent/fetchUsers onlyisAdmin, adminchildroutesretainchecks, personalpanel lifecycleunchanged, sharednav employeesseeSettings. No furtherreview/test repetitionneeded.

CI0ae push+PR: backendbothPASS, authoverallFAIL because old tests/auth/role-gates.integration.test.tsx stillasserted Settingsrootdenied/noSettingsnav. This omittedcouplingtest nowupdated inbounds, preservingexplicitusers/1C/price denial. No appcodechange. Worker narrow2PASS + fullauth189PASS, rootnarrow2PASS2.51s. Settings/build/E2E unchanged notrerunformally. FutureCIpoll mustinclude failedcompletedsteps, notonlycurrentrunningstep (workflowcontinuesafterearlyfailure).
