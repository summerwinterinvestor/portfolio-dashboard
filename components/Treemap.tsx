'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';

export interface TreemapItem {
  ticker: string;
  name: string;
  valueKRW: number;
  gainLossRate: number;
  weight: number;
  sector?: string | null;
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
  ticker?: string;
  valueKRW?: number;
  gainLossRate?: number;
  weight?: number;
  sector?: string | null;
}

interface Props {
  items: TreemapItem[];
  width?: number;
  height?: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  item: TreemapItem | null;
}

function gainLossColor(rate: number): string {
  if (rate >= 20) return '#22543d';
  if (rate >= 10) return '#276749';
  if (rate >= 5) return '#2f855a';
  if (rate >= 2) return '#38a169';
  if (rate >= 0) return '#48bb78';
  if (rate >= -2) return '#fc8181';
  if (rate >= -5) return '#f56565';
  if (rate >= -10) return '#e53e3e';
  if (rate >= -20) return '#c53030';
  return '#9b2c2c';
}

function textColor(rate: number): string {
  return Math.abs(rate) >= 2 ? '#fff' : '#e2e8f0';
}

// 섹터 팔레트 — 진한 배경 + 밝은 레이블 색
const SECTOR_PALETTE = [
  { bg: '#172554', label: '#93c5fd' },
  { bg: '#2e1065', label: '#c4b5fd' },
  { bg: '#052e16', label: '#86efac' },
  { bg: '#431407', label: '#fdba74' },
  { bg: '#500724', label: '#fbcfe8' },
  { bg: '#083344', label: '#67e8f9' },
  { bg: '#422006', label: '#fde68a' },
  { bg: '#450a0a', label: '#fca5a5' },
];
const UNCLASSIFIED = { bg: '#111827', label: '#9ca3af' };

type SectorColor = { bg: string; label: string };

function buildSectorInfo(items: TreemapItem[]): {
  hasSectors: boolean;
  sectorColorMap: Map<string, SectorColor>;
  sectorWeights: Map<string, number>;
} {
  const hasSectors = items.some((item) => item.sector?.trim());

  const totalValue = items.reduce((s, i) => s + i.valueKRW, 0);
  const sectorWeights = new Map<string, number>();
  for (const item of items) {
    const s = item.sector?.trim() || '미분류';
    sectorWeights.set(s, (sectorWeights.get(s) ?? 0) + (totalValue > 0 ? (item.valueKRW / totalValue) * 100 : 0));
  }

  if (!hasSectors) return { hasSectors: false, sectorColorMap: new Map(), sectorWeights };

  const sectorNames: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const s = item.sector?.trim() || '미분류';
    if (!seen.has(s)) { seen.add(s); sectorNames.push(s); }
  }
  sectorNames.sort((a, b) => {
    if (a === '미분류') return 1;
    if (b === '미분류') return -1;
    return 0;
  });

  const colorMap = new Map<string, SectorColor>();
  let ci = 0;
  for (const name of sectorNames) {
    if (name === '미분류') colorMap.set(name, UNCLASSIFIED);
    else { colorMap.set(name, SECTOR_PALETTE[ci % SECTOR_PALETTE.length]); ci++; }
  }
  return { hasSectors: true, sectorColorMap: colorMap, sectorWeights };
}

function buildHierarchy(items: TreemapItem[], hasSectors: boolean): TreeNode {
  if (!hasSectors) {
    return { name: 'root', children: items.map((item) => ({ ...item })) };
  }
  const sectorMap = new Map<string, TreemapItem[]>();
  for (const item of items) {
    const s = item.sector?.trim() || '미분류';
    if (!sectorMap.has(s)) sectorMap.set(s, []);
    sectorMap.get(s)!.push(item);
  }
  const entries = [...sectorMap.entries()].sort(([a], [b]) => {
    if (a === '미분류') return 1;
    if (b === '미분류') return -1;
    return 0;
  });
  return {
    name: 'root',
    children: entries.map(([s, sItems]) => ({
      name: s,
      children: sItems.map((item) => ({ ...item })),
    })),
  };
}

const PADDING_TOP = 26;

export default function Treemap({ items, width = 800, height = 480 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, item: null });
  const [svgWidth, setSvgWidth] = useState(width);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSvgWidth(w);
    });
    observer.observe(containerRef.current);
    setSvgWidth(containerRef.current.clientWidth || width);
    return () => observer.disconnect();
  }, [width]);

  const { hasSectors, sectorColorMap, sectorWeights } = useMemo(() => buildSectorInfo(items), [items]);

  useEffect(() => {
    if (!svgRef.current || items.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rootData = buildHierarchy(items, hasSectors);

    const root = d3
      .hierarchy<TreeNode>(rootData)
      .sum((d) => d.valueKRW ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const totalValue = root.value ?? 1;

    const treemapLayout = d3
      .treemap<TreeNode>()
      .size([svgWidth, height])
      .paddingOuter(hasSectors ? 10 : 4)
      .paddingTop((d: d3.HierarchyNode<TreeNode>) => (hasSectors && d.depth === 1 ? PADDING_TOP : 0))
      .paddingInner(3)
      .round(true);

    treemapLayout(root);

    type RectNode = d3.HierarchyRectangularNode<TreeNode>;

    // ── 섹터 그룹 배경 + 레이블 ──────────────────────────────
    if (hasSectors) {
      const sectorNodes = root.descendants().filter((d) => d.depth === 1) as RectNode[];

      // 섹터 배경 (진한 다크 컬러)
      svg
        .selectAll('.sector-bg')
        .data(sectorNodes)
        .enter()
        .append('rect')
        .attr('class', 'sector-bg')
        .attr('x', (d) => d.x0)
        .attr('y', (d) => d.y0)
        .attr('width', (d) => Math.max(0, d.x1 - d.x0))
        .attr('height', (d) => Math.max(0, d.y1 - d.y0))
        .attr('fill', (d) => sectorColorMap.get(d.data.name)?.bg ?? '#111827')
        .attr('rx', 6);

      // 섹터 레이블 (이름 + 비중%)
      svg
        .selectAll('.sector-label')
        .data(sectorNodes)
        .enter()
        .append('text')
        .attr('class', 'sector-label')
        .attr('x', (d) => d.x0 + 8)
        .attr('y', (d) => d.y0 + 17)
        .attr('fill', (d) => sectorColorMap.get(d.data.name)?.label ?? '#9ca3af')
        .attr('font-size', '11px')
        .attr('font-weight', '700')
        .attr('letter-spacing', '0.02em')
        .text((d) => {
          const w = d.x1 - d.x0;
          if (w < 36) return '';
          const name = d.data.name;
          const pct = `${((d.value ?? 0) / totalValue * 100).toFixed(1)}%`;
          const full = `${name}  ${pct}`;
          const maxChars = Math.floor((w - 12) / 6.5);
          if (maxChars <= 0) return '';
          if (full.length <= maxChars) return full;
          // 이름 축약
          const pctLen = pct.length + 2;
          const nameRoom = maxChars - pctLen;
          if (nameRoom >= 2) return `${name.slice(0, nameRoom - 1)}…  ${pct}`;
          return pct;
        });
    }

    // ── 개별 종목 셀 ─────────────────────────────────────────
    const leaves = root.leaves() as RectNode[];

    const g = svg
      .selectAll('.stock-cell')
      .data(leaves)
      .enter()
      .append('g')
      .attr('class', 'stock-cell')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event: MouseEvent, d) {
        const item = d.data as TreemapItem;
        const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
        setTooltip({ visible: true, x: event.clientX - rect.left, y: event.clientY - rect.top, item });
      })
      .on('mousemove', function (event: MouseEvent) {
        const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
        setTooltip((prev) => ({ ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top }));
      })
      .on('mouseleave', function () {
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    g.append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d) => gainLossColor(d.data.gainLossRate ?? 0))
      .attr('rx', 4);

    // 종목명
    g.append('text')
      .attr('x', 8)
      .attr('y', 22)
      .attr('fill', (d) => textColor(d.data.gainLossRate ?? 0))
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text((d) => {
        const w = d.x1 - d.x0;
        const name = d.data.name ?? '';
        if (w < 50) return '';
        return name.length > 8 ? name.slice(0, 7) + '…' : name;
      });

    // 수익률
    g.append('text')
      .attr('x', 8)
      .attr('y', 40)
      .attr('class', 'private-value')
      .attr('fill', (d) => textColor(d.data.gainLossRate ?? 0))
      .attr('font-size', '11px')
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 50 || h < 40) return '';
        const rate = d.data.gainLossRate ?? 0;
        return `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
      });

  }, [items, svgWidth, height, hasSectors, sectorColorMap]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        width={svgWidth}
        height={height}
        className="w-full"
        style={{ display: 'block' }}
      />

      {/* 섹터 범례 + 비중 */}
      {hasSectors && sectorColorMap.size > 0 && (
        <div className="mt-4 flex flex-wrap" style={{ gap: '10px 32px' }}>
          {[...sectorColorMap.entries()]
            .sort(([a], [b]) => {
              if (a === '미분류') return 1;
              if (b === '미분류') return -1;
              return (sectorWeights.get(b) ?? 0) - (sectorWeights.get(a) ?? 0);
            })
            .map(([name, color]) => {
            const pct = sectorWeights.get(name) ?? 0;
            return (
              <div key={name} className="flex items-center" style={{ gap: 6 }}>
                <div
                  className="rounded-sm shrink-0"
                  style={{ width: 12, height: 12, backgroundColor: color.bg, outline: `1.5px solid ${color.label}` }}
                />
                <span className="text-xs text-gray-300">{name}</span>
                <span className="text-xs font-medium" style={{ color: color.label }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 툴팁 */}
      {tooltip.visible && tooltip.item && (
        <div
          className="absolute pointer-events-none z-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: tooltip.x > svgWidth * 0.65 ? 'translateX(-120%)' : undefined,
          }}
        >
          <p className="font-semibold text-white mb-1">{tooltip.item.name}</p>
          <p className="text-gray-400">{tooltip.item.ticker}</p>
          {tooltip.item.sector && (
            <p className="text-gray-500 mt-0.5">{tooltip.item.sector}</p>
          )}
          <p className="text-gray-300 mt-1">
            평가금액: <span className="private-value">₩{tooltip.item.valueKRW.toLocaleString('ko-KR')}</span>
          </p>
          <p className={tooltip.item.gainLossRate >= 0 ? 'text-green-400' : 'text-red-400'}>
            수익률:{' '}
            <span className="private-value">
              {tooltip.item.gainLossRate >= 0 ? '+' : ''}
              {tooltip.item.gainLossRate.toFixed(2)}%
            </span>
          </p>
          <p className="text-gray-400">비중: {tooltip.item.weight.toFixed(1)}%</p>
        </div>
      )}
    </div>
  );
}
