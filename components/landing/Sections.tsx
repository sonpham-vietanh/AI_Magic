import Image from 'next/image';
import { Icon, type IconName } from '@/components/ui/icons';
import { IllExam, IllPlan, IllQuiz, IllResources, IllSlide, IllWorksheet } from './Illustrations';

function GoogleG() {
  return (
    <span className="lp-g" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="20" height="20" focusable="false">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
        <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 019.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 000 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
    </span>
  );
}

export function TopBar({ ctaHref, showCta }: { ctaHref: string; showCta: boolean }) {
  return (
    <header className="lp-top">
      <div className="lp-wrap lp-top-in">
        <a href="#main" className="lp-brand" aria-label="Việt Anh MagicStudio, về đầu trang">
          <Image src="/logo-crest.webp" alt="" width={44} height={44} priority className="lp-crest" />
          <span className="lp-brand-txt">
            <strong>Việt Anh MagicStudio</strong>
            <small>Trường TH - THCS - THPT Việt Anh</small>
          </span>
        </a>
        <nav className="lp-nav" aria-label="Các phần của trang">
          <a href="#quy-trinh">Quy trình</a>
          <a href="#cach-hoat-dong">Cách hoạt động</a>
          <a href="#tin-cay">Tin cậy</a>
          <a href="#hoi-dap">Hỏi đáp</a>
        </nav>
        {showCta && (
          <a href={ctaHref} className="lp-btn lp-btn-sm">
            Đăng nhập
          </a>
        )}
      </div>
    </header>
  );
}

export function Hero({ checking, error, href }: { checking: boolean; error: string | null; href: string }) {
  return (
    <section className="lp-hero" aria-labelledby="lp-h1">
      <div className="lp-hero-bg" aria-hidden="true" />
      <div className="lp-wrap lp-hero-in">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">
            <Icon name="sparkles" size={16} /> Dành cho giáo viên Trường Việt Anh
          </p>
          <h1 id="lp-h1">
            Soạn học liệu <span className="lp-hl">chuẩn chương trình</span>, nhanh hơn một buổi chiều.
          </h1>
          <p className="lp-lead">
            Từ một bài học trong Kho học liệu chuẩn, AI dựng sẵn kế hoạch bài dạy, slide, phiếu học tập, quiz và đề kiểm tra.
            Cô/thầy chỉ cần xem lại, chỉnh theo lớp mình và dùng ngay.
          </p>

          {error && (
            <div role="alert" className="lp-alert">
              <Icon name="alert" size={20} />
              <span>{error}</span>
            </div>
          )}

          <div className="lp-cta-row">
            {checking ? (
              <p role="status" className="lp-checking">
                <span className="lp-spin" aria-hidden="true" /> Đang kiểm tra phiên đăng nhập…
              </p>
            ) : (
              <a href={href} className="lp-btn lp-btn-lg">
                <GoogleG />
                Đăng nhập bằng Google (email trường)
              </a>
            )}
          </div>
          <p className="lp-note">
            <Icon name="shield" size={16} /> <span>Chỉ tài khoản <strong>@truongvietanh.com</strong> được vào. Chưa có tài khoản thì liên hệ phòng IT.</span>
          </p>
        </div>

        <div className="lp-hero-art" aria-hidden="true">
          <div className="lp-mock">
            <div className="lp-mock-bar">
              <i />
              <i />
              <i />
              <span>MagicStudio · Soạn bài</span>
            </div>
            <div className="lp-mock-body">
              <div className="lp-mock-ask">Soạn kế hoạch bài dạy: Phân số (Toán 5)</div>
              <div className="lp-mock-steps">
                <div className="done">
                  <Icon name="check" size={14} /> Lấy bản chuẩn từ Kho
                </div>
                <div className="done">
                  <Icon name="check" size={14} /> Dựng mục tiêu, tiến trình
                </div>
                <div className="live">
                  <span className="lp-dot" /> Soạn phiếu học tập
                </div>
              </div>
              <div className="lp-mock-card">
                <b>Kế hoạch bài dạy</b>
                <span />
                <span />
                <span className="short" />
              </div>
            </div>
          </div>
          <div className="lp-float lp-float-a">
            <Icon name="slides" size={18} /> Slide
          </div>
          <div className="lp-float lp-float-b">
            <Icon name="quiz" size={18} /> Quiz
          </div>
          <Image src="/logo-crest.webp" alt="" width={120} height={120} className="lp-art-crest" />
        </div>
      </div>
      <div className="lp-curve" aria-hidden="true" />
    </section>
  );
}

const FLOWS: { title: string; tag: string; text: string; ill: React.ReactNode }[] = [
  {
    title: 'Kế hoạch bài dạy',
    tag: 'Công văn 5512',
    text: 'Đủ bốn phần: mục tiêu, thiết bị, tiến trình bốn hoạt động, phụ lục. Đúng khung Bộ GD&ĐT yêu cầu.',
    ill: <IllPlan />,
  },
  {
    title: 'Slide bài giảng',
    tag: 'Trình chiếu',
    text: 'Bộ slide bám tiến trình bài dạy, chữ lớn, rõ trên lớp. Mở trình chiếu ngay trong trình duyệt.',
    ill: <IllSlide />,
  },
  {
    title: 'Phiếu học tập',
    tag: 'In được',
    text: 'Phiếu có câu hỏi, chỗ ghi và bảng, sẵn sàng in khổ A4 hoặc giao cho học sinh làm trên máy.',
    ill: <IllWorksheet />,
  },
  {
    title: 'Quiz trắc nghiệm',
    tag: 'Có đáp án',
    text: 'Câu hỏi nhiều lựa chọn kèm đáp án và giải thích ngắn, dùng để khởi động hoặc chốt bài.',
    ill: <IllQuiz />,
  },
  {
    title: 'Đề kiểm tra và ma trận',
    tag: 'Thông tư 22',
    text: 'Ma trận nhận biết, thông hiểu, vận dụng đi cùng đề, để cô/thầy kiểm soát được mức độ.',
    ill: <IllExam />,
  },
  {
    title: '6 dạng tài nguyên',
    tag: 'Một bài, nhiều dạng',
    text: 'Văn bản, slide, video, podcast, biểu đồ, câu hỏi: cùng một bài, chọn dạng hợp với lớp.',
    ill: <IllResources />,
  },
];

export function Workflows() {
  return (
    <section id="quy-trinh" className="lp-sec" aria-labelledby="lp-wf">
      <div className="lp-wrap">
        <p className="lp-kicker">6 quy trình cứng</p>
        <h2 id="lp-wf">Mỗi loại học liệu có một quy trình cố định, không soạn tuỳ hứng</h2>
        <p className="lp-sub">
          Quy trình được cài sẵn theo văn bản của Bộ, nên kết quả luôn đủ cấu phần và nhất quán giữa các cô/thầy.
        </p>
        <ul className="lp-flows">
          {FLOWS.map((f, i) => (
            <li key={f.title} className="lp-flow">
              <div className="lp-flow-art">{f.ill}</div>
              <div className="lp-flow-body">
                <span className="lp-flow-tag">
                  {String(i + 1).padStart(2, '0')} · {f.tag}
                </span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'library', title: 'Chọn bài', text: 'Chọn khối, môn và bài học trong Kho học liệu. Không cần gõ lại nội dung từ đầu.' },
  {
    icon: 'sparkles',
    title: 'AI soạn từ bản chuẩn trong Kho',
    text: 'AI dựng học liệu dựa trên bản chuẩn đã được duyệt, bám khung chương trình, không bịa nguồn.',
  },
  {
    icon: 'shield',
    title: 'Cô/thầy duyệt và dùng',
    text: 'Cô/thầy đọc, sửa theo lớp, rồi in, trình chiếu hoặc lưu vào lịch sử. Quyết định cuối cùng là của giáo viên.',
  },
];

export function Steps() {
  return (
    <section id="cach-hoat-dong" className="lp-sec lp-sec-alt" aria-labelledby="lp-steps">
      <div className="lp-wrap">
        <p className="lp-kicker">Cách hoạt động</p>
        <h2 id="lp-steps">Ba bước từ bài học đến học liệu dùng được</h2>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lp-step">
              <span className="lp-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span className="lp-step-ic" aria-hidden="true">
                <Icon name={s.icon} size={26} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const TRUST: { icon: IconName; title: string; text: string }[] = [
  { icon: 'book', title: 'Chuẩn GDPT 2018', text: 'Mục tiêu và yêu cầu cần đạt bám Chương trình giáo dục phổ thông 2018.' },
  { icon: 'file', title: 'Công văn 5512', text: 'Kế hoạch bài dạy theo đúng cấu trúc hướng dẫn của Bộ GD&ĐT.' },
  { icon: 'exam', title: 'Thông tư 22', text: 'Đề kiểm tra và đánh giá theo quy định, có ma trận đi kèm.' },
  { icon: 'library', title: 'Kho có người duyệt', text: 'Bản chuẩn trong Kho phải qua người duyệt chuyên môn trước khi dùng làm gốc.' },
  {
    icon: 'newspaper',
    title: 'Kiểm soát nội dung thời sự',
    text: 'Nội dung thời sự được kiểm soát riêng, tránh đưa thông tin chưa kiểm chứng vào bài giảng.',
  },
];

export function Trust() {
  return (
    <section id="tin-cay" className="lp-sec lp-trust" aria-labelledby="lp-trust">
      <div className="lp-wrap">
        <p className="lp-kicker lp-kicker-gold">Vì sao tin cậy được</p>
        <h2 id="lp-trust">Đúng văn bản, có người duyệt, minh bạch nguồn</h2>
        <ul className="lp-trust-grid">
          {TRUST.map((t) => (
            <li key={t.title}>
              <span className="lp-trust-ic" aria-hidden="true">
                <Icon name={t.icon} size={22} />
              </span>
              <div>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Ai đăng nhập được?',
    a: 'Cô/thầy có email Google Workspace của trường, đuôi @truongvietanh.com. Tài khoản Gmail cá nhân hoặc email khác sẽ không vào được. Nếu chưa có tài khoản, cô/thầy liên hệ phòng IT của trường.',
  },
  {
    q: 'Dữ liệu của tôi được lưu ở đâu?',
    a: 'Học liệu đã lưu, lịch sử soạn bài và tuỳ chọn của cô/thầy được lưu trên hệ thống của trường: máy chủ riêng của trường và cơ sở dữ liệu Supabase do trường quản lý, gắn với email trường. Tài khoản chỉ dùng email trường, không dùng tài khoản cá nhân. Cô/thầy không nên nhập thông tin cá nhân của học sinh vào khung soạn.',
  },
  {
    q: 'AI có thay giáo viên không?',
    a: 'Không. AI chỉ dựng bản nháp từ bản chuẩn trong Kho để tiết kiệm thời gian. Cô/thầy luôn là người đọc, sửa và quyết định học liệu nào được dùng với học sinh.',
  },
];

export function Faq() {
  return (
    <section id="hoi-dap" className="lp-sec" aria-labelledby="lp-faq">
      <div className="lp-wrap lp-faq-wrap">
        <div>
          <p className="lp-kicker">Hỏi đáp</p>
          <h2 id="lp-faq">Những điều cô/thầy hay hỏi</h2>
        </div>
        <div className="lp-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <Icon name="chevronDown" size={20} className="lp-chev" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Closing({ checking, href }: { checking: boolean; href: string }) {
  return (
    <section className="lp-closing" aria-label="Bắt đầu">
      <div className="lp-wrap lp-closing-in">
        <h2>Sẵn sàng soạn bài tiếp theo?</h2>
        {!checking && (
          <a href={href} className="lp-btn lp-btn-lg">
            <GoogleG />
            Đăng nhập bằng Google (email trường)
          </a>
        )}
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="lp-foot">
      <div className="lp-wrap lp-foot-in">
        <Image
          src="/logo-vietanh.webp"
          alt="Trường TH - THCS - THPT Việt Anh, đào tạo học sinh giỏi chuyên Anh"
          width={176}
          height={86}
          className="lp-foot-logo"
        />
        <p>
          Việt Anh MagicStudio là công cụ nội bộ của Trường TH - THCS - THPT Việt Anh, dùng để hỗ trợ giáo viên soạn học liệu. Cần hỗ trợ tài
          khoản, cô/thầy liên hệ phòng IT của trường.
        </p>
        <p className="lp-copy">© {new Date().getFullYear()} Trường Việt Anh.</p>
      </div>
    </footer>
  );
}
