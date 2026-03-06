import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tin tức',
  description: 'Tin tức chứng khoán mới nhất từ thị trường Việt Nam — cập nhật liên tục từ các doanh nghiệp niêm yết.',
  alternates: { canonical: '/news' },
  openGraph: {
    title: 'Tin tức Chứng khoán | Quang Anh',
    description: 'Tin tức chứng khoán mới nhất từ thị trường Việt Nam.',
    url: '/news',
  },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
