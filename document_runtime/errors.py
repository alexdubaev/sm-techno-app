class ExtractionError(Exception):
    def __init__(self, code='extraction_failed', message='Не удалось распознать файл. Сохранённый источник доступен; проверьте формат или повторите распознавание.'):
        self.code, self.public_message = code, message
        super().__init__(message)
