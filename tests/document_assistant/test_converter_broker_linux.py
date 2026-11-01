"""Linux AF_UNIX integration using synthetic bytes and a fixed fake converter."""
import os
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from unittest import mock
from types import SimpleNamespace

from document_runtime.office import IsolatedOfficeConverter

from document_runtime.broker import (BrokerConverter, ConverterBroker, HEADER,
    INPUT_MAX, MAGIC, RESPONSE, _recv, _safe_remove_tree)
from document_runtime.errors import ExtractionError


@unittest.skipUnless(os.name == 'posix' and hasattr(socket, 'SO_PEERCRED'), 'Linux peer credentials required')
class BrokerIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sm-broker-test-')
        self.root = Path(self.temp.name)
        self.gate = threading.Event()
        self.started = threading.Event()
        outer = self
        class Converter:
            def convert(self, source, workspace, *, deadline=None):
                data = source.read_bytes()
                if data == b'wait':
                    outer.started.set()
                    outer.gate.wait(3)
                if data == b'error':
                    raise ExtractionError('conversion_failed')
                result = workspace / 'result.pdf'
                if data == b'symlink':
                    result.symlink_to(source)
                    return result
                if data == b'oversize':
                    with result.open('wb') as file: file.truncate(50 * 1024 * 1024 + 1)
                    return result
                result.write_bytes(b'%PDF-' + data)
                return result
        self.broker = ConverterBroker(self.root, '', client_uid=os.getuid(), converter=Converter(), deadline=1)
        self.broker.start()
        threading.Thread(target=self.broker.serve_forever, daemon=True).start()
        self.client = BrokerConverter(str(self.broker.socket_path), server_uid=os.getuid(), timeout=2)
        self.source = self.root / 'input.doc'
        self.workspace = self.root / 'client'
        self.workspace.mkdir()

    def tearDown(self):
        self.gate.set()
        self.broker.listener.close()
        self.broker.lease.close()
        self.temp.cleanup()

    def test_success_error_and_cleanup(self):
        self.source.write_bytes(b'synthetic')
        self.assertEqual(self.client.convert(self.source, self.workspace).read_bytes(), b'%PDF-synthetic')
        self.source.write_bytes(b'error')
        with self.assertRaises(ExtractionError) as caught:
            self.client.convert(self.source, self.workspace)
        self.assertEqual(caught.exception.code, 'conversion_failed')
        for content in (b'oversize',):
            self.source.write_bytes(content)
            with self.assertRaises(ExtractionError) as caught:
                self.client.convert(self.source, self.workspace)
            self.assertEqual(caught.exception.code, 'conversion_failed')
        time.sleep(.05)
        self.assertEqual(list(self.broker.work_dir.iterdir()), [])

    def test_converter_input_permissions_under_private_umask(self):
        self.source.write_bytes(b'synthetic')
        def run(args, **kwargs):
            if 'context' in args:
                return SimpleNamespace(returncode=0, stdout=b'unix:///var/run/docker.sock')
            if 'image' in args:
                return SimpleNamespace(returncode=0, stdout=b'v1')
            if 'run' in args:
                office = next(self.workspace.glob('office-*'))
                self.assertEqual((office / 'input').stat().st_mode & 0o777, 0o755)
                self.assertEqual((office / 'input/source.doc').stat().st_mode & 0o777, 0o644)
                (office / 'output/source.pdf').write_bytes(b'%PDF-test')
                return SimpleNamespace(returncode=0, stdout=b'')
            return SimpleNamespace(returncode=1, stdout=b'')
        old_umask = os.umask(0o077)
        try:
            with mock.patch('document_runtime.office.subprocess.run', side_effect=run):
                converter = IsolatedOfficeConverter(image='sha256:'+'a'*64, binary='docker', broker_access=True)
                self.assertEqual(converter.convert(self.source, self.workspace).read_bytes(), b'%PDF-test')
        finally:
            os.umask(old_umask)

    @unittest.skipUnless(os.geteuid() == 0, 'requires chown to simulate converter UID')
    def test_failed_and_orphaned_converter_output_cleanup(self):
        def create_foreign(job):
            output = job / ('office-' + 'a'*32) / 'output'
            output.mkdir(parents=True)
            pdf = output / 'source.pdf'
            pdf.write_bytes(b'private')
            os.chown(pdf, 65534, 65534)
        class Failure:
            def convert(self, source, workspace, *, deadline=None):
                create_foreign(workspace)
                raise ExtractionError('conversion_failed')
        self.broker.converter = Failure()
        self.source.write_bytes(b'private')
        with self.assertRaises(ExtractionError):
            self.client.convert(self.source, self.workspace)
        time.sleep(.05)
        self.assertEqual(list(self.broker.work_dir.iterdir()), [])
        orphan = self.broker.work_dir / ('job-' + 'b'*32)
        orphan.mkdir(mode=0o700)
        (orphan / 'source.doc').write_bytes(b'private')
        create_foreign(orphan)
        self.broker.listener.close()
        self.broker.lease.close()
        self.broker = ConverterBroker(self.root, '', client_uid=os.getuid(), converter=Failure(), deadline=1)
        self.broker.start()
        self.assertFalse(orphan.exists())

        guarded = self.broker.work_dir / ('job-' + 'c'*32)
        guarded.mkdir(mode=0o700)
        create_foreign(guarded)
        output = guarded / ('office-' + 'a'*32) / 'output'
        (output / 'unexpected').write_text('keep')
        self.assertFalse(_safe_remove_tree(guarded, os.getuid()))
        (output / 'unexpected').unlink()
        os.link(output / 'source.pdf', output / 'hardlink')
        self.assertFalse(_safe_remove_tree(guarded, os.getuid()))
        (output / 'hardlink').unlink()
        self.assertTrue(_safe_remove_tree(guarded, os.getuid()))

    def test_deadline_is_shared_and_reserves_cleanup(self):
        self.source.write_bytes(b'x')
        converter = IsolatedOfficeConverter(image='sha256:'+'a'*64, binary='docker', broker_access=True)
        with mock.patch('document_runtime.office.subprocess.run') as run:
            with self.assertRaises(ExtractionError) as caught:
                converter.convert(self.source, self.workspace, deadline=time.monotonic()+1)
            self.assertEqual(caught.exception.code, 'converter_timeout')
            run.assert_not_called()
        calls = []
        now = [100.0]
        def runner(args, **kwargs):
            calls.append((args, kwargs['timeout']))
            now[0] += 1
            if 'context' in args: return SimpleNamespace(returncode=0, stdout=b'unix:///var/run/docker.sock')
            if 'image' in args: return SimpleNamespace(returncode=0, stdout=b'v1')
            if 'run' in args: raise __import__('subprocess').TimeoutExpired(args, kwargs['timeout'])
            if 'inspect' in args: return SimpleNamespace(returncode=1, stdout=b'')
            return SimpleNamespace(returncode=1, stdout=b'')
        with mock.patch('document_runtime.office.subprocess.run', side_effect=runner), mock.patch('document_runtime.office.time.monotonic', side_effect=lambda: now[0]):
            with self.assertRaises(ExtractionError):
                converter.convert(self.source, self.workspace, deadline=120)
        self.assertEqual([timeout for _, timeout in calls], [4, 3, 2, 8])

    def test_peer_uid_on_both_ends(self):
        self.source.write_bytes(b'x')
        with self.assertRaises(ExtractionError):
            BrokerConverter(str(self.broker.socket_path), server_uid=os.getuid()+1).convert(self.source, self.workspace)
        self.broker.client_uid = os.getuid()+1
        with self.assertRaises(ExtractionError):
            self.client.convert(self.source, self.workspace)

    def test_bad_frames_limit_truncation_and_timeout(self):
        for frame in (HEADER.pack(b'bad!', 1, 1), HEADER.pack(MAGIC, 9, 1), HEADER.pack(MAGIC, 1, INPUT_MAX+1)):
            with socket.socket(socket.AF_UNIX) as s:
                s.connect(str(self.broker.socket_path)); s.sendall(frame)
                self.assertEqual(RESPONSE.unpack(_recv(s, RESPONSE.size, time.monotonic()+2))[0], 5)
        with socket.socket(socket.AF_UNIX) as s:
            s.connect(str(self.broker.socket_path)); s.sendall(HEADER.pack(MAGIC, 1, 10)); _recv(s, RESPONSE.size, time.monotonic()+2); s.sendall(b'x')
        time.sleep(.1)
        with socket.socket(socket.AF_UNIX) as s:
            s.connect(str(self.broker.socket_path)); s.sendall(HEADER.pack(MAGIC, 1, 10)); _recv(s, RESPONSE.size, time.monotonic()+2); s.sendall(b'x')
            s.settimeout(2)
            self.assertEqual(s.recv(1), b'')
        time.sleep(.05)
        self.assertEqual(list(self.broker.work_dir.iterdir()), [])

    def test_busy_and_no_fallback(self):
        self.source.write_bytes(b'wait')
        errors = []
        def call():
            try: self.client.convert(self.source, self.workspace)
            except ExtractionError as exc: errors.append(exc.code)
        thread = threading.Thread(target=call); thread.start()
        self.assertTrue(self.started.wait(2))
        with self.assertRaises(ExtractionError) as caught:
            self.client.convert(self.source, self.workspace)
        self.assertEqual(caught.exception.code, 'converter_busy')
        self.gate.set(); thread.join(3)
        self.assertFalse(errors)

    def test_symlink_and_orphan_guard(self):
        self.source.write_bytes(b'symlink')
        with self.assertRaises(ExtractionError):
            self.client.convert(self.source, self.workspace)
        time.sleep(.05)
        self.assertEqual(len(list(self.broker.work_dir.iterdir())), 1)
        target = self.root / 'foreign'; target.write_text('keep')
        job = self.broker.work_dir / ('job-'+'a'*32); job.mkdir()
        (job/'link').symlink_to(target)
        self.assertFalse(_safe_remove_tree(job, os.getuid()))
        self.assertEqual(target.read_text(), 'keep')
        with self.assertRaises(BlockingIOError):
            other = ConverterBroker(self.root, '', client_uid=os.getuid(), converter=self.broker.converter)
            other.start()
        self.assertTrue(job.exists())


if __name__ == '__main__':
    unittest.main()
