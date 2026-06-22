'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Asset } from '@/types';

type AssetForm = {
  category: 'REAL_ESTATE' | 'CASH' | 'LOAN' | 'OTHER';
  name: string;
  currency: 'KRW' | 'USD';
  value: string;
  valuedAt: string;
  memo: string;
};

const emptyForm = (): AssetForm => ({
  category: 'REAL_ESTATE',
  name: '',
  currency: 'KRW',
  value: '',
  valuedAt: new Date().toISOString().split('T')[0],
  memo: '',
});

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AssetForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['REAL_ESTATE', 'CASH', 'LOAN', 'OTHER'])
  );

  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assets');
      if (res.ok) setAssets(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.value) {
      setError('명칭과 금액은 필수입니다.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const body = {
        category: form.category,
        name: form.name,
        currency: form.currency,
        value: parseFloat(form.value),
        valuedAt: form.valuedAt,
        memo: form.memo || null,
      };

      if (editingId) {
        const res = await fetch(`/api/assets/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('수정 실패');
      } else {
        const res = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('등록 실패');
      }
      setForm(emptyForm());
      setEditingId(null);
      await fetchAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setForm({
      category: asset.category,
      name: asset.name,
      currency: asset.currency,
      value: String(asset.value),
      valuedAt: asset.valuedAt.split('T')[0],
      memo: asset.memo ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 자산을 삭제할까요?')) return;
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      await fetchAssets();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 오류');
    }
  };

  const handleCancel = () => {
    setForm(emptyForm());
    setEditingId(null);
    setError('');
  };

  const realEstateAssets = assets.filter((a) => a.category === 'REAL_ESTATE');
  const cashAssets = assets.filter((a) => a.category === 'CASH');
  const loanAssets = assets.filter((a) => a.category === 'LOAN');
  const otherAssets = assets.filter((a) => a.category === 'OTHER');

  const realEstateTotalKRW = realEstateAssets.reduce(
    (s, a) => s + (a.currency === 'KRW' ? a.value : 0),
    0
  );
  const realEstateTotalUSD = realEstateAssets.reduce(
    (s, a) => s + (a.currency === 'USD' ? a.value : 0),
    0
  );
  const cashKRW = cashAssets
    .filter((a) => a.currency === 'KRW')
    .reduce((s, a) => s + a.value, 0);
  const cashUSD = cashAssets
    .filter((a) => a.currency === 'USD')
    .reduce((s, a) => s + a.value, 0);
  const loanKRW = loanAssets
    .filter((a) => a.currency === 'KRW')
    .reduce((s, a) => s + a.value, 0);
  const loanUSD = loanAssets
    .filter((a) => a.currency === 'USD')
    .reduce((s, a) => s + a.value, 0);
  const otherKRW = otherAssets
    .filter((a) => a.currency === 'KRW')
    .reduce((s, a) => s + a.value, 0);
  const otherUSD = otherAssets
    .filter((a) => a.currency === 'USD')
    .reduce((s, a) => s + a.value, 0);

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">기타 자산</h1>

      {/* 입력 폼 */}
      <div className="bg-gray-900 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">
          {editingId ? '자산 수정' : '자산 추가'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 분류 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">분류 *</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-700">
                {([['REAL_ESTATE', '부동산'], ['CASH', '현금'], ['LOAN', '대출'], ['OTHER', '기타']] as const).map(
                  ([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, category: val }))
                      }
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        form.category === val
                          ? val === 'LOAN' ? 'bg-red-700 text-white'
                          : val === 'OTHER' ? 'bg-gray-600 text-white'
                          : 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* 통화 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">통화 *</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-700">
                {(['KRW', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, currency: c }))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      form.currency === c
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* 갱신일 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">갱신일 *</label>
              <input
                type="date"
                value={form.valuedAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valuedAt: e.target.value }))
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 명칭 */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">명칭 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder={
                  form.category === 'REAL_ESTATE'
                    ? '예: 반포자이 59㎡'
                    : form.category === 'LOAN'
                    ? '예: KB 전세자금대출'
                    : form.category === 'OTHER'
                    ? '예: 자동차, 귀금속'
                    : '예: 원화 예수금'
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 금액 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {form.category === 'REAL_ESTATE'
                  ? '추정 평가액'
                  : form.category === 'LOAN'
                  ? '잔여 대출금'
                  : form.category === 'OTHER'
                  ? '추정 평가액'
                  : '잔액'}{' '}
                *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.value}
                onChange={(e) =>
                  setForm((f) => ({ ...f, value: e.target.value }))
                }
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">메모</label>
            <textarea
              value={form.memo}
              onChange={(e) =>
                setForm((f) => ({ ...f, memo: e.target.value }))
              }
              rows={2}
              placeholder="잔금 일정, 계약 조건 등 자유 메모"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? '저장 중...' : editingId ? '수정 완료' : '자산 추가'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                취소
              </button>
            )}
          </div>
        </form>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 bg-gray-900 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 부동산 */}
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('REAL_ESTATE')}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
            >
              <h2 className="text-sm font-semibold text-gray-300">부동산
                <span className="ml-2 text-xs font-normal text-gray-600">({realEstateAssets.length})</span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-500">
                  {realEstateTotalKRW > 0 && <span className="mr-2 private-value">₩{fmt(realEstateTotalKRW)}</span>}
                  {realEstateTotalUSD > 0 && <span className="private-value">${fmt(realEstateTotalUSD)}</span>}
                </div>
                <span className="text-gray-600 text-xs">{openSections.has('REAL_ESTATE') ? '▲' : '▼'}</span>
              </div>
            </button>
            {openSections.has('REAL_ESTATE') && (
              <div className="border-t border-gray-800 p-4">
                {realEstateAssets.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-4">등록된 부동산 자산이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {realEstateAssets.map((asset) => (
                      <AssetCard key={asset.id} asset={asset} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 현금 */}
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('CASH')}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
            >
              <h2 className="text-sm font-semibold text-gray-300">현금
                <span className="ml-2 text-xs font-normal text-gray-600">({cashAssets.length})</span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-500">
                  {cashKRW > 0 && <span className="mr-2 private-value">₩{fmt(cashKRW)}</span>}
                  {cashUSD > 0 && <span className="private-value">${fmt(cashUSD)}</span>}
                </div>
                <span className="text-gray-600 text-xs">{openSections.has('CASH') ? '▲' : '▼'}</span>
              </div>
            </button>
            {openSections.has('CASH') && (
              <div className="border-t border-gray-800 p-4">
                {cashAssets.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-4">등록된 현금 자산이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {cashAssets.map((asset) => (
                      <AssetCard key={asset.id} asset={asset} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 기타 */}
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('OTHER')}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
            >
              <h2 className="text-sm font-semibold text-gray-300">기타
                <span className="ml-2 text-xs font-normal text-gray-600">({otherAssets.length})</span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-500">
                  {otherKRW > 0 && <span className="mr-2 private-value">₩{fmt(otherKRW)}</span>}
                  {otherUSD > 0 && <span className="private-value">${fmt(otherUSD)}</span>}
                </div>
                <span className="text-gray-600 text-xs">{openSections.has('OTHER') ? '▲' : '▼'}</span>
              </div>
            </button>
            {openSections.has('OTHER') && (
              <div className="border-t border-gray-800 p-4">
                {otherAssets.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-4">등록된 기타 자산이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {otherAssets.map((asset) => (
                      <AssetCard key={asset.id} asset={asset} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 대출 */}
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('LOAN')}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
            >
              <h2 className="text-sm font-semibold text-gray-300">대출
                <span className="ml-2 text-xs font-normal text-gray-600">({loanAssets.length})</span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="text-xs text-red-400/70">
                  {loanKRW > 0 && <span className="mr-2 private-value">-₩{fmt(loanKRW)}</span>}
                  {loanUSD > 0 && <span className="private-value">-${fmt(loanUSD)}</span>}
                </div>
                <span className="text-gray-600 text-xs">{openSections.has('LOAN') ? '▲' : '▼'}</span>
              </div>
            </button>
            {openSections.has('LOAN') && (
              <div className="border-t border-gray-800 p-4">
                {loanAssets.length === 0 ? (
                  <p className="text-center text-gray-600 text-sm py-4">등록된 대출이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {loanAssets.map((asset) => (
                      <AssetCard key={asset.id} asset={asset} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  onEdit,
  onDelete,
}: {
  asset: Asset;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${
                asset.category === 'REAL_ESTATE'
                  ? 'bg-purple-700/40 text-purple-400'
                  : asset.category === 'LOAN'
                  ? 'bg-red-700/40 text-red-400'
                  : asset.category === 'OTHER'
                  ? 'bg-gray-700/60 text-gray-300'
                  : 'bg-yellow-700/40 text-yellow-400'
              }`}
            >
              {asset.category === 'REAL_ESTATE' ? '부동산'
                : asset.category === 'LOAN' ? '대출'
                : asset.category === 'OTHER' ? '기타'
                : '현금'}
            </span>
            <span className="font-medium text-white text-sm">{asset.name}</span>
          </div>
          <p className={`text-base font-semibold mt-1 private-value ${asset.category === 'LOAN' ? 'text-red-400' : 'text-white'}`}>
            {asset.category === 'LOAN' ? '-' : ''}
            {asset.currency === 'KRW'
              ? `₩${asset.value.toLocaleString('ko-KR')}`
              : `$${asset.value.toLocaleString('ko-KR')}`}
          </p>
          {asset.memo && (
            <p className="text-xs text-gray-500 mt-1">{asset.memo}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs text-gray-500">
            갱신일: {fmtDate(asset.valuedAt)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(asset)}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              수정
            </button>
            <button
              onClick={() => onDelete(asset.id)}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
