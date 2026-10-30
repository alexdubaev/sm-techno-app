"""Private, fixed-operation Unix broker. No app-supplied paths or commands."""
import argparse
try:
    import fcntl
except ImportError:  # Direct converter remains usable on Windows.
    fcntl = None
import os
import re
from pathlib import Path
import shutil
import socket
import stat
import struct
import threading
import time
import uuid

from document_runtime.errors import ExtractionError
from document_runtime.office import IsolatedOfficeConverter

INPUT_MAX = 25 * 1024 * 1024
OUTPUT_MAX = 50 * 1024 * 1024
DEADLINE = 110
FORMATS = {1: '.doc', 2: '.rtf', 3: '.odt'}
HEADER = struct.Struct('!4sBI')
RESPONSE = struct.Struct('!BI')
MAGIC = b'SMC1'
ERRORS = {1: 'converter_unavailable', 2: 'conversion_failed', 3: 'converter_timeout', 4: 'converter_busy', 5: 'input_limit'}


def _peer_uid(sock):
    return struct.unpack('3i', sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1]


def _recv(sock, size, deadline):
    result = bytearray()
    while len(result) < size:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        sock.settimeout(remaining)
        part = sock.recv(min(65536, size - len(result)))
        if not part:
            raise EOFError()
        result.extend(part)
    return bytes(result)


def _send(sock, data, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError()
    sock.settimeout(remaining)
    sock.sendall(data)


class BrokerConverter:
    def __init__(self, socket_path, server_uid=1000, timeout=DEADLINE):
        self.socket_path, self.server_uid, self.timeout = socket_path, server_uid, timeout

    def convert(self, source, workspace):
        fmt = next((key for key, suffix in FORMATS.items() if suffix == source.suffix.lower()), None)
        if fmt is None:
            raise ValueError('Неизвестный формат конвертера.')
        if source.stat().st_size > INPUT_MAX:
            raise ExtractionError('input_limit')
        try:
            data = source.read_bytes()
            if len(data) > INPUT_MAX:
                raise ExtractionError('input_limit')
            deadline = time.monotonic() + self.timeout
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
                conn.settimeout(self.timeout)
                conn.connect(self.socket_path)
                if _peer_uid(conn) != self.server_uid:
                    raise ExtractionError('converter_unavailable')
                _send(conn, HEADER.pack(MAGIC, fmt, len(data)), deadline)
                status, length = RESPONSE.unpack(_recv(conn, RESPONSE.size, deadline))
                if status != 6 or length:
                    if status in ERRORS and not length:
                        raise ExtractionError(ERRORS[status])
                    raise ValueError('invalid readiness response')
                _send(conn, data, deadline)
                status, length = RESPONSE.unpack(_recv(conn, RESPONSE.size, deadline))
                if status:
                    if length or status not in ERRORS:
                        raise ValueError('invalid response')
                    raise ExtractionError(ERRORS[status])
                if not 0 < length <= OUTPUT_MAX:
                    raise ValueError('invalid response size')
                result = _recv(conn, length, deadline)
            target = workspace / ('broker-' + uuid.uuid4().hex + '.pdf')
            with target.open('xb') as output:
                output.write(result)
            return target
        except ExtractionError:
            raise
        except (OSError, EOFError, ValueError, TimeoutError):
            raise ExtractionError('converter_unavailable') from None


def _private_directory(path, uid):
    st = path.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != uid or st.st_mode & 0o077:
        raise ValueError('unsafe broker directory')


def _safe_remove_tree(path, uid):
    """Remove own job trees and only the fixed UID-65534 converter output."""
    try:
        _private_directory(path, uid)
        for root, dirs, files in os.walk(path, followlinks=False):
            for name in dirs + files:
                entry = Path(root) / name
                st = entry.lstat()
                relative = entry.relative_to(path).parts
                if stat.S_ISDIR(st.st_mode):
                    if st.st_uid != uid:
                        return False
                    continue
                if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
                    return False
                if st.st_uid == uid:
                    continue
                if not (st.st_uid == 65534 and len(relative) == 3
                        and re.fullmatch(r'office-[0-9a-f]{32}', relative[0])
                        and relative[1:] == ('output', 'source.pdf')):
                    return False
                # The writable converter output directory must contain only this file.
                if set(os.listdir(entry.parent)) != {'source.pdf'}:
                    return False
        shutil.rmtree(path)
        return True
    except (OSError, ValueError):
        return False


class ConverterBroker:
    def __init__(self, root, image, *, client_uid=0, converter=None, deadline=DEADLINE):
        self.root = Path(root)
        self.uid = os.getuid()
        self.client_uid = client_uid
        self.converter = converter or IsolatedOfficeConverter(image=image, timeout=60, broker_access=True)
        self.deadline = deadline
        self.busy = threading.Lock()
        self.slots = threading.BoundedSemaphore(4)
        self.socket_dir = self.root / 'socket'
        self.work_dir = self.root / 'work'
        self.socket_path = self.socket_dir / 'converter.sock'
        self.listener = None
        self.lease = None

    def start(self):
        _private_directory(self.root, self.uid)
        for directory in (self.socket_dir, self.work_dir):
            directory.mkdir(mode=0o700, exist_ok=True)
            _private_directory(directory, self.uid)
        # Exclusive lease prevents one instance cleaning another's active work.
        fd = os.open(self.root / 'broker.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        self.lease = os.fdopen(fd, 'r+')
        if not stat.S_ISREG(os.fstat(fd).st_mode) or os.fstat(fd).st_uid != self.uid:
            raise ValueError('unsafe lease')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lease.close()
            self.lease = None
            raise
        for item in self.work_dir.iterdir():
            if len(item.name) == 36 and item.name.startswith('job-') and all(c in '0123456789abcdef' for c in item.name[4:]):
                _safe_remove_tree(item, self.uid)
        try:
            st = self.socket_path.lstat()
            if not stat.S_ISSOCK(st.st_mode) or st.st_uid != self.uid:
                raise ValueError('unsafe socket')
            self.socket_path.unlink()
        except FileNotFoundError:
            pass
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(str(self.socket_path))
        self.socket_path.chmod(0o600)
        self.listener.listen(4)

    def serve_forever(self):
        while True:
            try:
                conn, _ = self.listener.accept()
            except OSError:
                if self.listener.fileno() < 0:
                    return
                raise
            if not self.slots.acquire(blocking=False):
                conn.close()
                continue
            threading.Thread(target=self._handle, args=(conn,), daemon=True).start()

    def _handle(self, conn):
        deadline = time.monotonic() + self.deadline
        acquired = False
        job = None
        try:
            if _peer_uid(conn) != self.client_uid:
                return
            magic, fmt, length = HEADER.unpack(_recv(conn, HEADER.size, deadline))
            if magic != MAGIC or fmt not in FORMATS or not 0 < length <= INPUT_MAX:
                _send(conn, RESPONSE.pack(5, 0), deadline)
                return
            if not self.busy.acquire(blocking=False):
                _send(conn, RESPONSE.pack(4, 0), deadline)
                return
            acquired = True
            _send(conn, RESPONSE.pack(6, 0), deadline)
            data = _recv(conn, length, deadline)
            job = self.work_dir / ('job-' + uuid.uuid4().hex)
            job.mkdir(mode=0o700)
            source = job / ('source' + FORMATS[fmt])
            source.write_bytes(data)
            output = self.converter.convert(source, job, deadline=deadline)
            # Never trust a converter output symlink or an oversized output.
            st = output.lstat()
            if not stat.S_ISREG(st.st_mode) or st.st_size <= 0 or st.st_size > OUTPUT_MAX:
                raise ExtractionError('conversion_failed')
            fd = os.open(output, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as file:
                actual = os.fstat(file.fileno())
                if not stat.S_ISREG(actual.st_mode) or actual.st_ino != st.st_ino or actual.st_dev != st.st_dev:
                    raise ExtractionError('conversion_failed')
                result = file.read(OUTPUT_MAX + 1)
            if len(result) > OUTPUT_MAX:
                raise ExtractionError('conversion_failed')
            _send(conn, RESPONSE.pack(0, len(result)) + result, deadline)
        except ExtractionError as exc:
            status = next((key for key, value in ERRORS.items() if value == exc.code), 2)
            try: _send(conn, RESPONSE.pack(status, 0), deadline)
            except (OSError, TimeoutError): pass
        except (OSError, EOFError, TimeoutError, ValueError, struct.error):
            pass
        finally:
            if job is not None:
                _safe_remove_tree(job, self.uid)
            if acquired:
                self.busy.release()
            conn.close()
            self.slots.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    import re
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', args.image):
        parser.error('immutable image ID required')
    broker = ConverterBroker(args.root, args.image)
    broker.start()
    broker.serve_forever()


if __name__ == '__main__':
    main()
