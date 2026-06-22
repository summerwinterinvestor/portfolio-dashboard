'use client';

import { useState, useEffect } from 'react';

export default function PrivacyToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const on = localStorage.getItem('privacy') === 'on';
    setHidden(on);
    document.documentElement.classList.toggle('privacy-on', on);
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    localStorage.setItem('privacy', next ? 'on' : 'off');
    document.documentElement.classList.toggle('privacy-on', next);
  };

  return (
    <>
      {hidden && (
        <style>{`.private-value{filter:blur(8px)!important;user-select:none!important;transition:filter .15s}`}</style>
      )}
    <button
      onClick={toggle}
      title={hidden ? '금액 표시' : '금액 가리기'}
      className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
    >
      {hidden ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
    </>
  );
}
