import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Việt Anh MagicStudio',
    short_name: 'MagicStudio',
    description: 'Soạn học liệu chuẩn chương trình cho giáo viên Trường Việt Anh.',
    start_url: '/',
    display: 'standalone',
    background_color: '#14153A',
    theme_color: '#14153A',
    lang: 'vi',
    icons: [
      { src: '/icon.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
