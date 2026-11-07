import {
  classLabel,
  CLASS_LABELS,
  judgeDemoClassification,
  renderToSquareCanvas,
  SUGGEST_MIN_MARGIN,
  SUGGEST_MIN_TOP_SCORE,
  TARGET_SIZE,
} from "./judge.js";
import {
  baselineComparison,
  CLASS_ORDER,
  confusionGrid,
  judgmentReason,
  mcnemarFromRows,
  noKeywordCount,
  normalizeDrops,
  occlusionPatches,
  parseCsv,
  pct,
  sameCoreMetrics,
  seenVsUnseen,
  splitCounts,
  sweepCurve,
  topConfusions,
  topPatches,
  wilsonInterval,
} from "./metrics.js";
import { confusionHeatmap, flowDiagram, horizontalBars, sweepChart, trainingSteps } from "./charts.js";

const MODEL_PATH = "./model/";
const EXP = "../experiments/2026-10-21-poster-pilot/";
/** Teachable Machine "모델 업로드"로 받은 공유 링크. 비어 있으면 링크 항목을 숨긴다. */
const TM_SHARE_URL = "https://teachablemachine.withgoogle.com/models/BYUNqmWhh/";
/**
 * Teachable Machine "Under the hood" 화면 캡처. 아래 이름 그대로 docs/tm-demo/img/에 넣으면
 * 학습 설정 섹션에 자동으로 표시된다(없는 파일은 건너뜀).
 */
const TM_SHOTS = [
  { file: "img/tm-accuracy-per-epoch.png", caption: "에포크별 정확도 — 파랑: 학습 데이터, 주황: TM 내부 검증" },
  { file: "img/tm-loss-per-epoch.png", caption: "에포크별 손실 — 검증 손실(주황)은 처음부터 계속 오른다" },
  { file: "img/tm-accuracy-per-class.png", caption: "클래스별 정확도 (내부 검증 23장)" },
  { file: "img/tm-confusion-matrix.png", caption: "혼동행렬 (내부 검증 23장, 행·열 모두 같은 분야 순서)" },
];

const CLASS_SCOPE = {
  IT_ENGINEERING: "개발·데이터·AI·보안, 자동차·로봇 등 공학",
  BUSINESS_PLANNING: "마케팅·창업·금융·서비스 기획, 브랜드 서포터즈",
  DESIGN_MEDIA: "디자인·영상·웹툰·기사, 순수 미술·문학 공모",
  SOCIAL_ENVIRONMENT: "봉사·멘토링·교육봉사·환경, 국제교류",
  LAW_POLICY: "법학·법률 교육, 정책 제안, 외교·정치·재정",
  CAMPUS_NOTICE: "학교 부서가 재학생에게 안내하는 공지",
  HOBBY_CULTURE: "운동·취미·문화 동아리, 공연·축제·인문학 행사",
};

const SHORT = {
  IT_ENGINEERING: "IT·공학",
  BUSINESS_PLANNING: "경영·기획",
  DESIGN_MEDIA: "디자인",
  SOCIAL_ENVIRONMENT: "사회·환경",
  LAW_POLICY: "법·정책",
  CAMPUS_NOTICE: "교내 공지",
  HOBBY_CULTURE: "취미·문화",
};

/* ───────────── 라이브 데모 ───────────── */

const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("statusMsg");
const resultsEl = document.getElementById("results");
const cardTemplate = document.getElementById("cardTemplate");
const modelStatusEl = document.getElementById("modelStatus");

let modelPromise = null;

function setModelStatus(state, text) {
  modelStatusEl.dataset.state = state;
  modelStatusEl.querySelector(".status-text").textContent = text;
}

function getModel() {
  if (!modelPromise) {
    if (typeof tmImage === "undefined") {
      return Promise.reject(new Error("Teachable Machine 라이브러리를 불러오지 못했습니다."));
    }
    // tmImage는 index.html이 vendor/에서 불러온 라이브러리가 전역으로 올린다.
    modelPromise = tmImage.load(`${MODEL_PATH}model.json`, `${MODEL_PATH}metadata.json`).catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

/** 페이지를 열 때 모델을 미리 받고, 빈 이미지로 한 번 추론해 첫 분석의 지연을 없앤다. */
async function preloadModel() {
  setModelStatus("loading", "모델을 불러오는 중…");
  const started = performance.now();
  try {
    const model = await getModel();
    const blank = document.createElement("canvas");
    blank.width = TARGET_SIZE;
    blank.height = TARGET_SIZE;
    const ctx = blank.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
    await model.predict(blank);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const version = model.getMetadata?.().timeStamp ?? "";
    setModelStatus("ready", `모델 준비 완료 · pilot-7-v1 · ${model.getTotalClasses?.() ?? 7}개 분야 · ${seconds}초${version ? ` · 버전 ${version}` : ""}`);
  } catch (error) {
    setModelStatus("error", `모델을 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function analyzeFiles(files, expected = null) {
  if (files.length === 0) return;
  statusEl.textContent = "";
  let model;
  try {
    model = await getModel();
  } catch (error) {
    statusEl.textContent = `모델을 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  for (const file of files) {
    await processFile(file, model, expected);
  }
}

fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  await analyzeFiles(files);
});

document.querySelectorAll(".example-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const res = await fetch(btn.dataset.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], btn.dataset.name, { type: blob.type || "image/png" });
      await analyzeFiles([file], btn.dataset.expected ?? null);
      resultsEl.firstElementChild?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      statusEl.textContent = `예시 포스터를 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      btn.disabled = false;
    }
  });
});

async function processFile(file, model, expected = null) {
  const card = buildCard(file.name);
  resultsEl.prepend(card.root);

  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    const squareCanvas = renderToSquareCanvas(bitmap, dims);

    const originalUrl = URL.createObjectURL(file);
    card.originalImg.src = originalUrl;
    card.originalImg.addEventListener("load", () => URL.revokeObjectURL(originalUrl), { once: true });

    squareCanvas.className = "preview-canvas";
    card.preprocessedHost.replaceChildren(squareCanvas);

    const predictions = await model.predict(squareCanvas);
    const scores = predictions.map((p) => ({ classId: p.className, score: p.probability }));
    const judgment = judgeDemoClassification(scores);
    renderJudgment(card, judgment);
    if (expected) {
      const hit = judgment.topClass === expected;
      card.expectedHost.textContent = `만든 의도: ${classLabel(expected)} → 모델 1위: ${classLabel(judgment.topClass)} (${hit ? "일치" : "불일치 — 글자 대신 색·구도로 판단한 사례"})`;
      card.expectedHost.dataset.hit = String(hit);
    }
    card.heatmapBtn.hidden = false;
    card.heatmapBtn.addEventListener("click", () => {
      if (!card.heatmapBtn.disabled) runOcclusion(card, model, squareCanvas, judgment);
    });
  } catch (error) {
    card.body.textContent = `분석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** 가림 실험: 7×7 칸을 하나씩 회색으로 가리고 1위 분야 점수가 얼마나 떨어지는지 잰다. */
async function runOcclusion(card, model, squareCanvas, judgment) {
  card.heatmapBtn.disabled = true;
  const patches = occlusionPatches(TARGET_SIZE, 7);
  const work = document.createElement("canvas");
  work.width = TARGET_SIZE;
  work.height = TARGET_SIZE;
  const wctx = work.getContext("2d");
  const drops = [];
  try {
    for (let i = 0; i < patches.length; i += 1) {
      const p = patches[i];
      wctx.drawImage(squareCanvas, 0, 0);
      wctx.fillStyle = "#808080";
      wctx.fillRect(p.x, p.y, p.w, p.h);
      const preds = await model.predict(work);
      const top = preds.find((x) => x.className === judgment.topClass);
      drops.push(judgment.topScore - (top ? top.probability : 0));
      card.heatmapProgress.textContent = `계산 중 ${i + 1}/${patches.length}`;
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
  } catch (error) {
    card.heatmapProgress.textContent = `계산하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
    card.heatmapBtn.disabled = false;
    return;
  }

  const intensity = normalizeDrops(drops);
  const overlay = document.createElement("canvas");
  overlay.width = TARGET_SIZE;
  overlay.height = TARGET_SIZE;
  overlay.className = "preview-canvas";
  const octx = overlay.getContext("2d");
  octx.drawImage(squareCanvas, 0, 0);
  patches.forEach((p, i) => {
    if (intensity[i] < 0.15) return;
    octx.fillStyle = `rgba(220, 38, 38, ${(0.12 + 0.6 * intensity[i]).toFixed(3)})`;
    octx.fillRect(p.x, p.y, p.w, p.h);
  });
  const best = topPatches(patches, drops, 1)[0];
  if (best) {
    octx.strokeStyle = "rgba(127, 29, 29, 0.95)";
    octx.lineWidth = 2;
    octx.strokeRect(best.x + 1, best.y + 1, best.w - 2, best.h - 2);
  }
  card.heatmapHost.replaceChildren(overlay);
  card.heatmapFigure.hidden = false;
  card.heatmapProgress.textContent = "";
  card.heatmapBtn.hidden = true;

  const maxDrop = Math.max(...drops);
  const area = (p) => {
    const v = ["위", "위", "위", "가운데", "아래", "아래", "아래"][p.row];
    const h = ["왼쪽", "왼쪽", "가운데", "가운데", "가운데", "오른쪽", "오른쪽"][p.col];
    return v === "가운데" && h === "가운데" ? "한가운데" : `${v} ${h}`;
  };
  card.heatmapSummary.textContent =
    maxDrop > 0.01 && best
      ? `${classLabel(judgment.topClass)} 판단에 가장 크게 기댄 곳은 ${area(best)} 부분이다(가리면 점수가 ${Math.round(maxDrop * 100)}%p 떨어짐). 49번의 가림 실험으로 계산했다.`
      : `어느 한 칸을 가려도 ${classLabel(judgment.topClass)} 점수가 거의 바뀌지 않았다. 모델이 포스터 전체의 색감·구도로 판단했다는 뜻이다.`;
}

function buildCard(fileName) {
  const root = cardTemplate.content.firstElementChild.cloneNode(true);
  root.querySelector(".card-filename").textContent = fileName;
  const heatmapBtn = root.querySelector(".heatmap-btn");
  heatmapBtn.hidden = true;
  return {
    root,
    body: root.querySelector(".card-body"),
    originalImg: root.querySelector(".original-img"),
    preprocessedHost: root.querySelector(".preprocessed-host"),
    barsHost: root.querySelector(".bars-host"),
    verdictHost: root.querySelector(".verdict-host"),
    summaryHost: root.querySelector(".summary-host"),
    top3Host: root.querySelector(".top3-host"),
    reasonHost: root.querySelector(".reason-host"),
    heatmapBtn,
    heatmapProgress: root.querySelector(".heatmap-progress"),
    heatmapFigure: root.querySelector(".heatmap-figure"),
    heatmapHost: root.querySelector(".heatmap-host"),
    heatmapSummary: root.querySelector(".heatmap-summary"),
    expectedHost: root.querySelector(".expected-host"),
  };
}

function renderJudgment(card, judgment) {
  card.top3Host.replaceChildren(
    ...judgment.sorted.slice(0, 3).map((s, i) => {
      const chip = document.createElement("span");
      chip.className = i === 0 ? "top-chip top-chip-first" : "top-chip";
      chip.textContent = `${i + 1}위 ${classLabel(s.classId)} ${toPercent(s.score)}`;
      return chip;
    })
  );
  card.barsHost.replaceChildren(...judgment.sorted.map((s, i) => buildBar(s, i === 0)));

  const diff = judgment.secondScore == null ? judgment.topScore : judgment.margin;
  card.summaryHost.textContent =
    judgment.secondClass == null
      ? `1위 ${classLabel(judgment.topClass)} ${toPercent(judgment.topScore)}`
      : `1위 ${classLabel(judgment.topClass)} ${toPercent(judgment.topScore)} · 2위 ${classLabel(judgment.secondClass)} ${toPercent(
          judgment.secondScore
        )} · 차이 ${toPercent(diff)}`;

  const verdict = document.createElement("span");
  verdict.className = judgment.status === "auto_suggested" ? "verdict verdict-auto" : "verdict verdict-review";
  verdict.textContent = judgment.status === "auto_suggested" ? "자동 제안" : "관리자 검토 필요";
  card.verdictHost.replaceChildren(verdict);
  card.reasonHost.textContent = judgmentReason(judgment, SUGGEST_MIN_TOP_SCORE, SUGGEST_MIN_MARGIN);
}

function buildBar(score, first) {
  const row = document.createElement("li");
  row.className = "bar-row";

  const label = document.createElement("span");
  label.className = "bar-label";
  label.textContent = classLabel(score.classId);
  label.title = score.classId;

  const track = document.createElement("span");
  track.className = "bar-track";
  const fill = document.createElement("span");
  fill.className = first ? "bar-fill bar-fill-first" : "bar-fill";
  fill.style.width = `${Math.round(score.score * 100)}%`;
  track.appendChild(fill);

  const value = document.createElement("span");
  value.className = "bar-value";
  value.textContent = toPercent(score.score);

  row.append(label, track, value);
  return row;
}

function toPercent(score) {
  return `${Math.round(score * 100)}%`;
}

/* ───────────── 보고서 섹션 ───────────── */

function bind(key, text) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach((node) => {
    node.textContent = text;
  });
}

function failSection(id, message = "데이터를 불러오지 못했습니다.") {
  const section = document.getElementById(id);
  if (!section) return;
  const p = document.createElement("p");
  p.className = "load-error";
  p.textContent = message;
  section.append(p);
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

function td(text, cls) {
  const cell = document.createElement("td");
  if (cls) cell.className = cls;
  cell.textContent = text;
  return cell;
}

function th(text) {
  const cell = document.createElement("th");
  cell.textContent = text;
  return cell;
}

function miniBar(parts) {
  const wrap = document.createElement("span");
  wrap.className = "mini-bar";
  for (const p of parts) {
    const seg = document.createElement("span");
    seg.className = p.cls;
    seg.style.width = `${Math.max(0, p.rate * 100)}%`;
    seg.title = p.title;
    wrap.append(seg);
  }
  return wrap;
}

function renderData(manifestRows) {
  const counts = splitCounts(manifestRows);
  bind("total-images", String(counts.total));
  bind("train-n", String(counts.train));
  bind("test-n", String(counts.test));
  bind("ood-n", String(counts.ood));

  const tbody = document.querySelector("#splitTable tbody");
  const maxTotal = Math.max(...counts.perClass.map((c) => c.train + c.test));
  tbody.replaceChildren(
    ...counts.perClass.map((c) => {
      const tr = document.createElement("tr");
      const code = td(c.classId, "code-cell");
      const barCell = document.createElement("td");
      barCell.className = "split-bar-col";
      barCell.append(
        miniBar([
          { cls: "seg seg-train", rate: c.train / maxTotal, title: `학습 ${c.train}장` },
          { cls: "seg seg-test", rate: c.test / maxTotal, title: `평가 ${c.test}장` },
        ])
      );
      tr.append(code, td(CLASS_LABELS[c.classId] ?? c.classId), td(CLASS_SCOPE[c.classId] ?? "", "scope-cell scope-col"), td(String(c.train), "num"), td(String(c.test), "num"), barCell);
      return tr;
    })
  );
  const tfoot = document.querySelector("#splitTable tfoot");
  const tr = document.createElement("tr");
  const totalLabel = th("합계");
  totalLabel.colSpan = window.matchMedia("(max-width: 760px)").matches ? 2 : 3;
  const legend = document.createElement("td");
  legend.className = "legend-cell";
  for (const [cls, text] of [["dot-train", "학습"], ["dot-test", "평가"]]) {
    const dot = document.createElement("span");
    dot.className = `legend-dot ${cls}`;
    legend.append(dot, document.createTextNode(` ${text}  `));
  }
  tr.append(totalLabel, td(String(counts.train), "num"), td(String(counts.test), "num"), legend);
  tfoot.replaceChildren(tr);
  return counts;
}

function renderEvaluation(evaluation, rerun, counts) {
  const acc = evaluation.accuracy;
  const random = 1 / CLASS_ORDER.length;
  const ci = wilsonInterval(acc.correct, acc.total);
  bind("kpi-tm-acc", pct(acc.accuracy));
  bind("kpi-baseline", `${(acc.accuracy / random).toFixed(1)}배`);
  bind(
    "eval-lead",
    `학습에 쓰지 않은 포스터 ${acc.total}장 중 ${acc.correct}장을 맞혀 정확도 ${pct(acc.accuracy)}(95% 신뢰구간 ${pct(ci.low)}~${pct(ci.high)}), macro-F1 ${evaluation.macroF1.toFixed(3)}이다. ` +
      `무작위(${pct(random)})와 가장 많은 분야로 모두 찍기(${pct(evaluation.majorityBaseline.accuracy)})보다는 높지만, 서비스에서 그대로 자동 분류에 쓸 수준은 아니다.`
  );

  const baseRows = baselineComparison(evaluation).map((b) => ({
    label: b.label,
    rate: b.rate,
    emphasis: b.key === "model",
    valueText: b.key === "model" ? `${pct(b.rate)} (${acc.correct}/${acc.total})` : pct(b.rate),
  }));
  document.getElementById("baselineChart").replaceChildren(horizontalBars({ rows: baseRows, label: "정확도와 기준선 비교", labelWidth: 230 }));

  const byId = Object.fromEntries(evaluation.classMetrics.map((m) => [m.classId, m]));
  const tbody = document.querySelector("#classTable tbody");
  tbody.replaceChildren(
    ...CLASS_ORDER.map((id) => {
      const m = byId[id] ?? { support: 0, precision: 0, recall: 0, f1: 0 };
      const tr = document.createElement("tr");
      const barCell = document.createElement("td");
      barCell.className = "split-bar-col";
      barCell.append(miniBar([{ cls: "seg seg-train", rate: m.f1, title: `F1 ${m.f1.toFixed(2)}` }]));
      tr.append(td(CLASS_LABELS[id]), td(String(m.support), "num"), td(m.precision.toFixed(2), "num"), td(m.recall.toFixed(2), "num"), td(m.f1.toFixed(2), m.f1 === 0 ? "num zero" : "num"), barCell);
      return tr;
    })
  );

  const grid = confusionGrid(evaluation.confusionMatrix);
  document
    .getElementById("confusionChart")
    .replaceChildren(confusionHeatmap({ grid, names: CLASS_ORDER.map((id) => SHORT[id]), label: "혼동행렬: 실제 분야 대비 예측 분야" }));

  const curve = sweepCurve(evaluation.thresholdSweep, SUGGEST_MIN_MARGIN);
  if (curve.length >= 2) {
    document.getElementById("sweepChart").replaceChildren(sweepChart({ points: curve, current: SUGGEST_MIN_TOP_SCORE, label: "자동 제안 기준별 통과율과 정답률" }));
    const cur = curve.find((p) => Math.abs(p.minTopScore - SUGGEST_MIN_TOP_SCORE) < 1e-9);
    if (cur) {
      bind(
        "sweep-note",
        `기준을 높일수록 자동 제안되는 포스터는 줄고, 제안된 것의 정답률은 오른다. 현재 기준(${SUGGEST_MIN_TOP_SCORE.toFixed(2)})에서는 ${pct(cur.passRate)}(${cur.passedCount}장)만 자동 제안되고 그중 ${pct(cur.accuracyAmongPassed)}가 맞는다. ` +
          "이 곡선은 결과 분석용이며, 기준값은 평가 전에 정한 그대로 두었다."
      );
    }
  }

  if (rerun) {
    bind("repro", sameCoreMetrics(evaluation, rerun) ? "✔ 재현성 확인 — 같은 모델로 평가를 다시 실행해도 모든 지표와 혼동행렬이 똑같이 나왔다." : "재실행 결과가 1차와 다르다. 실험 기록을 확인할 것.");
  }

  const ten = seenVsUnseen(evaluation);
  bind("kpi-unseen", `${pct(ten.unseen.rate)} vs ${pct(ten.seen.rate)}`);
  document.getElementById("seenChart").replaceChildren(
    horizontalBars({
      rows: [
        { label: "학습에 같은 기관이 있던 포스터", rate: ten.seen.rate, valueText: `${pct(ten.seen.rate)} (${ten.seen.correct}/${ten.seen.total})` },
        { label: "처음 보는 기관의 포스터", rate: ten.unseen.rate, emphasis: true, valueText: `${pct(ten.unseen.rate)} (${ten.unseen.correct}/${ten.unseen.total})` },
      ],
      label: "본 적 있는 기관과 처음 보는 기관의 정확도",
      labelWidth: 230,
    })
  );
  bind(
    "finding-unseen",
    `학습에 없던 기관의 포스터는 ${pct(ten.unseen.rate)}(${ten.unseen.correct}/${ten.unseen.total})만 맞혔지만, 같은 기관 포스터가 학습에 있던 경우는 ${pct(ten.seen.rate)}(${ten.seen.correct}/${ten.seen.total})였다. 분야보다 기관별 디자인 스타일을 일부 외웠다는 신호다.`
  );

  const minTrain = Math.min(...counts.perClass.map((c) => c.train));
  const maxTrain = Math.max(...counts.perClass.map((c) => c.train));
  bind(
    "finding-samples",
    `분야당 학습 이미지가 ${minTrain}~${maxTrain}장뿐이다. 그림체가 비슷한 분야(일러스트가 많은 공모전과 캠페인 포스터 등)를 구분할 근거가 부족했고, 학습이 가장 적은 법·정책과 교내 행정 공지는 한 장도 맞히지 못했다.`
  );

  const list = document.getElementById("confusionList");
  list.replaceChildren(
    ...topConfusions(evaluation.confusionMatrix, 3).map((c) => {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = `${CLASS_LABELS[c.actual]} → ${CLASS_LABELS[c.predicted]}`;
      li.append(strong, document.createTextNode(` ${c.count}장 (실제 ${CLASS_LABELS[c.actual]} ${c.support}장 중)`));
      return li;
    })
  );
}

function renderExtension(comparison, rows) {
  document.getElementById("flowChart").replaceChildren(flowDiagram({ label: "2차 보완 흐름: Teachable Machine과 글자 신호의 결합" }));
  const names = {
    A: "A. Teachable Machine만 (1차)",
    B: "B. TM + 키워드",
    C: "C. TM + 문장 임베딩",
    D: "D. TM + 키워드 + 임베딩 + 합의 규칙 (서비스 적용)",
  };
  const tbody = document.querySelector("#variantTable tbody");
  tbody.replaceChildren(
    ...["A", "B", "C", "D"].map((k) => {
      const v = comparison.variants[k];
      const tr = document.createElement("tr");
      if (k === "D") tr.className = "row-strong";
      if (k === "A") tr.className = "row-base";
      tr.append(
        td(names[k]),
        td(`${pct(v.accuracy.accuracy)} (${v.accuracy.correct}/${v.accuracy.total})`, "num"),
        td(v.macroF1.toFixed(3), "num"),
        td(`${pct(v.accuracyAmongSuggested.accuracy)} (${v.accuracyAmongSuggested.correct}/${v.accuracyAmongSuggested.total})`, "num"),
        td(pct(v.unseenOrgAccuracy.accuracy), "num")
      );
      return tr;
    })
  );

  const A = comparison.variants.A;
  const D = comparison.variants.D;
  bind("kpi-ext-acc", `${pct(A.accuracy.accuracy)} → ${pct(D.accuracy.accuracy)}`);
  const mc = mcnemarFromRows(rows);
  const s = comparison.standaloneAccuracy;
  const ciA = wilsonInterval(A.accuracy.correct, A.accuracy.total);
  const ciD = wilsonInterval(D.accuracy.correct, D.accuracy.total);
  bind("ci-text", `1차 ${pct(ciA.low)}~${pct(ciA.high)}, 보완 후 ${pct(ciD.low)}~${pct(ciD.high)}`);
  bind("no-kw", String(noKeywordCount(rows)));

  const facts = [
    `1차에서 틀리고 보완 후 맞힌 포스터 ${mc.aWrongBRight}장, 반대(맞혔다가 틀림) ${mc.aRightBWrong}장 — 차이가 우연일 확률은 매우 낮다(McNemar 정확 검정 p ≈ ${mc.p.toPrecision(2)}).`,
    `처음 보는 기관의 포스터 정확도 ${pct(A.unseenOrgAccuracy.accuracy)} → ${pct(D.unseenOrgAccuracy.accuracy)}. 1차의 '기관 스타일 의존' 약점이 크게 줄었다.`,
    `신호별 단독 정확도: Teachable Machine ${pct(s.tm.accuracy)}, 키워드 ${pct(s.keyword.accuracy)}, 임베딩 ${pct(s.embedding.accuracy)}. 개선의 대부분은 글자 키워드에서 나왔다.`,
    `자동 제안은 ${pct(D.suggestedRate)}만 하고 그중 ${pct(D.accuracyAmongSuggested.accuracy)}가 맞는다. 나머지는 관리자 검토로 넘긴다.`,
  ];
  document.getElementById("extFacts").replaceChildren(
    ...facts.map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    })
  );

  const versionRows = [
    ["Teachable Machine 모델", comparison.modelVersion],
    ["전처리", comparison.preprocessingVersion],
    ["키워드 사전", comparison.keywordsVersion],
    ["문장 임베딩", comparison.embedVersion],
    ["결합 규칙", comparison.postprocessVersion],
    ["보완 평가 시각", comparison.measuredAt],
  ];
  document.querySelector("#versionTable tbody").replaceChildren(
    ...versionRows.map(([k, v]) => {
      const tr = document.createElement("tr");
      const code = document.createElement("code");
      code.textContent = v ?? "—";
      const cell = document.createElement("td");
      cell.append(code);
      tr.append(th(k), cell);
      return tr;
    })
  );
}

function renderStatic() {
  document.getElementById("stepsChart").replaceChildren(trainingSteps({ label: "Teachable Machine 학습 과정 5단계" }));
  bind("rule-top", SUGGEST_MIN_TOP_SCORE.toFixed(2));
  bind("rule-margin", SUGGEST_MIN_MARGIN.toFixed(2));
  if (TM_SHARE_URL) {
    document.getElementById("tmShareItem").hidden = false;
    document.getElementById("tmShareLink").href = TM_SHARE_URL;
  }
  const shotsFig = document.getElementById("tmShots");
  const shotsGrid = shotsFig.querySelector(".tm-shots-grid");
  for (const shot of TM_SHOTS) {
    const img = new Image();
    img.alt = `Teachable Machine ${shot.caption}`;
    img.addEventListener("load", () => {
      const fig = document.createElement("figure");
      const cap = document.createElement("figcaption");
      cap.textContent = shot.caption;
      fig.append(img, cap);
      shotsGrid.append(fig);
      shotsFig.hidden = false;
    });
    img.src = shot.file;
  }
}

async function loadModelVersion() {
  try {
    const meta = await fetchJson(`${MODEL_PATH}metadata.json`);
    bind("model-version", meta.timeStamp ?? "—");
  } catch {
    bind("model-version", "—");
  }
}

async function initReport() {
  renderStatic();
  preloadModel();
  loadModelVersion();

  let counts = null;
  try {
    counts = renderData(parseCsv(await fetchText(`${EXP}manifest.csv`)));
  } catch (error) {
    console.error(error);
    failSection("data");
  }

  try {
    const [evaluation, rerun] = await Promise.all([
      fetchJson(`${EXP}tm-only-eval-1st.json`),
      fetchJson(`${EXP}tm-only-eval-rerun.json`).catch(() => null),
    ]);
    renderEvaluation(evaluation, rerun, counts ?? { perClass: [{ train: 0 }] });
  } catch (error) {
    console.error(error);
    failSection("evaluation");
    failSection("analysis");
  }

  try {
    const [comparison, csvText] = await Promise.all([fetchJson(`${EXP}postprocess-comparison.json`), fetchText(`${EXP}postprocess-comparison.csv`)]);
    renderExtension(comparison, parseCsv(csvText));
  } catch (error) {
    console.error(error);
    failSection("extension");
  }
}

initReport();
