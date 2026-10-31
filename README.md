# RD products

Ứng dụng web (PWA) tra cứu model, thông số và giá bán lẻ từ catalogue PDF. Tìm không dấu hoặc bằng giọng nói, lọc theo nhóm, đọc catalogue như sách (vuốt lật trang, hai trang trên màn hình ngang), dùng được khi mất mạng và cài được ra màn hình chính.

- `docs/`: ứng dụng, được GitHub Pages phục vụ.
- `tools/extract_price.py`: tách ảnh trang và dữ liệu từ PDF.

Cập nhật khi có bảng giá mới:

```bash
python tools/extract_price.py <catalogue.pdf> docs "Bảng giá Rạng Đông" tools/sections-bang-gia-2026.json
```

Sau đó tăng `VERSION` trong `docs/sw.js` để điện thoại tải bản mới. Dữ liệu được tách tự động; đối chiếu trang gốc trước khi báo giá.
