/**
 * "{InvoiceNo}_{ClientName}.pdf" with everything Windows forbids in file names removed:
 * < > : " / \ | ? * and control characters; no trailing dots/spaces; no reserved names (CON, PRN…).
 */
export function safeFilePart(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export function invoiceFileName(number: string, clientName: string, ext: 'pdf' | 'docx'): string {
  const parts = [safeFilePart(number), safeFilePart(clientName)].filter(Boolean);
  let base = parts.join('_') || 'Invoice';
  if (RESERVED.test(base)) base = `${base}_invoice`;
  if (base.length > 150) base = base.slice(0, 150).replace(/[. ]+$/, '');
  return `${base}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
