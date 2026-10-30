import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

from document_runtime.errors import ExtractionError
from document_runtime.environment import _runtime_environment

class IsolatedOfficeConverter:
    """Host adapter for one server-selected immutable image; never pulls/builds."""
    def __init__(self, image=None, binary=None, timeout=60, broker_access=False):
        self.image=image if image is not None else os.getenv('DOCUMENT_ASSISTANT_CONVERTER_IMAGE','')
        self.binary=binary or shutil.which('docker')
        self.timeout=timeout
        self.broker_access=broker_access

    def convert(self, source: Path, workspace: Path) -> Path:
        if not self.binary or not re.fullmatch(r'sha256:[0-9a-f]{64}',self.image):
            raise ExtractionError('converter_unavailable','Изолированный конвертер DOC/RTF/ODT не настроен. Администратору нужно подключить проверенный образ.')
        suffix=source.suffix.lower()
        if suffix not in {'.doc','.rtf','.odt'}: raise ValueError('Неизвестный формат конвертера.')
        root=workspace/('office-'+uuid.uuid4().hex); input_dir=root/'input'; output_dir=root/'output'
        input_dir.mkdir(parents=True); output_dir.mkdir()
        shutil.copyfile(source,input_dir/('source'+suffix))
        if self.broker_access:
            # The bind mount must be readable by fixed UID 65534 despite service umask 077.
            input_dir.chmod(0o755)
            (input_dir/('source'+suffix)).chmod(0o644)
        # Linux non-root worker needs output access; this is a new task-only directory.
        output_dir.chmod(0o777)
        name='sm-techno-converter-'+uuid.uuid4().hex
        env=_runtime_environment(workspace)
        docker=[self.binary,'--context','default']
        # Never route selected customer materials to a configured remote Docker context.
        try:
            endpoint=subprocess.run(docker+['context','inspect','default','--format','{{.Endpoints.docker.Host}}'],env=env,capture_output=True,timeout=8,shell=False)
            host=endpoint.stdout.decode().strip()
            image_check=subprocess.run(docker+['image','inspect','--format','{{ index .Config.Labels "org.sm-techno.document-converter" }}',self.image],env=env,capture_output=True,timeout=8,shell=False)
            local_endpoint=host.startswith('unix:///') or host.startswith('npipe:////./pipe/')
            if endpoint.returncode or not local_endpoint or image_check.returncode or image_check.stdout.decode().strip()!='v1':
                raise ExtractionError('converter_unavailable','Подключите локальный Docker и проверенный образ конвертера v1.')
        except (OSError,subprocess.TimeoutExpired): raise ExtractionError('converter_unavailable','Локальный конвертер временно недоступен.') from None
        args=docker+['run','--rm','--pull=never','--name',name,'--label','org.sm-techno.document-job='+name,
            '--network','none','--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges',
            '--pids-limit','64','--memory','512m','--memory-swap','512m','--cpus','1',
            '--ulimit','fsize=52428800:52428800','--tmpfs','/tmp:rw,noexec,nosuid,size=134217728,mode=1777',
            '--mount',f'type=bind,src={input_dir.resolve()},dst=/input,readonly',
            '--mount',f'type=bind,src={output_dir.resolve()},dst=/output',self.image,suffix]
        try:
            completed=subprocess.run(args,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=self.timeout,shell=False)
            output=output_dir/'source.pdf'
            if completed.returncode or not output.is_file() or output.is_symlink() or output.stat().st_size>50*1024*1024:
                raise ExtractionError('conversion_failed','Не удалось преобразовать документ. Проверьте файл и доступность изолированного конвертера.')
            return output
        except subprocess.TimeoutExpired:
            raise ExtractionError('converter_timeout','Документ не преобразован за допустимое время.') from None
        except OSError:
            raise ExtractionError('converter_unavailable','Изолированный конвертер временно недоступен.') from None
        finally:
            # The daemon may outlive a timed-out client. Remove only our exact labelled container.
            try:
                check=subprocess.run(docker+['inspect','--format','{{ index .Config.Labels "org.sm-techno.document-job" }}',name],env=env,capture_output=True,timeout=8,shell=False)
                if check.returncode==0 and check.stdout.decode().strip()==name:
                    subprocess.run(docker+['rm','--force',name],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=8,shell=False)
            except (OSError,subprocess.TimeoutExpired): pass
