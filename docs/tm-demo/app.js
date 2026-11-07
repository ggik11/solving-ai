import { classLabel, judgeDemoClassification, renderToSquareCanvas } from "./judge.js";

const MODEL_PATH = "./model/";

const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("statusMsg");
const resultsEl = document.getElementById("results");
const cardTemplate = document.getElementById("cardTemplate");

let modelPromise = null;

function getModel() {
  if (!modelPromise) {
    // tmImage는 index.html의 CDN <script>가 전역으로 올린다.
    modelPromise = tmImage.load(`${MODEL_PATH}model.json`, `${MODEL_PATH}metadata.json`);
  }
  return modelPromise;
}

fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  if (files.length === 0) return;

  statusEl.textContent = "모델을 불러오는 중...";
  let model;
  try {
    model = await getModel();
  } catch (error) {
    statusEl.textContent = `모델을 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  statusEl.textContent = "";

  for (const file of files) {
    await processFile(file, model);
  }
});

async function processFile(file, model) {
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
  } catch (error) {
    card.body.textContent = `분석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function buildCard(fileName) {
  const root = cardTemplate.content.firstElementChild.cloneNode(true);
  root.querySelector(".card-filename").textContent = fileName;
  return {
    root,
    body: root.querySelector(".card-body"),
    originalImg: root.querySelector(".original-img"),
    preprocessedHost: root.querySelector(".preprocessed-host"),
    barsHost: root.querySelector(".bars-host"),
    verdictHost: root.querySelector(".verdict-host"),
    summaryHost: root.querySelector(".summary-host"),
  };
}

function renderJudgment(card, judgment) {
  card.barsHost.replaceChildren(...judgment.sorted.map((s) => buildBar(s)));

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
}

function buildBar(score) {
  const row = document.createElement("li");
  row.className = "bar-row";

  const label = document.createElement("span");
  label.className = "bar-label";
  label.textContent = `${classLabel(score.classId)} (${score.classId})`;

  const track = document.createElement("span");
  track.className = "bar-track";
  const fill = document.createElement("span");
  fill.className = "bar-fill";
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
