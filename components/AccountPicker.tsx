'use client';

import { useState } from 'react';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
  value: string | null;
  onChange: (id: string | null) => void;
  onAccountCreated: (account: Account) => void;
  onAccountDeleted?: (id: string) => void;
}

export default function AccountPicker({ accounts, value, onChange, onAccountCreated, onAccountDeleted }: Props) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const selected = safeAccounts.find((a) => a.id === value) ?? null;
  const [creating, setCreating] = useState(false);
  const [broker, setBroker] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const handleCreate = async () => {
    if (!broker.trim() || !name.trim()) {
      setErr('증권사와 계좌명 모두 입력해주세요.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: broker.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '생성 실패');
      onAccountCreated(data);
      onChange(data.id);
      setBroker(''); setName('');
      setCreating(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '계좌 생성에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (account: Account) => {
    if (!confirm(`"${account.broker} — ${account.name}" 계좌를 삭제할까요?\n연결된 종목의 계좌 정보가 해제됩니다.`)) return;
    setDeleting(account.id);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      if (value === account.id) onChange(null);
      onAccountDeleted?.(account.id);
    } catch {
      alert('계좌 삭제에 실패했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* 계좌 선택 드롭다운 */}
      <div className="flex gap-2">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">계좌 미지정</option>
          {safeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.broker} — {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setCreating((v) => !v); setErr(''); }}
          className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors shrink-0"
        >
          {creating ? '닫기' : '관리'}
        </button>
      </div>

      {selected && !creating && (
        <p className="text-xs text-gray-500">
          선택됨: <span className="text-blue-400">{selected.broker} — {selected.name}</span>
        </p>
      )}

      {/* 계좌 관리 패널 */}
      {creating && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-3">
          {/* 기존 계좌 목록 + 삭제 */}
          {safeAccounts.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium">등록된 계좌</p>
              {safeAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1 px-2 rounded bg-gray-800">
                  <span className="text-xs text-gray-300">{a.broker} — {a.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    disabled={deleting === a.id}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 ml-3 shrink-0"
                  >
                    {deleting === a.id ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 새 계좌 추가 */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-medium">새 계좌 추가</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="증권사 (예: KB증권)"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="계좌명 (예: IRP)"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '계좌 추가'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
