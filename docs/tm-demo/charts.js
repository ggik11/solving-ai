/** 외부 라이브러리 없이 SVG로 그리는 보고서용 차트. 색은 style.css의 클래스로 정한다. */

const NS = "http://www.w3.org/2000/svg";

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  if (text != null) node.textContent = text;
  return node;
}

function svgRoot(width, height, label) {
  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": label,
    class: "chart",
  });
  return svg;
}

const pctText = (v) => `${Math.round(v * 100)}%`;

/**
 * 가로 막대 비교. rows: [{label, rate, emphasis?, valueText?}]
 * refs: [{rate, label}] 세로 기준선.
 */
export function horizontalBars({ rows, label, refs = [], labelWidth = 220 }) {
  const width = 680;
  const rowH = 38;
  const top = 30;
  const plotW = width - labelWidth - 70;
  const height = top + rows.length * rowH + (refs.length ? 28 : 10);
  const svg = svgRoot(width, height, label);
  const x = (v) => labelWidth + v * plotW;

  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    svg.append(el("line", { x1: x(t), x2: x(t), y1: top - 6, y2: top + rows.length * rowH - 8, class: "grid" }));
    svg.append(el("text", { x: x(t), y: top - 12, "text-anchor": "middle", class: "tick" }, pctText(t)));
  });

  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const g = el("g");
    g.append(el("text", { x: labelWidth - 12, y: y + 17, "text-anchor": "end", class: r.emphasis ? "label strong" : "label" }, r.label));
    const bar = el("rect", { x: labelWidth, y: y + 4, width: Math.max(1, r.rate * plotW), height: 20, rx: 3, class: r.emphasis ? "bar accent" : "bar" });
    bar.append(el("title", {}, `${r.label}: ${r.valueText ?? pctText(r.rate)}`));
    g.append(bar);
    g.append(el("text", { x: x(r.rate) + 8, y: y + 19, class: r.emphasis ? "value strong" : "value" }, r.valueText ?? pctText(r.rate)));
    svg.append(g);
  });

  refs.forEach((ref) => {
    const yEnd = top + rows.length * rowH - 8;
    svg.append(el("line", { x1: x(ref.rate), x2: x(ref.rate), y1: top - 6, y2: yEnd, class: "ref" }));
    svg.append(el("text", { x: x(ref.rate), y: yEnd + 18, "text-anchor": "middle", class: "tick" }, ref.label));
  });
  return svg;
}

/** 혼동행렬 히트맵. grid[행=실제][열=예측], names: 짧은 한글 이름. */
export function confusionHeatmap({ grid, names, label }) {
  const n = names.length;
  const cell = 58;
  const left = 132;
  const top = 108;
  const width = left + n * cell + 16;
  const height = top + n * cell + 16;
  const svg = svgRoot(width, height, label);
  const max = Math.max(1, ...grid.flat());

  svg.append(el("text", { x: left + (n * cell) / 2, y: 16, "text-anchor": "middle", class: "axis-title" }, "예측한 분야 →"));
  svg.append(el("text", { x: 14, y: top - 10, class: "axis-title" }, "실제 분야 ↓"));

  names.forEach((name, j) => {
    const cx = left + j * cell + cell / 2;
    const t = el("text", { x: cx, y: top - 10, "text-anchor": "start", transform: `rotate(-40 ${cx} ${top - 10})`, class: "tick" }, name);
    svg.append(t);
  });
  names.forEach((name, i) => {
    svg.append(el("text", { x: left - 8, y: top + i * cell + cell / 2 + 4, "text-anchor": "end", class: "tick" }, name));
  });

  grid.forEach((row, i) => {
    const support = row.reduce((s, v) => s + v, 0);
    row.forEach((v, j) => {
      const g = el("g");
      const diag = i === j;
      const rect = el("rect", {
        x: left + j * cell + 1,
        y: top + i * cell + 1,
        width: cell - 2,
        height: cell - 2,
        rx: 4,
        class: diag ? "cell cell-diag" : "cell cell-off",
        "fill-opacity": v === 0 ? 0.06 : 0.18 + 0.82 * (v / max),
      });
      rect.append(el("title", {}, `실제 ${names[i]} → 예측 ${names[j]}: ${v}장${support ? ` (실제 ${support}장 중)` : ""}`));
      g.append(rect);
      if (v > 0) {
        g.append(el("text", { x: left + j * cell + cell / 2, y: top + i * cell + cell / 2 + 5, "text-anchor": "middle", class: v / max > 0.55 ? "cell-text on-strong" : "cell-text" }, String(v)));
      }
      svg.append(g);
    });
  });
  return svg;
}

/** 임계값 곡선: 기준을 높이면 통과율은 줄고 통과한 것의 정확도는 오른다. */
export function sweepChart({ points, current, label }) {
  const width = 680;
  const height = 300;
  const left = 56;
  const right = 150;
  const top = 24;
  const bottom = 48;
  const svg = svgRoot(width, height, label);
  const xs = points.map((p) => p.minTopScore);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const X = (v) => left + ((v - xMin) / (xMax - xMin || 1)) * (width - left - right);
  const Y = (v) => top + (1 - v) * (height - top - bottom);

  [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
    svg.append(el("line", { x1: left, x2: width - right, y1: Y(t), y2: Y(t), class: "grid" }));
    svg.append(el("text", { x: left - 8, y: Y(t) + 4, "text-anchor": "end", class: "tick" }, pctText(t)));
  });
  points.forEach((p) => {
    svg.append(el("text", { x: X(p.minTopScore), y: height - bottom + 20, "text-anchor": "middle", class: "tick" }, p.minTopScore.toFixed(2)));
  });
  svg.append(el("text", { x: (left + width - right) / 2, y: height - 8, "text-anchor": "middle", class: "axis-title" }, "자동 제안 기준(1위 점수 최소값)"));

  if (current != null) {
    svg.append(el("line", { x1: X(current), x2: X(current), y1: top, y2: height - bottom, class: "ref" }));
    svg.append(el("text", { x: X(current) + 6, y: top + 12, class: "tick" }, `현재 기준 ${current.toFixed(2)}`));
  }

  const series = [
    { key: "accuracyAmongPassed", name: "통과한 것 중 정답률", cls: "line accent" },
    { key: "passRate", name: "기준 통과율", cls: "line muted" },
  ];
  series.forEach((s) => {
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.minTopScore)} ${Y(p[s.key])}`).join(" ");
    svg.append(el("path", { d, class: s.cls }));
    points.forEach((p) => {
      const dot = el("circle", { cx: X(p.minTopScore), cy: Y(p[s.key]), r: 4, class: `${s.cls} dot` });
      dot.append(el("title", {}, `기준 ${p.minTopScore.toFixed(2)} · ${s.name} ${pctText(p[s.key])} (통과 ${p.passedCount}장)`));
      svg.append(dot);
    });
    const last = points.at(-1);
    svg.append(el("text", { x: X(last.minTopScore) + 10, y: Y(last[s.key]) + 4, class: s.cls.includes("accent") ? "value strong" : "value" }, `${s.name} ${pctText(last[s.key])}`));
  });
  return svg;
}

/** 2차 보완 흐름도. */
export function flowDiagram({ label }) {
  const width = 680;
  const height = 300;
  const svg = svgRoot(width, height, label);
  const defs = el("defs");
  const marker = el("marker", { id: "flow-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
  marker.append(el("path", { d: "M0 0L10 5L0 10z", class: "arrow-head" }));
  defs.append(marker);
  svg.append(defs);

  const box = (x, y, w, h, title, sub, main) => {
    const g = el("g");
    g.append(el("rect", { x, y, width: w, height: h, rx: 8, class: main ? "box box-main" : "box" }));
    g.append(el("text", { x: x + w / 2, y: y + (sub ? 24 : h / 2 + 5), "text-anchor": "middle", class: "box-title" }, title));
    if (sub) g.append(el("text", { x: x + w / 2, y: y + 44, "text-anchor": "middle", class: "box-sub" }, sub));
    svg.append(g);
  };
  const arrow = (d) => svg.append(el("path", { d, class: "connector", "marker-end": "url(#flow-arrow)" }));

  box(20, 20, 190, 60, "포스터", "브라우저 안에서만 분석", false);
  box(20, 120, 190, 60, "1차 · Teachable Machine", "그림체로 7개 분야 점수", true);
  box(250, 120, 190, 60, "OCR (글자 읽기)", "포스터 글자 + 제목·설명", false);
  box(470, 70, 190, 60, "키워드 규칙", "근거 단어 점수", false);
  box(470, 170, 190, 60, "문장 임베딩", "뜻이 비슷한 분야 점수", false);
  box(250, 225, 190, 60, "결합 · 합의 규칙", "2개 이상 일치할 때만 제안", false);
  box(20, 225, 190, 60, "관리자 확정", "후보와 근거를 보고 결정", false);

  arrow("M115 80V120");
  arrow("M210 50H345V120");
  arrow("M440 150H455V100H470");
  arrow("M440 150H455V200H470");
  arrow("M115 180V202H300V225");
  arrow("M565 230V250H440");
  arrow("M660 100H672V272H440");
  arrow("M250 255H210");
  return svg;
}

/** Teachable Machine 학습 과정 5단계. */
export function trainingSteps({ label }) {
  const width = 680;
  const height = 150;
  const svg = svgRoot(width, height, label);
  const defs = el("defs");
  const marker = el("marker", { id: "step-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
  marker.append(el("path", { d: "M0 0L10 5L0 10z", class: "arrow-head" }));
  defs.append(marker);
  svg.append(defs);
  const steps = [
    ["1 클래스 만들기", "라벨 이름 그대로", "7개"],
    ["2 이미지 업로드", "같은 전처리로 변환", "144장"],
    ["3 모델 학습", "기본 설정", "1회"],
    ["4 내보내기", "TensorFlow.js", "3개 파일"],
    ["5 서비스 연결", "같은 전처리로 추론", "웹·데모"],
  ];
  const w = 120;
  const gap = (width - 20 - steps.length * w) / (steps.length - 1);
  steps.forEach(([title, sub, badge], i) => {
    const x = 10 + i * (w + gap);
    const g = el("g");
    g.append(el("rect", { x, y: 20, width: w, height: 104, rx: 10, class: i === 2 ? "box box-main" : "box" }));
    g.append(el("text", { x: x + w / 2, y: 50, "text-anchor": "middle", class: "box-title" }, title));
    g.append(el("text", { x: x + w / 2, y: 72, "text-anchor": "middle", class: "box-sub" }, sub));
    g.append(el("rect", { x: x + 22, y: 88, width: w - 44, height: 22, rx: 11, class: "badge-bg" }));
    g.append(el("text", { x: x + w / 2, y: 103, "text-anchor": "middle", class: "badge-text" }, badge));
    svg.append(g);
    if (i < steps.length - 1) {
      svg.append(el("path", { d: `M${x + w + 2} 72H${x + w + gap - 2}`, class: "connector", "marker-end": "url(#step-arrow)" }));
    }
  });
  return svg;
}
