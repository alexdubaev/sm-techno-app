"""Private, immutable local assets. No paths derived from client filenames."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import stat
from typing import BinaryIO, Protocol
import uuid
import warnings
import zipfile
from xml.etree import ElementTree

from stock_sync_web.vps_integrity import STORAGE_STAGING_DIR_NAME, storage_operation_lock


class UploadLimitError(ValueError):
    pass


@dataclass(frozen=True)
class UploadLimits:
    max_bytes: int = 25 * 1024 * 1024
    max_expanded_bytes: int = 100 * 1024 * 1024
    max_zip_entries: int = 2000
    max_pages: int = 100
    max_pixels: int = 40_000_000


@dataclass(frozen=True)
class StagedAsset:
    path: Path
    original_filename: str
    media_type: str
    byte_size: int
    sha256: str


@dataclass(frozen=True)
class StoredAsset:
    storage_key: str
    original_filename: str
    media_type: str
    byte_size: int
    sha256: str


class PrivateDocumentStore(Protocol):
    def stage_upload(self, stream: BinaryIO, original_filename: str, media_type: str, limits: UploadLimits) -> StagedAsset: ...
    def publish(self, staged: StagedAsset, storage_key: str) -> StoredAsset: ...
    def open(self, storage_key: str) -> BinaryIO: ...
    def delete(self, storage_key: str) -> None: ...
    def exists(self, storage_key: str) -> bool: ...


MIME_TYPES = {
    '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.odt':'application/vnd.oasis.opendocument.text', '.ods':'application/vnd.oasis.opendocument.spreadsheet',
    '.doc':'application/msword', '.xls':'application/vnd.ms-excel', '.rtf':'application/rtf',
    '.pdf':'application/pdf', '.txt':'text/plain', '.csv':'text/csv', '.tsv':'text/tab-separated-values', '.json':'application/json',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
    '.tif':'image/tiff', '.tiff':'image/tiff', '.bmp':'image/bmp', '.heic':'image/heic', '.heif':'image/heif',
}


def safe_display_filename(value: str) -> str:
    # Strip both OS path separators, control characters, bidi controls, and Windows reserved punctuation.
    basename = str(value or '').replace('\\','/').split('/')[-1]
    name = re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]', '_', basename).strip(' .')
    if not name: raise ValueError('Укажите имя файла с расширением.')
    suffix=Path(name).suffix.lower()
    return name[:max(1,180-len(suffix))]+suffix if len(name)>180 else name


def _validate_file(path: Path, suffix: str, limits: UploadLimits) -> str:
    expected=MIME_TYPES.get(suffix)
    if not expected: raise ValueError('Формат файла не поддерживается. Используйте документ, таблицу, PDF, текст или изображение.')
    head=path.read_bytes()[:16]
    try:
        if suffix in {'.docx','.xlsx','.odt','.ods'}:
            with zipfile.ZipFile(path) as archive:
                infos=archive.infolist()
                if len(infos)>limits.max_zip_entries or sum(i.file_size for i in infos)>limits.max_expanded_bytes:
                    raise UploadLimitError('Распакованный документ превышает допустимый предел.')
                for info in infos:
                    if info.flag_bits & 1: raise ValueError('Зашифрованный документ не поддерживается.')
                    if info.file_size>limits.max_expanded_bytes or info.file_size>max(info.compress_size,1)*500:
                        raise UploadLimitError('Слишком высокая степень сжатия документа.')
                    parts=info.filename.replace('\\','/').split('/')
                    if '..' in parts or info.filename.startswith(('/','\\')) or ':' in info.filename or stat.S_ISLNK(info.external_attr>>16):
                        raise ValueError('Небезопасная структура документа.')
                    lower=info.filename.lower()
                    if any(token in lower for token in ('vbaproject','/embeddings/','externallinks/')):
                        raise ValueError('Макросы, встроенные исполняемые объекты и внешние связи не поддерживаются.')
                    if lower.endswith('.rels'):
                        root=ElementTree.fromstring(archive.read(info))
                        for rel in root:
                            if rel.attrib.get('TargetMode')=='External' and not rel.attrib.get('Type','').endswith('/hyperlink'):
                                raise ValueError('Документ содержит внешнюю связь с данными.')
                names=set(archive.namelist())
                required={'.docx':'word/document.xml','.xlsx':'xl/workbook.xml','.odt':'content.xml','.ods':'content.xml'}[suffix]
                if required not in names: raise ValueError('Содержимое не соответствует расширению документа.')
                ElementTree.fromstring(archive.read(required))
                if suffix in {'.odt','.ods'}:
                    if archive.read('mimetype').decode('ascii').strip()!=expected: raise ValueError('Содержимое не соответствует формату документа.')
                if archive.testzip() is not None: raise ValueError('Документ повреждён.')
        elif suffix=='.pdf':
            from pypdf import PdfReader
            if not head.startswith(b'%PDF-'): raise ValueError('Содержимое не соответствует PDF.')
            reader=PdfReader(path,strict=True)
            if reader.is_encrypted: raise ValueError('Зашифрованный PDF не поддерживается.')
            if len(reader.pages)>limits.max_pages: raise UploadLimitError(f'В документе больше {limits.max_pages} страниц.')
            if len(reader.pages)==0: raise ValueError('PDF не содержит страниц.')
        elif suffix in {'.doc','.xls'}:
            if not head.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'): raise ValueError('Содержимое не соответствует старому формату Office.')
            if suffix=='.xls':
                import xlrd
                book=xlrd.open_workbook(path,on_demand=True)
                book.release_resources()
            else:
                from xlrd.compdoc import CompDoc
                from io import StringIO
                compound = CompDoc(path.read_bytes(), logfile=StringIO())
                if not compound.get_named_stream('WordDocument') or not (compound.get_named_stream('0Table') or compound.get_named_stream('1Table')):
                    raise ValueError('Содержимое не соответствует документу Word.')
                if any('vba' in entry.name.lower() or 'macro' in entry.name.lower() for entry in compound.dirlist):
                    raise ValueError('Документ с макросами не поддерживается.')
            # Legacy Office is retained verbatim and never executed by the storage layer.
        elif suffix=='.rtf':
            content=path.read_bytes()
            if not content.lstrip().startswith(b'{\\rtf'): raise ValueError('Содержимое не соответствует RTF.')
            if re.search(rb'\\(?:object|objdata|field)\b',content,re.I): raise ValueError('RTF с объектами или внешними полями не поддерживается.')
        elif suffix in {'.txt','.csv','.tsv','.json'}:
            content=path.read_bytes()
            if b'\x00' in content: raise ValueError('Ожидается текстовый файл.')
            try: text=content.decode('utf-8-sig')
            except UnicodeDecodeError: text=content.decode('cp1251')
            if suffix=='.json':
                import json
                json.loads(text)
        else:
            from PIL import Image
            if suffix in {'.heic','.heif'}:
                from pillow_heif import register_heif_opener
                register_heif_opener()
            with warnings.catch_warnings():
                warnings.simplefilter('error',Image.DecompressionBombWarning)
                with Image.open(path) as image:
                    formats={'.jpg':'JPEG','.jpeg':'JPEG','.png':'PNG','.webp':'WEBP','.tif':'TIFF','.tiff':'TIFF','.bmp':'BMP','.heic':'HEIF','.heif':'HEIF'}
                    if image.format!=formats[suffix]: raise ValueError('Изображение не соответствует расширению.')
                    frames=getattr(image,'n_frames',1)
                    if frames>limits.max_pages: raise UploadLimitError('Слишком много страниц изображения.')
                    total=0
                    for index in range(frames):
                        image.seek(index); total+=image.width*image.height
                        if total>limits.max_pixels: raise UploadLimitError(f'Изображение превышает предел {limits.max_pixels} пикселей.')
                    image.seek(0); image.verify()
    except (UploadLimitError,ValueError):
        raise
    except Exception as exc:
        raise ValueError('Файл повреждён или его содержимое не поддерживается.') from exc
    return expected


class LocalPrivateDocumentStore:
    def __init__(self, root: Path, operation_root: Path):
        self.root=Path(root).absolute(); self.operation_root=Path(operation_root).resolve()
        self.root.mkdir(parents=True,exist_ok=True)
        if self.root.resolve()!=self.root: raise ValueError('Небезопасный каталог хранения документов.')
        self.staging=self.operation_root/STORAGE_STAGING_DIR_NAME/'client_documents'
        self.staging.mkdir(parents=True,exist_ok=True)
        if self.staging.resolve()!=self.staging.absolute(): raise ValueError('Небезопасный каталог временных файлов.')

    @staticmethod
    def new_key():
        token=uuid.uuid4().hex
        return f'{token[:2]}/{token}'

    def path_for_key(self, storage_key):
        if not isinstance(storage_key,str) or not re.fullmatch(r'[0-9a-f]{2}/[0-9a-f]{32}',storage_key) or storage_key[:2]!=storage_key[3:5]:
            raise ValueError('Некорректный идентификатор файла.')
        path=self.root.joinpath(*storage_key.split('/'))
        if not path.resolve().is_relative_to(self.root) or path.resolve()!=path.absolute():
            raise ValueError('Небезопасный путь файла.')
        return path

    def stage_upload(self, stream, original_filename, media_type='', limits=None):
        limits=limits or UploadLimits(); name=safe_display_filename(original_filename)
        suffix=Path(name).suffix.lower()
        if suffix not in MIME_TYPES: raise ValueError('Формат файла не поддерживается.')
        path=self.staging/(uuid.uuid4().hex+suffix)
        digest=hashlib.sha256(); count=0
        try:
            with path.open('xb') as target:
                while True:
                    chunk=stream.read(min(1024*1024,limits.max_bytes+1-count))
                    if not chunk: break
                    count+=len(chunk)
                    if count>limits.max_bytes: raise UploadLimitError(f'Размер файла превышает {limits.max_bytes//1024//1024} МБ.')
                    target.write(chunk); digest.update(chunk)
                target.flush(); os.fsync(target.fileno())
            if count==0: raise ValueError('Файл пуст.')
            detected=_validate_file(path,suffix,limits)
            declared=str(media_type or '').split(';')[0].lower()
            if declared not in {'','application/octet-stream',detected} and not (suffix=='.rtf' and declared=='text/rtf'):
                raise ValueError('Тип файла не соответствует содержимому и расширению.')
            return StagedAsset(path,name,detected,count,digest.hexdigest())
        except Exception:
            path.unlink(missing_ok=True)
            raise

    def publish(self, staged, storage_key):
        target=self.path_for_key(storage_key)
        if staged.path.parent.resolve()!=self.staging.resolve() or staged.path.is_symlink(): raise ValueError('Небезопасный временный файл.')
        with storage_operation_lock(self.operation_root):
            if staged.path.stat().st_size!=staged.byte_size or hashlib.sha256(staged.path.read_bytes()).hexdigest()!=staged.sha256:
                raise ValueError('Содержимое временного файла изменилось.')
            target.parent.mkdir(parents=True,exist_ok=True)
            target=self.path_for_key(storage_key)
            if target.exists(): raise ValueError('Идентификатор файла уже занят.')
            staged.path.replace(target)
        return StoredAsset(storage_key,staged.original_filename,staged.media_type,staged.byte_size,staged.sha256)

    def open(self, storage_key):
        return self.path_for_key(storage_key).open('rb')

    def exists(self, storage_key):
        return self.path_for_key(storage_key).is_file()

    def delete(self, storage_key):
        with storage_operation_lock(self.operation_root):
            path=self.path_for_key(storage_key); path.unlink(missing_ok=True)
            if path.parent.is_dir() and not any(path.parent.iterdir()): path.parent.rmdir()
