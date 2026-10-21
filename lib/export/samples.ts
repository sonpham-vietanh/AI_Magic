// Dữ liệu mẫu tự viết (không gọi AI) để thử hiển thị/xuất tệp. Chủ đề: Quang hợp (Sinh học 11).
import type { Artifact } from '@/lib/resources/types';

export const SAMPLE_ARTIFACTS: Artifact[] = [
  {
    kind: 'slides',
    title: 'Quang hợp ở thực vật',
    data: {
      title: 'Quang hợp ở thực vật',
      slides: [
        { title: 'Cây xanh "ăn" gì để lớn lên?', bullets: ['Cây không có miệng nhưng vẫn lớn', 'Thức ăn của cây đến từ đâu?', 'Hôm nay ta đi tìm câu trả lời'], notes: 'Cho học sinh đoán 1 phút trước khi vào bài. Ghi các đáp án lên bảng.', visual: 'Ảnh hạt đậu nảy mầm trong ly nước, cạnh một cây cao.' },
        { title: 'Quang hợp là gì?', bullets: ['Quá trình lá cây hấp thụ ánh sáng', 'Biến CO2 và nước thành đường (glucose)', 'Giải phóng khí oxi ra môi trường'], notes: 'Nhấn mạnh: năng lượng ánh sáng được chuyển thành năng lượng hoá học.' },
        { title: 'Phương trình tổng quát', bullets: ['6CO2 + 6H2O + ánh sáng -> C6H12O6 + 6O2', 'Chất diệp lục là nơi hấp thụ ánh sáng', 'Diễn ra chủ yếu ở lục lạp của tế bào lá'], visual: 'Sơ đồ mũi tên: CO2 và H2O đi vào lá, đường và O2 đi ra.' },
        { title: 'Tổng kết', bullets: ['Quang hợp tạo chất hữu cơ cho cây và cho mọi sinh vật khác', 'Quang hợp giữ cân bằng khí oxi và CO2 của Trái Đất', 'Ba điều kiện: ánh sáng, nước, khí CO2'], notes: 'Cho học sinh nêu lại ba điều kiện bằng lời của mình.' },
      ],
    },
  },
  {
    kind: 'worksheet',
    title: 'Phiếu học tập: Quang hợp',
    data: {
      title: 'Phiếu học tập: Quang hợp',
      sections: [
        { heading: 'Phần 1. Nhớ và hiểu', items: [
          { prompt: 'Kể tên hai nguyên liệu cây dùng để quang hợp.', lines: 2, level: 'nho' },
          { prompt: 'Giải thích vì sao lá cây thường có màu xanh.', lines: 3, level: 'hieu' },
        ] },
        { heading: 'Phần 2. Vận dụng', items: [
          { prompt: 'Một chậu cây đặt trong tủ kín suốt một tuần sẽ héo đi. Em hãy giải thích hiện tượng này bằng kiến thức về quang hợp.', lines: 4, level: 'van_dung' },
        ] },
      ],
      answerKey: [
        { heading: 'Câu 1', body: 'Khí CO2 và nước.' },
        { heading: 'Câu 2', body: 'Lá chứa chất diệp lục, chất này hấp thụ ánh sáng đỏ và xanh tím nhưng phản xạ ánh sáng lục.' },
        { heading: 'Câu 3', body: 'Thiếu ánh sáng nên cây không quang hợp, không tạo được chất hữu cơ nên suy yếu và héo.\nGợi ý chấm: 1 điểm nếu nêu thiếu ánh sáng, 1 điểm nếu nêu hệ quả với chất hữu cơ.' },
      ],
    },
  },
  {
    kind: 'text',
    title: 'Bài đọc: Quang hợp',
    data: {
      title: 'Quang hợp: cách cây tự làm ra thức ăn',
      sections: [
        { heading: 'Cây lấy năng lượng từ đâu?', body: 'Khác với con người, cây xanh tự tạo ra thức ăn cho mình. Nhờ ánh sáng mặt trời, lá cây biến khí cacbonic và nước thành đường.\nQuá trình này gọi là quang hợp.' },
        { heading: 'Lá cây là xưởng sản xuất', body: 'Trong lá có các lục lạp chứa chất diệp lục. Chất này hấp thụ ánh sáng và khởi động chuỗi phản ứng tạo glucose, đồng thời giải phóng oxi.' },
      ],
    },
  },
  {
    kind: 'mindmap',
    title: 'Sơ đồ tư duy: Quang hợp',
    data: {
      title: 'Sơ đồ tư duy: Quang hợp',
      root: {
        id: 'r', label: 'Quang hợp',
        children: [
          { id: 'a', label: 'Nguyên liệu', children: [{ id: 'a1', label: 'Khí CO2 từ không khí' }, { id: 'a2', label: 'Nước hút từ rễ' }, { id: 'a3', label: 'Ánh sáng mặt trời' }] },
          { id: 'b', label: 'Nơi diễn ra', children: [{ id: 'b1', label: 'Lục lạp trong tế bào lá', children: [{ id: 'b11', label: 'Chất diệp lục hấp thụ ánh sáng' }] }] },
          { id: 'c', label: 'Sản phẩm', children: [{ id: 'c1', label: 'Đường glucose' }, { id: 'c2', label: 'Khí oxi' }] },
          { id: 'd', label: 'Ý nghĩa' },
        ],
      },
    },
  },
  {
    kind: 'infographic',
    title: 'Infographic: Quang hợp',
    data: {
      title: 'Quang hợp: nhà máy xanh của Trái Đất',
      subtitle: 'Sinh học 11 · 1 tiết',
      keyPoints: [
        { label: 'Là gì', text: 'Cây dùng ánh sáng để biến CO2 và nước thành đường.' },
        { label: 'Ở đâu', text: 'Chủ yếu trong lục lạp của tế bào lá.' },
        { label: 'Cần gì', text: 'Ánh sáng, nước, khí CO2 và chất diệp lục.' },
        { label: 'Cho ra gì', text: 'Glucose nuôi cây và khí oxi cho môi trường.' },
      ],
      steps: [
        { n: 1, title: 'Hấp thụ ánh sáng', text: 'Chất diệp lục thu năng lượng ánh sáng mặt trời.' },
        { n: 2, title: 'Tách nước', text: 'Nước bị tách, giải phóng khí oxi.' },
        { n: 3, title: 'Tạo đường', text: 'CO2 được cố định thành glucose.' },
      ],
      facts: [
        { value: '6', caption: 'phân tử CO2 cho mỗi phân tử glucose' },
        { value: '~21%', caption: 'oxi trong không khí, nhờ quang hợp duy trì' },
        { value: '3', caption: 'điều kiện chính: sáng, nước, CO2' },
      ],
      takeaway: 'Không có quang hợp thì không có oxi để thở và không có thức ăn cho hầu hết sinh vật.',
    },
  },
  {
    kind: 'podcast',
    title: 'Podcast: Quang hợp',
    data: {
      title: 'Podcast: Cây xanh làm gì cả ngày?',
      durationMin: 5,
      hosts: ['Minh', 'Lan'],
      lines: [
        { speaker: 'Minh', text: 'Chào các bạn, hôm nay mình và Lan sẽ nói về một điều rất quen: cây xanh làm gì cả ngày?' },
        { speaker: 'Lan', text: 'Nghe thì như cây đứng yên, nhưng thật ra lá đang làm việc rất chăm chỉ đó.' },
        { speaker: 'Minh', text: 'Đúng rồi, lá cây hấp thụ ánh sáng để biến khí cacbonic và nước thành đường.' },
        { speaker: 'Lan', text: 'Và còn tặng chúng ta khí oxi nữa. Quá trình này tên là quang hợp.' },
      ],
    },
  },
  {
    kind: 'tranh_luan',
    title: 'Tranh luận: Trồng cây hay giảm khí thải?',
    data: {
      title: 'Tranh luận: Trồng cây hay giảm khí thải?',
      topic: 'Để giảm CO2 trong khí quyển, nên ưu tiên trồng thêm cây xanh hay cắt giảm khí thải?',
      experts: [
        { name: 'TS. Hà (Sinh thái học)', stance: 'Ưu tiên trồng cây vì quang hợp hấp thụ CO2 tự nhiên.' },
        { name: 'KS. Quân (Năng lượng)', stance: 'Ưu tiên cắt giảm khí thải tại nguồn vì cây hấp thụ quá chậm.' },
      ],
      lines: [
        { speaker: 'TS. Hà', text: 'Quang hợp là cơ chế hấp thụ CO2 đã tồn tại hàng tỷ năm, ta nên mở rộng nó.' },
        { speaker: 'KS. Quân', text: 'Nhưng một cây phải mất nhiều năm mới hấp thụ được lượng CO2 mà một chuyến bay thải ra trong vài giờ.' },
        { speaker: 'TS. Hà', text: 'Rừng còn giữ nước, giữ đất, nuôi động vật. Lợi ích không chỉ là CO2.' },
        { speaker: 'KS. Quân', text: 'Đồng ý, nhưng nếu không giảm nguồn thải thì rừng không bao giờ theo kịp.' },
      ],
      conclusion: 'Hai hướng bổ sung cho nhau: giảm khí thải là việc cấp bách, trồng và giữ rừng là việc lâu dài.',
    },
  },
  {
    kind: 'video',
    title: 'Video: Hành trình của một tia nắng',
    data: {
      title: 'Video: Hành trình của một tia nắng',
      totalMin: 2,
      scenes: [
        { n: 1, durationSec: 20, visual: 'Mặt trời mọc trên cánh đồng, tia nắng chạm vào chiếc lá.', narration: 'Mỗi sáng, một tia nắng bắt đầu hành trình dài 150 triệu ki-lô-mét.', onScreenText: 'Hành trình của một tia nắng' },
        { n: 2, durationSec: 40, visual: 'Phóng to chiếc lá, thấy các lục lạp xanh.', narration: 'Trong lá, hàng triệu lục lạp chứa chất diệp lục đang chờ đón ánh sáng.', onScreenText: 'Lục lạp + chất diệp lục' },
        { n: 3, durationSec: 40, visual: 'Hoạt hình CO2 và nước đi vào, đường và oxi đi ra.', narration: 'Năng lượng của tia nắng biến khí cacbonic và nước thành đường và oxi.' },
        { n: 4, durationSec: 20, visual: 'Một em bé hít thở giữa vườn cây.', narration: 'Và hơi thở của chúng ta có được là nhờ hành trình ấy.', onScreenText: 'Cảm ơn cây xanh' },
      ],
    },
  },
];
