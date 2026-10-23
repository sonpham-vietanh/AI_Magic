'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Closing, Faq, Footer, Hero, Steps, TopBar, Trust, Workflows } from '@/components/landing/Sections';
import { googleStartHref, loginErrorMessage, safeReturnTo } from '@/components/landing/errors';

function LoginInner() {
  const params = useSearchParams();
  const error = loginErrorMessage(params.get('error'));
  const returnTo = safeReturnTo(params.get('returnTo'));
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Đã có phiên thì vào thẳng nơi cần đến.
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.session?.via === 'google') {
          window.location.replace(returnTo);
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [returnTo]);

  const href = googleStartHref(returnTo);

  return (
    <div className="lp">
      <TopBar ctaHref={href} showCta={!checking} />
      <main id="main" tabIndex={-1}>
        <Hero checking={checking} error={error} href={href} />
        <Workflows />
        <Steps />
        <Trust />
        <Faq />
        <Closing checking={checking} href={href} />
      </main>
      <Footer />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
