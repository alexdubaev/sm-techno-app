"""Fixed, networkless container entrypoint. Never accepts commands from uploads."""
import pathlib
import subprocess
import sys

source = pathlib.Path('/input/source' + sys.argv[1]) if len(sys.argv) == 2 and sys.argv[1] in {'.doc', '.rtf', '.odt'} else None
if source is None or not source.is_file() or source.stat().st_size > 25 * 1024 * 1024:
    sys.exit(2)
profile = pathlib.Path('/tmp/profile/user')
profile.mkdir(parents=True)
# Disable macros, automatic link updates and recovery before opening the document.
(profile / 'registrymodifications.xcu').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
</oor:items>''', encoding='utf-8')
try:
    result = subprocess.run(['/usr/bin/soffice', '-env:UserInstallation=file:///tmp/profile', '--headless', '--nologo', '--nodefault', '--norestore',
        '--convert-to', 'pdf:writer_pdf_Export', '--outdir', '/output', str(source)], timeout=45, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    output = pathlib.Path('/output/source.pdf')
    if result.returncode or not output.is_file() or output.stat().st_size > 50 * 1024 * 1024:
        sys.exit(3)
except subprocess.TimeoutExpired:
    sys.exit(4)
