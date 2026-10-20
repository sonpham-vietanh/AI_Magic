# Kiểm định 82 công cụ sư phạm (TOOL_AUDIT)

Ngày kiểm: 2026-10-20. Phạm vi: lib/catalog (82 công cụ), luồng lib/engine và app/api/generate/route.ts. Trường mới trong lib/types.ts: dataSource, maturity, maturityNote (đã gán cho cả 82 công cụ).

## 1. Công cụ thực sự nhận dữ liệu gì (đọc từ mã)

1. Cả 82 công cụ dùng chung MỘT đường đi: /api/generate, generatePedagogicalResource, buildSystemAndUserPrompt. Mỗi công cụ chỉ khác nhau ở tên, outputSections, 1 trường extraField và systemPromptTemplate sinh tự động từ blueprint (cùng một câu mẫu "Bạn là Chuyên gia Sư phạm ... thực hiện công cụ X"). Mức chuyên biệt của từng công cụ gần như chỉ nằm ở danh sách đầu ra bắt buộc.
2. LLM nhận: tên và outputSections của công cụ, các ô giáo viên nhập, hồ sơ lớp (Class DNA) nếu có classId, nút Knowledge Graph (34 nút mẫu cục bộ hoặc atom Supabase chuyển thành KnowledgeNode) và các nút liên môn.
3. Với atom Supabase (KC-...), route chỉ đưa vào prompt: tên bài, yêu cầu cần đạt, gói (packages) đầu tiên. Câu hỏi và Socratic KHÔNG vào prompt. Chúng được NỐI vào cuối bài (phụ lục "Dữ liệu Học thuật Supabase") sau khi LLM sinh, tối đa 4 câu hỏi và 2 Socratic, chỉ khi atom có dữ liệu và không phải hậu kỳ (postAction). Đã kiểm chứng live: phụ lục xuất hiện ở khbd-5512, ktdg-trac-nghiem-4-muc, tlsp-cau-hoi-socratic khi truyền atomId.
4. Chỉ /api/generate-pack mới đưa packages/questions/socratic vào prompt LLM.
5. Phát hiện: khi form đã có sẵn topic, LLM sinh theo topic đó chứ không theo atom (khbd-5512 với KC-4402137 ra bài "Thu thập dữ liệu"). Cần ưu tiên tiêu đề atom làm topic khi có atomId.

### Định nghĩa nhãn
- supabase_rich: đầu ra cốt lõi là câu hỏi, lỗi sai hoặc Socratic, nên phụ lục Supabase thật gắn kèm có giá trị trực tiếp. Lưu ý: cơ chế nối phụ lục áp dụng chung cho mọi công cụ khi atom có dữ liệu; nhãn này chọn các công cụ mà phụ lục thực sự khớp nội dung.
- class_profile: dùng Class DNA và Knowledge Graph, không có nội dung Supabase làm lõi.
- prompt_only: chủ yếu prompt và ô nhập của giáo viên, ít phụ thuộc bài học hoặc KG (giao tiếp phụ huynh, quản lý lớp, trợ lý nghiệp vụ).
- maturity experimental: trùng lặp, đầu vào không khớp mục đích, đầu ra mỏng hoặc căn cứ pháp lý chưa kiểm chứng. Cảnh báo chung: mọi công cụ đều có systemPromptTemplate mỏng; "ready" nghĩa là đầu vào và đầu ra khớp nhau, chưa phải đã tinh chỉnh prompt chuyên sâu.

## 2. Tổng hợp

- Tổng: 82 công cụ (part1: 40, part2: 42).
- dataSource: supabase_rich 14, class_profile 53, prompt_only 15.
- maturity: ready 69, experimental 13.
- Theo nhóm (supabase_rich / class_profile / prompt_only):
  - ke_hoach_bai_day: 0 / 10 / 0
  - kiem_tra_danh_gia: 7 / 3 / 0
  - phieu_hoc_tap_hoat_dong: 1 / 9 / 0
  - phan_hoa_ho_tro: 2 / 8 / 0
  - tich_hop_lien_mon: 0 / 11 / 0
  - chuyen_doi_hoc_lieu: 2 / 9 / 0
  - giao_tiep_quan_ly_lop: 0 / 0 / 10
  - tro_ly_su_pham: 2 / 3 / 5

## 3. Lỗi catalog đã sửa

1. tools-part1.ts, khbd-5512: giá trị option có khoảng trắng và dấu tiếng Việt (mảnh_ghep_ khăn_trải_bàn) đổi thành manh_ghep_khan_trai_ban.
2. tools-part2.ts, cdhl-infographic: option có khoảng trắng đầu (trung_tam_phan_nhanh) đã bỏ khoảng trắng.
3. Không có id hoặc slug trùng; sampleInput luôn có đủ topic, duration, extraField, objectives khớp inputFields; không đổi id nào.

Phát hiện chưa sửa (cần quyết định sản phẩm): đầu vào cốt lõi của cdhl-van-ban-sang-cau-hoi (sourceText không bắt buộc) và tlsp-phan-bien-5512 (thiếu ô dán giáo án); trùng chức năng cdhl-glossary, cdhl-thuat-ngu-song-ngu, phht-tu-vung-hoc-thuat; ktdg-exit-ticket, pht-bell-ringer, phht-tu-danh-gia; căn cứ "QĐ 4068/QĐ-BGDĐT" của ktdg-dinh-dang-moi-2025 chưa kiểm chứng; trường duration có lựa chọn "Dự án 1–2 tuần" ở part2 áp cho cả công cụ ngắn.

## 4. Bảng 82 công cụ

| id | Tên | Nhóm | dataSource | maturity | Ghi chú |
|---|---|---|---|---|---|
| khbd-5512 | Kế hoạch bài dạy chuẩn Công văn 5512 (4 Hoạt động) | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-5e | Giáo án Khám phá Khoa học theo Mô hình 5E | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-warmup | Thiết kế Hoạt động Khởi động "Vui vẻ & Thực dụng" | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-muc-tieu | Chuẩn hóa Mục tiêu Bài học (YCCĐ - Năng lực - Phẩm chất) | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-unit-plan | Kế hoạch Dạy học theo Chủ đề Đa tiết (Unit Planner) | ke_hoach_bai_day | class_profile | experimental | Chủ đề đa tiết nhưng trường "Thời lượng" mặc định 1 tiết/45 phút; lessonCount là number không bắt buộc. |
| khbd-flipped | Giáo án Lớp học Đảo ngược (Flipped Classroom) | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-slide | Kịch bản Slide Bài giảng Tương tác (Slide Deck Outline) | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-clil | Kế hoạch Bài dạy Song ngữ Anh - Việt (CLIL Lesson Planner) | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-tinh-huong | Thiết kế Tình huống Thực tiễn Xuyên suốt Tiết học | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| khbd-checklist | Checklist Chuẩn bị Thiết bị, Học liệu & Quản trị Rủi ro Tiết dạy | ke_hoach_bai_day | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| ktdg-ma-tran-22 | Ma trận & Bản Đặc tả Đề Kiểm tra Định kỳ (Chuẩn Thông tư 22) | kiem_tra_danh_gia | supabase_rich | ready | Ma trận/đặc tả cần phân bổ câu hỏi; phụ lục câu hỏi Supabase (DOK, độ khó) hữu ích để đối chiếu. |
| ktdg-trac-nghiem-4-muc | Ngân hàng Câu hỏi Trắc nghiệm 4 Mức độ Nhận thức | kiem_tra_danh_gia | supabase_rich | ready | Lõi đầu ra là câu hỏi; phụ lục ngân hàng câu hỏi thật gắn kèm. |
| ktdg-dinh-dang-moi-2025 | Bộ Câu hỏi Trắc nghiệm Đúng/Sai & Trả lời ngắn (Format Thi 2025+) | kiem_tra_danh_gia | supabase_rich | experimental | Lõi là câu hỏi; phụ lục câu hỏi thật. moetStandardRef (QĐ 4068) chưa kiểm chứng. / Căn cứ pháp lý "QĐ 4068/QĐ-BGDĐT" chưa kiểm chứng; cần rà lại văn bản. |
| ktdg-rubric | Thiết kế Rubric & Bảng kiểm Đánh giá Sản phẩm / Thuyết trình | kiem_tra_danh_gia | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| ktdg-15-phut | Đề Kiểm tra Thường xuyên 15 Phút (2 Đề Chẵn/Lẻ Tương đương) | kiem_tra_danh_gia | supabase_rich | ready | Đề 15 phút dùng được câu hỏi thật từ phụ lục. |
| ktdg-exit-ticket | Phiếu Thu hoạch Cuối tiết (Exit Ticket 3-2-1) | kiem_tra_danh_gia | supabase_rich | experimental | Phụ lục câu hỏi + lỗi sai thường gặp (quan_niem_sai) phù hợp. / Chồng lấn với pht-bell-ringer và phht-tu-danh-gia (đều là phiếu ngắn). |
| ktdg-thuc-hanh | Thiết kế Đề Kiểm tra Định kỳ dạng Thực hành / Dự án | kiem_tra_danh_gia | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| ktdg-phan-tich-loi-sai | Hướng dẫn Chấm Tự luận & Phân tích Lỗi sai Thường gặp | kiem_tra_danh_gia | supabase_rich | ready | Phù hợp trường quan_niem_sai và lời giải thật của Supabase. |
| ktdg-doc-hieu-ngoai-sgk | Tạo Ngữ liệu & Bộ Câu hỏi Đọc hiểu Ngoài SGK (Ngữ văn / Tiếng Anh) | kiem_tra_danh_gia | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| ktdg-de-cuong-on-tap | Đề cương Ôn tập Học kỳ Phân tầng theo Năng lực Lớp | kiem_tra_danh_gia | supabase_rich | ready | Ôn tập: dùng được câu hỏi thật theo mức độ. |
| pht-worksheet-5512 | Phiếu Học tập Cá nhân & Nhóm (Worksheet Chuẩn CV 5512) | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| pht-gamification | Thiết kế Trò chơi Học tập trên Lớp (Classroom Gamification) | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| pht-learning-stations | Kịch bản Dạy học theo Trạm (Learning Stations Builder) | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| pht-think-pair-share | Hoạt động Thảo luận Sâu (Think - Pair - Share & Tranh biện) | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| pht-thi-nghiem-vui | Thiết kế Thí nghiệm / Thực hành từ Vật liệu Đời thường | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| pht-flashcard-mindmap | Bộ Thẻ Flashcard & Cấu trúc Sơ đồ Tư duy (Mindmap) | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| pht-roleplay | Kịch bản Đóng vai & Xử lý Tình huống Thực tế (Role-Play) | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| pht-quan-sat-trai-nghiem | Phiếu Quan sát Thực địa & Nhật ký Trải nghiệm Học tập | phieu_hoc_tap_hoat_dong | class_profile | experimental | Đầu vào observationSite là text tự do, mặc định dài; phụ thuộc địa điểm thực tế. |
| pht-bell-ringer | Thử thách Tư duy 5 Phút Đầu giờ (Bell Ringer / Do Now) | phieu_hoc_tap_hoat_dong | supabase_rich | ready | Câu hỏi khởi động có thể lấy từ ngân hàng thật. |
| pht-van-dung-gia-dinh | Nhiệm vụ Vận dụng Thực tiễn tại Gia đình & Cộng đồng | phieu_hoc_tap_hoat_dong | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-phan-hoa-3-muc | Phân hóa Bài tập 3 Mức độ theo Hồ sơ Lớp (Cơ bản - Chuẩn - Nâng cao) | phan_hoa_ho_tro | supabase_rich | ready | Phân tầng bài tập theo độ khó/DOK của câu hỏi thật. |
| phht-iep-ho-tro | Kế hoạch Hỗ trợ Cá nhân hóa Học sinh Cần Lưu ý (IEP / Accommodation) | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-scaffolding | Giàn giáo Tư duy Chia nhỏ Nhiệm vụ Phức tạp (Task Scaffolding) | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-text-leveler | Điều chỉnh Độ khó Văn bản theo Năng lực Lớp (Text Leveler) | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-boi-duong-hsg | Bộ Thử thách Mở rộng & Bồi dưỡng Học sinh Khá Giỏi (Enrichment) | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-tu-vung-hoc-thuat | Bảng Hỗ trợ Từ vựng Học thuật & Mô hình Frayer | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-da-giac-quan | Thiết kế Hoạt động Đa Giác quan theo Phong cách Học VARK | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-tu-danh-gia | Phiếu Tự Đánh giá & Phản tư Học tập cho Học sinh | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| phht-phu-dao-lap-lo-hong | Kế hoạch Phụ đạo & Bù đắp Lỗ hổng Kiến thức Nền tảng (20 Phút) | phan_hoa_ho_tro | supabase_rich | ready | Phụ đạo dựa trên quan_niem_sai và câu hỏi nền tảng. |
| phht-dieu-chinh-nhip-do | Tối ưu Nhịp độ Tiết dạy & Giữ Tập trung theo Đặc điểm Lớp | phan_hoa_ho_tro | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-knowledge-graph | Thiết kế Chủ đề Tích hợp Liên môn từ Knowledge Graph | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-steam-edp | Thiết kế Bài học / Dự án STEAM theo Quy trình Thiết kế Kỹ thuật (EDP) | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-pbl | Thiết kế Học tập Dựa trên Dự án (Project-Based Learning - PBL) | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-toan-khtn | Cầu nối Toán học với Khoa học Tự nhiên & Công nghệ | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-van-su-dia | Cầu nối Liên môn Ngữ văn - Lịch sử - Địa lý & Văn hóa Việt Nam | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-tieng-anh-lien-mon | Thiết kế Hoạt động Tiếng Anh Thực hành qua Môn học Khác | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-ngay-hoi-trai-nghiem | Kịch bản Chuyên đề Ngoại khóa & Ngày hội Trải nghiệm Liên khối | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-bai-toan-thuc-te | Thiết kế Bài toán Thực tế Liên môn (Tài chính - Môi trường - Đô thị) | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-portfolio | Mẫu Hồ sơ Học tập Dự án & Nhật ký Làm việc Nhóm (Portfolio) | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-big-ideas | Thiết kế Câu hỏi Khái niệm Xuyên môn (Big Ideas & Essential Questions) | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| thlm-phoi-hop-giao-vien | Kế hoạch Phối hợp Giảng dạy giữa các Giáo viên Bộ môn Cùng Tuần | tich_hop_lien_mon | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| cdhl-van-ban-sang-cau-hoi | Chuyển đổi Văn bản / Tài liệu bất kỳ thành Bộ Câu hỏi Tương tác | chuyen_doi_hoc_lieu | supabase_rich | experimental | Lõi là sinh câu hỏi; phụ lục câu hỏi thật gắn kèm. / sourceText là đầu vào cốt lõi nhưng required=false và giá trị mặc định là câu mẫu. |
| cdhl-video-podcast | Kịch bản Video Bài giảng Ngắn (3–5 Phút) & Podcast Học tập | chuyen_doi_hoc_lieu | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| cdhl-infographic | Tóm tắt Bài học thành Bố cục Infographic 1 Trang | chuyen_doi_hoc_lieu | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| cdhl-youtube-questions | Thiết kế Phiếu Xem Video Chủ động (Interactive Video Guide) | chuyen_doi_hoc_lieu | class_profile | experimental | Không có ô nhập URL/transcript video nên LLM phải bịa nội dung video. |
| cdhl-case-study | Chuyển đổi Lý thuyết SGK sang Bài tập Tình huống (Case Study) | chuyen_doi_hoc_lieu | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| cdhl-thuat-ngu-song-ngu | Từ điển Thuật ngữ Học thuật Anh - Việt theo Bài học | chuyen_doi_hoc_lieu | class_profile | experimental | Trùng một phần với cdhl-glossary và phht-tu-vung-hoc-thuat. |
| cdhl-glossary | Bảng Chú giải Khái niệm Kèm Ví dụ Đời thường (Student-Friendly Glossary) | chuyen_doi_hoc_lieu | class_profile | experimental | Trùng chức năng với cdhl-thuat-ngu-song-ngu; chỉ 2 phần đầu ra, mỏng. |
| cdhl-an-du-ke-chuyen | Biến Công thức / Quy tắc Khô khan thành Ẩn dụ & Truyện kể Dễ nhớ | chuyen_doi_hoc_lieu | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| cdhl-du-lieu-thuc-te-vn | Tạo Bộ Dữ liệu Thực tế tại Việt Nam cho Bài tập (Toán - Tin - Địa - KHTN) | chuyen_doi_hoc_lieu | class_profile | experimental | LLM tự bịa "số liệu thực tế VN", chưa có nguồn dữ liệu thật; rủi ro sai số liệu. |
| cdhl-quiz-game-export | Chuyển đổi Nội dung Bài học sang Bộ Câu hỏi Kahoot / Quizizz / Blooket | chuyen_doi_hoc_lieu | supabase_rich | experimental | Lõi là bộ câu hỏi Kahoot/Quizizz; phụ lục câu hỏi thật. / Chỉ 2 phần đầu ra; chồng lấn với ktdg-trac-nghiem-4-muc. |
| cdhl-nang-luc-so | Nâng cấp Giáo án Truyền thống sang Phát triển Năng lực Số | chuyen_doi_hoc_lieu | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| gtql-nhan-xet-hoc-ba | Viết Nhận xét Học bạ & Sổ Liên lạc Định kỳ (Chuẩn Thông tư 22 & 27) | giao_tiep_quan_ly_lop | prompt_only | experimental | Không có đầu vào theo từng học sinh (mã VA-..., điểm mạnh/yếu); nhận xét sẽ chung chung. |
| gtql-tin-nhan-zalo-ph | Soạn Tin nhắn Zalo / Email Gửi Phụ huynh Tinh tế & Xây dựng | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-ban-tin-lop | Bản tin Tuần / Tháng của Lớp Gửi Gia đình (Class Newsletter) | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-kich-ban-1-1-ph | Kịch bản Tiếp chuyện & Tư vấn 1-1 với Phụ huynh | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-hop-dong-lop-hoc | Thiết kế Nội quy Tích cực & Văn hóa Lớp học | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-tinh-huong-su-pham | Cẩm nang Xử lý Tình huống Sư phạm & Tâm lý Học đường | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-sinh-hoat-lop | Kế hoạch Tiết Sinh hoạt Lớp Chủ nhiệm theo Chủ đề (45 Phút) | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-thu-khen-ngoi | Thư Khen ngợi & Thẻ Ghi nhận Nỗ lực Tiến bộ của Học sinh | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-khao-sat-dau-nam | Phiếu Khảo sát Sở thích, Phong cách Học & Tâm lý Lớp Đầu Kỳ | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| gtql-hop-phu-huynh | Kịch bản Họp Phụ huynh Tương tác / Học sinh Làm chủ (SLC) | giao_tiep_quan_ly_lop | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| tlsp-phan-bien-5512 | Phản biện & Rà soát Giáo án theo Chuẩn Công văn 5512 | tro_ly_su_pham | prompt_only | experimental | Cần dán giáo án để rà soát nhưng ô nhập chỉ có chủ đề; thiếu textarea nội dung giáo án. |
| tlsp-giai-thich-3-cap | Giải thích Khái niệm Khó theo 3 Cấp độ (Tiểu học - THCS - THPT) | tro_ly_su_pham | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| tlsp-vi-du-phan-vi-du | Tạo Bộ Ví dụ Chuẩn & Phản Ví dụ (Examples & Non-Examples) | tro_ly_su_pham | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| tlsp-du-doan-loi-tu-duy | Dự đoán Lỗi Tư duy & Hiểu lầm của Học sinh Trước Khi Dạy | tro_ly_su_pham | supabase_rich | ready | Trùng trực tiếp với trường quan_niem_sai trong atom. |
| tlsp-cau-hoi-socratic | Thiết kế Chuỗi Câu hỏi Socratic Khơi gợi Tư duy Sâu | tro_ly_su_pham | supabase_rich | ready | Trùng trực tiếp với 7.6k kịch bản Socratic 4 bậc. |
| tlsp-thao-giang-du-gio | Tư vấn Thiết kế Tiết dạy Thao giảng / Thi Giáo viên Dạy giỏi | tro_ly_su_pham | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| tlsp-ai-literacy | Thiết kế Nhiệm vụ Học tập Tích hợp AI Có Đạo đức & Tư duy Phản biện | tro_ly_su_pham | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| tlsp-phat-trien-chuyen-mon | Xây dựng Kế hoạch Bồi dưỡng & Sáng kiến Kinh nghiệm Giáo viên | tro_ly_su_pham | prompt_only | ready | Chủ yếu prompt + đầu vào giáo viên; hầu như không phụ thuộc nội dung bài. |
| tlsp-sel-cam-xuc | Lồng ghép Giáo dục Cảm xúc - Xã hội (SEL) vào Tiết học Bộ môn | tro_ly_su_pham | class_profile | ready | Dùng hồ sơ lớp + Knowledge Graph; phụ lục Supabase chỉ gắn thêm khi atom có dữ liệu. |
| tlsp-vui-ve-thuc-dung | Chuyển hóa Triết lý "Vui vẻ và Thực dụng" vào Tiết dạy Việt Anh | tro_ly_su_pham | prompt_only | experimental | Công cụ meta-triết lý, đầu vào text tự do; đã có sẵn trong prompt hệ thống nên giá trị gia tăng thấp. |

## 5. Kiểm thử trực tiếp (6 công cụ, lớp 7A1, Toán 7, autoSave=false)

Lượt chạy đầu có 3 công cụ rơi về Smart Engine (template) trong chưa đầy 1 giây và 1 lượt trả 500, khi server đang biên dịch lại do thay đổi từ agent khác. Chạy lại lần 2 cả 6 đều thành công bằng LLM thật.

| Công cụ | Thành công | modelUsed | Thời gian | Kích thước | Có phụ lục Supabase | Đánh giá |
|---|---|---|---|---|---|---|
| khbd-5512 | Có | Live AI (cc/claude-haiku-4-5-20251001) (llm_live) | 43s | 10305 ký tự / 8 mục | Có | Cấu trúc 4 hoạt động đầy đủ, văn phong chuẩn. NHƯNG chủ đề sinh ra là "Thu thập, phân loại dữ liệu" (topic mặc định của form), không phải atom KC-4402137: LLM không thấy dữ liệu atom khi trường topic đã có sẵn. Có lỗi chính tả tiêu đề ("KỀ HOẠCH"). |
| ktdg-trac-nghiem-4-muc | Có | Live AI (cc/claude-haiku-4-5-20251001) (llm_live) | 36s | 9509 ký tự / 5 mục | Có | Câu hỏi số hữu tỉ hợp lý, có đáp án, đúng định dạng 4 lựa chọn. Phụ lục Supabase được code nối ở cuối (không do LLM sinh). |
| tlsp-cau-hoi-socratic | Có | Live AI (cc/claude-haiku-4-5-20251001) (llm_live) | 41s | 10029 ký tự / 10 mục | Có | Có chuỗi câu hỏi nhiều bậc nhưng tình huống mở đầu lan man, trộn ví dụ không liên quan (tiền điện, game); chưa bám 4 bậc Socratic thật (chỉ nối phụ lục). |
| phht-phan-hoa-3-muc | Có | Live AI (cc/claude-haiku-4-5-20251001) (llm_live) | 41s | 6616 ký tự / 4 mục | Không | Dùng đúng DNA lớp 7A1 (30 HS, nhóm 5/17/8); chiến lược phân hóa cụ thể, hợp lý. Nhắc "tỉ lệ thuận" hơi lệch chủ đề. |
| gtql-tin-nhan-zalo-ph | Có | Live AI (cc/claude-haiku-4-5-20251001) (llm_live) | 29s | 4585 ký tự / 6 mục | Không | Tin nhắn Zalo ấm áp, dùng được; tự giả định tình huống (buồn ngủ, chậm dự án) vì không có đầu vào về học sinh cụ thể. Xưng hô "cô/chú" hơi lạ. |
| cdhl-van-ban-sang-cau-hoi | Có | Live AI (cc/claude-haiku-4-5-20251001) (llm_live) | 38s | 6158 ký tự / 8 mục | Không | Bám đoạn văn mẫu về AI trong y tế/giáo dục, tóm tắt + bộ câu hỏi đúng công năng; mới chạy trên văn bản mặc định nên chưa kiểm chứng với văn bản thật. |

Atom KC-4402137 dùng cho khbd-5512, ktdg-trac-nghiem-4-muc, tlsp-cau-hoi-socratic. Ba công cụ còn lại không truyền atomId.

## 6. Ưu tiên nối dữ liệu Supabase tiếp theo

1. Đổi cơ chế chung: khi có atomId, đưa tiêu đề, yêu cầu cần đạt, quan_niem_sai và 2-3 câu hỏi mẫu VÀO prompt (không chỉ nối phụ lục) và ưu tiên tiêu đề atom làm topic. Một thay đổi này nâng cấp cả 82 công cụ.
2. tlsp-cau-hoi-socratic: đưa thẳng kịch bản Socratic 4 bậc (7.6k bản ghi) làm khung few-shot.
3. ktdg-trac-nghiem-4-muc, ktdg-15-phut, ktdg-dinh-dang-moi-2025, ktdg-ma-tran-22: lấy câu hỏi thật theo do_kho và DOK để lắp đề, LLM chỉ bổ sung và kiểm tra.
4. tlsp-du-doan-loi-tu-duy, ktdg-phan-tich-loi-sai, phht-phu-dao-lap-lo-hong, ktdg-exit-ticket: dùng trường quan_niem_sai và loi_giai.
5. cdhl-quiz-game-export, cdhl-van-ban-sang-cau-hoi, pht-bell-ringer, ktdg-de-cuong-on-tap: xuất trực tiếp câu hỏi thật sang Kahoot/Quizizz.
6. khbd-5512 và các công cụ KHBD: dùng gói (packages/assets của ~22 atom) làm khung hoạt động; phht-phan-hoa-3-muc: phân câu hỏi theo độ khó thật.
7. thlm-*: dùng 9k edges Supabase thay vì chỉ 28 cạnh cục bộ.
8. Sau cùng: bổ sung ô nhập còn thiếu (giáo án cần rà soát, thông tin học sinh cho nhận xét học bạ, URL hoặc transcript video) và gộp công cụ trùng lặp.
