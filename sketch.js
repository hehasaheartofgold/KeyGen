let w = 500;
let h = 500;

// ✅ 위/아래 마진
const MARGIN_Y = 10;
// ✅ 머리-기둥 "갭" (빈틈)
const GAP = 5;

let headW = 250;
let headH = 250;
let shaftW = 100;
let backcolor = 0;

// 팔레트
const PALETTE = [
  [0, 122, 255],
  [205, 92, 92],
  [255, 105, 180],
  [255, 69, 0],
  [240, 230, 140],
  [189, 183, 107],
  [147, 112, 219],
  [102, 205, 170],
  [70, 130, 180],
  [119, 136, 153],
  [47, 79, 79],
  [188, 143, 143],
];

let currentCol;

// 슬라이더/스프링
let controls = {};
const SPRING = { k: 0.15, damping: 0.75 };

// ✅ 랜덤 버튼
let randomBtn;

class SpringSlider {
  constructor({ x, y, min, max, start, step, label = "", spring = SPRING }) {
    this.slider = createSlider(min, max, start, step);
    this.slider.position(x, y);

    this.spring = spring;
    this.value = start;
    this.v = 0;

    this.label = label;
    this.x = x;
    this.y = y;
  }

  update() {
    let target = this.slider.value();

    // target clamp (UI 값은 건드리지 않음)
    if (this.targetMin !== undefined) target = max(target, this.targetMin);
    if (this.targetMax !== undefined) target = min(target, this.targetMax);

    const force = (target - this.value) * this.spring.k;
    this.v = (this.v + force) * this.spring.damping;
    this.value += this.v;
  }

  get() {
    return this.value;
  }

  // ✅ 목표값만 바꾸기(스프링 유지)
  setTarget(v) {
    this.slider.value(v);
  }

  drawLabel(extraText = "") {
    push();
    fill(30);
    noStroke();
    textSize(12);
    text(
      `${this.label}: ${this.get().toFixed(2)} ${extraText}`,
      this.x + 170,
      this.y + 12
    );
    pop();
  }
}

// ====== 기둥+팁 오각형 ======
function drawShaftPentagon(x, topY, shaftW, shaftH, tipH) {
  const half = shaftW / 2;
  const jointY = topY + shaftH; // tip 시작선
  const bottomY = jointY + tipH; // tip 꼭짓점

  beginShape();
  vertex(x - half, topY);
  vertex(x + half, topY);
  vertex(x + half, jointY);
  vertex(x, bottomY);
  vertex(x - half, jointY);
  endShape(CLOSE);
}

// ====== 조인트 필렛 ======
function drawJointFillet(x, topY, shaftW, shaftH, r) {
  const half = shaftW / 2;
  const jointY = topY + shaftH;

  r = constrain(r, 0, shaftW / 2);

  circle(x - half + r, jointY - r, r * 2);
  circle(x + half - r, jointY - r, r * 2);
}

// ====== 톱니 ======
const TOOTH_BASE_REF = 26;
const TOOTH_OUT_REF = 18;

// ✅ 기둥 내부에서 → 밖으로 "슬라이드"하며 나오는 버전
function drawRightToothAtPivotSlide(x, pivotY, shaftW, scale = 1, progress = 1) {
  const half = shaftW / 2;
  const bx = x + half;
  const by = pivotY;

  const toothBase = TOOTH_BASE_REF * scale;
  const toothOut = TOOTH_OUT_REF * scale;

  const p = constrain(progress, 0, 1);
  const xOff = lerp(-toothOut, 0, p);

  const p1x = bx + xOff;
  const p1y = by - toothBase;

  const p2x = bx + toothOut + xOff;
  const p2y = by - toothBase * 0.5;

  triangle(bx + xOff, by, p1x, p1y, p2x, p2y);
}

// ✅ 랜덤(스프링 유지)
function randomizeAllControls() {
  for (const key in controls) {
    const c = controls[key];

    const minV = Number(c.slider.elt.min);
    const maxV = Number(c.slider.elt.max);
    const step = Number(c.slider.elt.step) || 0;

    let r = random(minV, maxV);
    if (step >= 1) r = Math.round(r);

    c.setTarget(r); // ✅ 목표만 변경
    c.v *= 0.3;     // (선택) 튐 완화
  }
}

function setup() {
  createCanvas(w, h);

  const uiX = 20;
  const uiY = h + 10;

  controls.headH = new SpringSlider({
    x: uiX, y: uiY,
    min: headH * 0.7, max: headH * 1.3,
    start: headH, step: 0.001,
    label: "headH",
  });

  controls.headW = new SpringSlider({
    x: uiX, y: uiY + 25,
    min: headW * 0.7, max: headW * 1.3,
    start: headW, step: 0.001,
    label: "headW",
  });

  controls.headRound = new SpringSlider({
    x: uiX, y: uiY + 50,
    min: 0.25, max: 1,
    start: 1, step: 0.001,
    label: "roundness",
  });

  controls.shaftW = new SpringSlider({
    x: uiX, y: uiY + 75,
    min: headW * 0.3, max: headW * 0.8,
    start: shaftW, step: 0.001,
    label: "shaftW",
  });

  controls.colorIndex = new SpringSlider({
    x: uiX, y: uiY + 100,
    min: 0, max: PALETTE.length - 1,
    start: 0, step: 1,
    label: "colorIndex",
  });

  controls.toothScale = new SpringSlider({
    x: uiX, y: uiY + 125,
    min: 1.2, max: 2.3,
    start: 2.3, step: 0.001,
    label: "toothScale",
  });

  // ✅ "추가 톱니" 개수 (0부터)
  controls.toothCount = new SpringSlider({
    x: uiX, y: uiY + 150,
    min: 0, max: 20,
    start: 5, step: 1,
    label: "toothExtra",
  });

  // ✅ 버튼
  randomBtn = createButton("RANDOMIZE");
  randomBtn.position(uiX, uiY + 175);
  randomBtn.mousePressed(randomizeAllControls);

  currentCol = color(...PALETTE[0]);
}

function draw() {
  background(backcolor);
  noStroke();

  // 업데이트
  for (const key in controls) controls[key].update();

  // 스프링 값 적용
  headH = controls.headH.get();
  headW = controls.headW.get();

  // shaftW 범위는 headW에 종속
  const newShaftMin = headW * 0.2;
  const newShaftMax = headW * 0.4;

  controls.shaftW.slider.elt.min = newShaftMin;
  controls.shaftW.slider.elt.max = newShaftMax;
  controls.shaftW.targetMin = newShaftMin;
  controls.shaftW.targetMax = newShaftMax;

  shaftW = controls.shaftW.get();

  // roundness
  const roundRatio = controls.headRound.get();
  const roundPx = max(0, roundRatio * (min(headW, headH) / 2));

  // tip 관련
  const overlap = 2;        // ✅ 겹치기(파고들기) 느낌만 담당
  const tipH = shaftW * 0.35;

  // ✅ 열쇠가 실제로 들어갈 높이(마진 제외)
  const keyH = h - MARGIN_Y * 2;

  // ✅ 머리 중심
  const headY = MARGIN_Y + headH / 2;

  // ✅ 머리 바닥
  const headBottomY = MARGIN_Y + headH;

  // ✅ 기둥 시작선(겹치기 전) = 머리 바닥 + GAP
  const shaftStartY = headBottomY + GAP;

  // ✅ overlap 적용한 실제 오각형 topY
  const shaftTopY = shaftStartY + overlap;

  // ✅ 바닥(마진 유지)
  const bottomY = MARGIN_Y + keyH;

  // ✅ 오각형 bottomY = shaftTopY + shaftBodyH + tipH
  const shaftBodyH = bottomY - tipH - shaftTopY;

  // headD (구멍)
  const headD = sqrt(headW * headH);

  // 색 전환
  let idx = Math.round(controls.colorIndex.get());
  idx = constrain(idx, 0, PALETTE.length - 1);

  const targetCol = color(...PALETTE[idx]);
  currentCol = lerpColor(currentCol, targetCol, 0.12);

  // ====== 그리기 ======
  fill(currentCol);
  rectMode(CENTER);

  // 머리
  rect(w / 2, headY, headW, headH, roundPx);

  // 기둥+tip 오각형
  drawShaftPentagon(w / 2, shaftTopY, shaftW, shaftBodyH, tipH);

  // ====== 톱니 ======
  const tScale = controls.toothScale.get();
  const toothBase = TOOTH_BASE_REF * tScale;

  // 조인트(오각형 우측하단 꼭지점 y)
  const jointY = shaftTopY + shaftBodyH;

  // ✅ 톱니 상한선(마진/갭 반영): 머리쪽 조금 아래에서 컷
  const limitY = MARGIN_Y + 1.05 * headH;

  const EPS = 0.0001;
  const available = max(0, jointY - limitY);
  const maxTeeth = max(0, floor((available + EPS) / toothBase));

  // ✅ 1개는 고정 + 추가 톱니만 슬라이더로
  const maxExtra = max(0, maxTeeth - 1);

  controls.toothCount.slider.elt.max = maxExtra;
  controls.toothCount.targetMin = 0;
  controls.toothCount.targetMax = maxExtra;

  let extraFloat = constrain(controls.toothCount.get(), 0, maxExtra);

  // 스프링 튐 방지
  if (controls.toothCount.value > maxExtra) {
    controls.toothCount.value = maxExtra;
    controls.toothCount.v = 0;
    extraFloat = maxExtra;
  }
  if (controls.toothCount.value < 0) {
    controls.toothCount.value = 0;
    controls.toothCount.v = 0;
    extraFloat = 0;
  }

  const totalTarget = 1 + extraFloat;
  const drawN = min(maxTeeth, ceil(totalTarget) + 1);

  for (let i = 0; i < drawN; i++) {
    const pivotY = jointY - toothBase * i;
    if (pivotY < limitY) break;

    // i=0(맨 아래 톱니)는 항상 100%
    let progress = 1;

    // i>=1은 생성 애니메이션
    if (i >= 1) {
      progress = constrain(totalTarget - i, 0, 1);
      if (progress <= 0.0001) continue;
    }

    drawRightToothAtPivotSlide(w / 2, pivotY, shaftW, tScale, progress);
  }

  // 조인트 필렛
  const filletR = min(shaftW * 0.18, 18);
  drawJointFillet(w / 2, shaftTopY, shaftW, shaftBodyH, filletR);

  // 구멍
  fill(backcolor);
  circle(w / 2, headY - headD * 0.15, headD * 0.2);

  // 라벨
  controls.colorIndex.drawLabel(`(idx=${idx})`);
  controls.toothScale.drawLabel(
    `(base=${(TOOTH_BASE_REF * tScale).toFixed(1)}, out=${(
      TOOTH_OUT_REF * tScale
    ).toFixed(1)})`
  );
  controls.toothCount.drawLabel(
    `(maxTeeth=${maxTeeth}, extra=${extraFloat.toFixed(2)})`
  );
}