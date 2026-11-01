const extensions = new Set(['docx','doc','rtf','odt','xlsx','xls','csv','tsv','txt','pdf','png','jpg','jpeg','webp','tif','tiff','heic','heif']);
const mimeExtensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/tiff': 'tiff', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf', 'text/plain': 'txt' };
export function validateStockFile(file: File): File {
  if (!file.size) throw new Error('Файл пуст. Выберите другой файл.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Файл больше 25 МиБ. Выберите файл меньшего размера.');
  const suffix = file.name.match(/\.([^./]+)$/)?.[1]?.toLowerCase();
  if (suffix && !extensions.has(suffix)) throw new Error('Этот формат не поддерживается. Выберите другой файл.');
  if (!suffix) { const extension = mimeExtensions[file.type.toLowerCase()]; if (!extension || file.name.includes('.')) throw new Error('Не удалось определить формат файла. Выберите другой файл.'); return new File([file], `stock.${extension}`, {type: file.type}); }
  return file;
}
export function textStockFile(text: string): File {
  if (!text.trim()) throw new Error('Вставьте список артикулов.');
  if (new TextEncoder().encode(text).length > 256 * 1024) throw new Error('Текст больше 256 КиБ. Сократите список.');
  return new File([text], 'stock.txt', {type: 'text/plain;charset=utf-8'});
}
