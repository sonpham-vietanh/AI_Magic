/** In một tài liệu HTML đã dựng sẵn (mọi chuỗi đã được thoát) qua iframe ẩn, không đụng giao diện trang. */
export function printHtml(html: string): void {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  if (!d) {
    f.remove();
    return;
  }
  d.open();
  d.write(html);
  d.close();
  setTimeout(() => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 60000);
  }, 150);
}
