# Проверенные исходные факты

Main1d7dd9b уже включает продукт и test-only closure PR11/12; backend706PASS/22SKIP/128subtests, frontend187/68, production manager15, auth browser41+узкое1PASS/6SKIP. Полный product повтор не нужен для runtime-only изменений; affected integration gates остаются обязательными.

VPS91.227.68.176, /srv/sm-techno-test, compose sm-techno-test, git52ccb395 clean; both containers healthy. Backend image sha256:4129fdd83addae8d1dc524fefd1e861d39a653256a94ee9ef7c4dad8f5ef7b56 (342171536B), frontend sha256:268c0e9ec56d1e2188a59a583f60a0288ff667b4e6cd02b59749a22f60e93fcf (300296562B).7.9GiB free/39GiB; 4GBRAM/2GBswap. Existing deployuid1000, docker group999, existing sudo available; no account/SSH changes needed. HostPython3.10.12, Docker29.6.2. Host user linger disabled; do not change that setting.

Fresh current-data backup sm-techno-20261030T185956658421Z.tar.gz created with candidate1d's strict verifier, --stored-storage-root /storage; verify-only and empty-target restore succeeded. SHA256ecafbc690b8629f6af8a891b39cd63616df7ad3174373dd23c24ba88fd18fff9. Staging/rehearsal under /srv/sm-techno-test/releases/20261030-document-workflows. This preflight backup is not final quiesced pre-switch snapshot.

OpenAI0.166.0 official Linuxmusl archive SHA256a0bf572d2f93f056c6712a6da348e96078dc84f3885fd7be67807ef389cb3978; --version passed in existing backend image under normal Docker security. Exact extraction/auth probe still required. CodexDocumentExtractor disables all tools and parses events fail-closed; docs do not prove inference-only requires relaxed seccomp. No unconfined/privileged/runtime guard weakening.

DocumentSourceReader has converter injection; legacy IsolatedOfficeConverter launches fixed isolated Docker jobs. App has no Docker socket and must keep that boundary. Narrow converter-only host broker can run as existing codex-deploy via an own systemd service; host Python must use only stdlib, existing converter code factored into light shared module without changing behavior. No new external API or DB schema.
