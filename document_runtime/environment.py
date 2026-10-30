import os
from pathlib import Path

def _runtime_environment(workspace):
    # CLI auth remains in its own credential store, never copied or exposed as model input.
    allow={'SYSTEMROOT','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','HOME','CODEX_HOME'}
    env={key:value for key,value in os.environ.items() if key.upper() in allow}
    temp=workspace/'temp'; temp.mkdir(exist_ok=True)
    env.update({'TEMP':str(temp),'TMP':str(temp),'TMPDIR':str(temp),'NO_COLOR':'1',
        'PATH':str(Path(os.environ.get('SYSTEMROOT','C:/Windows'))/'System32') if os.name=='nt' else '/usr/bin:/bin'})
    return env
