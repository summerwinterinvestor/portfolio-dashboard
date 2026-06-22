'use client';

import { useState } from 'react';
import type { Account } from '@/types';
import HoldingForm from './HoldingForm';

interface Props {
  accounts: Account[];
}

export default function HoldingManager({ accounts }: Props) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mb-6">
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span> 종목 추가
        </button>
      )}

      {showForm && (
        <div className="bg-gray-900 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">보유 종목 추가</h2>
          <HoldingForm onDone={() => setShowForm(false)} initialAccounts={accounts} />
        </div>
      )}
    </div>
  );
}
