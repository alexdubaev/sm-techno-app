from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class AutostartScriptTests(unittest.TestCase):
    def test_installer_registers_one_full_server_task(self) -> None:
        script = (ROOT / "scripts" / "install_backend_autostart.ps1").read_text(encoding="utf-8")

        self.assertIn('$taskName = "SM Techno Server"', script)
        self.assertIn("run_sm_techno_server.ps1", script)
        self.assertIn("Unregister-ScheduledTask", script)
        self.assertIn("New-ScheduledTaskTrigger -AtStartup", script)
        self.assertIn('New-ScheduledTaskPrincipal -UserId "SYSTEM"', script)

    def test_server_supervisor_owns_all_three_services(self) -> None:
        script = (ROOT / "scripts" / "run_sm_techno_server.ps1").read_text(encoding="utf-8")

        self.assertIn("127.0.0.1:8000/api/health", script)
        self.assertIn("127.0.0.1:3000", script)
        self.assertIn("funnel --bg http://127.0.0.1:8000", script)
        self.assertIn("WaitOne(0)", script)
        self.assertIn("$mutexAcquired", script)
        self.assertIn("Start-Sleep", script)

    def test_stop_script_disables_supervisor_before_killing_processes(self) -> None:
        script = (ROOT / "scripts" / "stop_sm_techno_app.ps1").read_text(encoding="utf-8")

        self.assertIn('"SM Techno Server"', script)
        self.assertIn("Stop-ScheduledTask", script)

if __name__ == "__main__":
    unittest.main()
