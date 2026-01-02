/**
 * ==========================================================
 * Fullscreen Key Generator (Mobile Drag + Gyroscope Gravity)
 * p5.js + Matter.js
 *
 * [기능]
 * - 브라우저 풀스크린 캔버스(반응형)
 * - 모바일 터치/마우스 드래그로 키 생성(드래그 중 프리뷰 랜덤 변화)
 * - 좌/우/상/하 벽: 키가 화면 밖으로 안 나감
 * - 톱니도 물리 충돌 포함(치형 파츠)
 * - 생성된 키 클릭/터치 시 스프링처럼 "대롱대롱" 잡기
 * - ✅ 자이로센서: 폰 기울이면 중력 방향 변경
 *
 * [수정 사항]
 * 1) DeviceOrientation API로 자이로센서 데이터 수집
 * 2) iOS 13+ 권한 요청 처리
 * 3) 중력 벡터를 Matter.js engine.gravity에 실시간 적용
 * 4) 자이로 활성화 버튼 추가
 * ==========================================================
 */

let engine, world;
let ground, walls = [];
let keys = [];

// 드래그 생성 상태
let dragging = false;
let dragStart = null;
let dragEndX = 0;
let dragEndY = 0;
let previewParams = null;
let currentAngle = 0;

const MIN_SIZE = 24;
const WALL_THICKNESS = 90;

// "대롱대롱 잡기"
let grabBody = null;
let grabConstraint = null;

// 공용 포인터 좌표(마우스/터치)
let pointerX = 0;
let pointerY = 0;

// ✅ 자이로센서 상태
let gyroEnabled = false;
let gyroPermissionGranted = false;
let gravityX = 0;
let gravityY = 1; // 기본 중력(아래 방향)
const GRAVITY_STRENGTH = 1.0; // 중력 강도 조절
const GYRO_SMOOTHING = 0.1; // 부드러운 전환

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent("container");
  cnv.style("display", "block");

  engine = Matter.Engine.create();
  world = engine.world;

  // 기본 중력 설정
  engine.gravity.x = 0;
  engine.gravity.y = 1;

  buildBounds();

  rectMode(CENTER);
  angleMode(RADIANS);

  // ✅ 자이로센서 초기화 시도
  initGyroscope();
}

function draw() {
  background(245);

  Matter.Engine.update(engine);

  // ✅ 자이로센서가 활성화되면 중력 업데이트
  if (gyroEnabled) {
    updateGravity();
  }

  // 잡고 있으면 스프링 고정점(pointA)을 포인터로 계속 갱신
  if (grabConstraint) {
    grabConstraint.pointA.x = pointerX;
    grabConstraint.pointA.y = pointerY;
  }

  drawGround();

  // 생성된 키들
  for (const k of keys) k.show();

  // 드래그 프리뷰
  if (dragging && dragStart) drawPreview();

  drawHUD();
}

function drawHUD() {
  push();
  fill(0, 90);
  noStroke();
  textSize(12);
  textAlign(LEFT, TOP);
  
  let hudText = "DRAG: spawn key (mobile OK)\nTAP key: hang & swing\n←/→ or A/D/W/S: rotate while dragging, ↑ reset\nC: clear\n";
  
  // ✅ 자이로 상태 표시
  if (gyroEnabled) {
    hudText += `\n🌍 GYRO: ON (tilt your device!)`;
  } else if (!gyroPermissionGranted) {
    hudText += `\n📱 TAP "G" to enable gyroscope`;
  } else {
    hudText += `\n⚠️ Gyroscope not available`;
  }
  
  text(hudText, 14, 14);
  pop();
}

// ==========================================================
// ✅ 자이로센서 초기화
// ==========================================================
function initGyroscope() {
  // iOS 13+ 권한 필요 여부 확인
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS: 사용자 제스처 필요 (키보드 'G' 키로 활성화)
    gyroPermissionGranted = false;
    console.log("iOS detected. Press 'G' to request gyroscope permission.");
  } else if (window.DeviceOrientationEvent) {
    // Android 등: 자동 활성화
    enableGyroscope();
  } else {
    console.log("Gyroscope not supported on this device.");
  }
}

function enableGyroscope() {
  window.addEventListener('deviceorientation', handleOrientation, true);
  gyroEnabled = true;
  gyroPermissionGranted = true;
  console.log("✅ Gyroscope enabled!");
}

function handleOrientation(event) {
  if (!gyroEnabled) return;

  // beta: 전후 기울기 (-180 ~ 180) - X축 회전
  // gamma: 좌우 기울기 (-90 ~ 90) - Y축 회전
  let beta = event.beta || 0;   // 앞뒤 기울기
  let gamma = event.gamma || 0; // 좌우 기울기

  // 중력 벡터 계산 (정규화 및 강도 조절)
  // gamma: 왼쪽으로 기울이면 음수, 오른쪽 양수
  // beta: 앞으로 기울이면 양수, 뒤로 음수
  
  let targetGravityX = constrain(gamma / 45, -1, 1) * GRAVITY_STRENGTH;
  let targetGravityY = constrain(beta / 45, -1, 1) * GRAVITY_STRENGTH;

  // 부드러운 전환 (급격한 변화 방지)
  gravityX = lerp(gravityX, targetGravityX, GYRO_SMOOTHING);
  gravityY = lerp(gravityY, targetGravityY, GYRO_SMOOTHING);
}

function updateGravity() {
  // Matter.js 엔진의 중력을 실시간 업데이트
  engine.gravity.x = gravityX;
  engine.gravity.y = gravityY;
}

// ==========================================================
// 반응형
// ==========================================================
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildBounds();
}

// ==========================================================
// 바닥 + 벽
// ==========================================================
function buildBounds() {
  if (ground) Matter.World.remove(world, ground);
  if (walls.length) Matter.World.remove(world, walls);

  ground = Matter.Bodies.rectangle(width / 2, height - 18, width, 36, {
    isStatic: true,
    friction: 0.9,
    restitution: 0.05
  });
  Matter.World.add(world, ground);

  const t = WALL_THICKNESS;
  const opts = { isStatic: true, friction: 0.85, restitution: 0.05 };

  const leftWall = Matter.Bodies.rectangle(-t / 2, height / 2, t, height, opts);
  const rightWall = Matter.Bodies.rectangle(width + t / 2, height / 2, t, height, opts);
  const topWall = Matter.Bodies.rectangle(width / 2, -t / 2, width, t, opts);
  const bottomWall = Matter.Bodies.rectangle(width / 2, height + t / 2, width, t, opts);

  walls = [leftWall, rightWall, topWall, bottomWall];
  Matter.World.add(world, walls);
}

function drawGround() {
  noStroke();
  fill(225);
  push();
  translate(ground.position.x, ground.position.y);
  rect(0, 0, width, 36);
  pop();
}

// ==========================================================
// 입력(마우스 + 터치) 공용 처리
// ==========================================================
function startPointer(x, y) {
  pointerX = x;
  pointerY = y;

  // 1) 먼저 키를 잡을 수 있는지 시도
  if (tryGrabKey(x, y)) {
    dragging = false;
    dragStart = null;
    previewParams = null;
    return;
  }

  // 2) 아니라면 드래그 생성 시작
  dragging = true;
  dragStart = createVector(x, y);
  dragEndX = x;
  dragEndY = y;
  currentAngle = 0;
}

function movePointer(x, y) {
  pointerX = x;
  pointerY = y;

  if (dragging) {
    dragEndX = x;
    dragEndY = y;
  }
}

function endPointer(x, y) {
  pointerX = x;
  pointerY = y;

  // 잡기 해제(드래그 생성과 별개)
  releaseGrab();

  // 드래그 생성 종료
  if (!dragging || !dragStart) return;

  dragEndX = x;
  dragEndY = y;

  const w = dragEndX - dragStart.x;
  const h = dragEndY - dragStart.y;
  const boxW = Math.abs(w);
  const boxH = Math.abs(h);

  if (boxW < MIN_SIZE || boxH < MIN_SIZE) {
    dragging = false;
    dragStart = null;
    previewParams = null;
    return;
  }

  const centerX = dragStart.x + w / 2;
  const centerY = dragStart.y + h / 2;

  if (!previewParams) previewParams = generateKeyParams(boxW, boxH);

  // 겹침 방지: 스폰 위치를 살짝 위로 조정
  const spawnPos = findNonOverlappingSpawn(centerX, centerY, boxW, boxH, previewParams, currentAngle);

  keys.push(new KeyObject(spawnPos.x, spawnPos.y, boxW, boxH, previewParams, currentAngle));

  dragging = false;
  dragStart = null;
  previewParams = null;
}

// ---- p5 mouse ----
function mousePressed() { startPointer(mouseX, mouseY); }
function mouseDragged() { movePointer(mouseX, mouseY); }
function mouseReleased() { endPointer(mouseX, mouseY); }

// ---- p5 touch (모바일) ----
function touchStarted() {
  if (touches.length > 0) startPointer(touches[0].x, touches[0].y);
  return false;
}
function touchMoved() {
  if (touches.length > 0) movePointer(touches[0].x, touches[0].y);
  return false;
}
function touchEnded() {
  endPointer(pointerX, pointerY);
  return false;
}

// 키보드(데스크탑)
function keyPressed() {
  if (key === "c" || key === "C") clearAllKeys();
  if (dragging && keyCode === UP_ARROW) currentAngle = 0;
  
  // ✅ 'G' 키로 자이로센서 권한 요청 (iOS)
  if (key === "g" || key === "G") {
    if (!gyroEnabled && !gyroPermissionGranted) {
      requestGyroPermission();
    }
  }
}

// ✅ iOS 자이로센서 권한 요청
function requestGyroPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(response => {
        if (response === 'granted') {
          enableGyroscope();
        } else {
          console.log("Gyroscope permission denied.");
        }
      })
      .catch(err => {
        console.error("Error requesting gyroscope permission:", err);
      });
  } else {
    // Android 등: 바로 활성화
    enableGyroscope();
  }
}

// ==========================================================
// 프리뷰(드래그 중 랜덤 변화)
// ==========================================================
function drawPreview() {
  const w = dragEndX - dragStart.x;
  const h = dragEndY - dragStart.y;
  const boxW = Math.abs(w);
  const boxH = Math.abs(h);
  if (boxW < MIN_SIZE || boxH < MIN_SIZE) return;

  const centerX = dragStart.x + w / 2;
  const centerY = dragStart.y + h / 2;

  // 드래그 중 매 프레임 랜덤 변화
  previewParams = generateKeyParams(boxW, boxH);

  // WSAD + ←/→ 연속 회전
  const step = Math.PI / 48;
  const A = 65, D = 68, W = 87, S = 83;
  if (keyIsDown(LEFT_ARROW) || keyIsDown(A) || keyIsDown(W)) currentAngle -= step;
  if (keyIsDown(RIGHT_ARROW) || keyIsDown(D) || keyIsDown(S)) currentAngle += step;

  // 프레임
  push();
  noFill();
  stroke(0, 80);
  strokeWeight(1.5);
  rect(centerX, centerY, boxW, boxH);
  pop();

  // 프리뷰 키
  push();
  translate(centerX, centerY);
  rotate(currentAngle);
  drawKeyGraphic(0, 0, boxW, boxH, previewParams);
  pop();
}

// ==========================================================
// 열쇠 파라미터/그래픽
// ==========================================================
function generateKeyParams(boxW, boxH) {
  const overallH = boxH * 0.9;

  const bowH = overallH * random(0.30, 0.45);
  const bowW = Math.min(boxW * 0.5, bowH * random(0.85, 1.45));

  const shaftHeight = overallH * random(0.25, 0.35);

  const notchCount = Math.floor(random(3, 7));
  const notchDepths = [];
  for (let i = 0; i < notchCount; i++) {
    notchDepths.push(random(shaftHeight * 0.35, shaftHeight * 1.05));
  }

  const col = color(random(40, 255), random(40, 255), random(40, 255));
  return { bowW, bowH, shaftHeight, notchCount, notchDepths, col };
}

function drawKeyGraphic(cx, cy, boxW, boxH, p) {
  const { bowW, bowH, shaftHeight, notchCount, notchDepths, col } = p;

  push();
  translate(cx, cy);
  rectMode(CENTER);
  noStroke();

  const bowX = -boxW * 0.3;
  const bowY = 0;

  const shaftW = boxW * 0.7;
  const shaftH = shaftHeight;
  const shaftX = bowX + bowW * 0.6 + shaftW / 2;
  const shaftY = 0;

  // head
  fill(col);
  ellipse(bowX, bowY, bowW, bowH);

  // hole
  fill(245);
  ellipse(bowX, bowY, bowW * 0.5, bowH * 0.5);

  // shaft
  fill(col);
  rect(shaftX, shaftY, shaftW, shaftH);

  // notches
  const tipRegionRatio = 0.35;
  const regionStart = shaftX + shaftW / 2 - shaftW * tipRegionRatio;
  const regionEnd = shaftX + shaftW / 2;
  const usableWidth = regionEnd - regionStart;

  const notchSpacing = usableWidth / (notchCount + 1);
  for (let i = 0; i < notchCount; i++) {
    const nx = regionStart + notchSpacing * (i + 1);
    const depth = notchDepths[i];
    rect(nx, shaftY + shaftH / 2 + depth / 2, notchSpacing * 0.7, depth);
  }

  pop();
}

// ==========================================================
// 스프링(대롱대롱) 잡기
// ==========================================================
function tryGrabKey(mx, my) {
  if (keys.length === 0) return false;

  const bodies = keys.map(k => k.body);
  const found = Matter.Query.point(bodies, { x: mx, y: my });
  if (found.length === 0) return false;

  grabBody = found[0];

  const localPoint = Matter.Vector.sub({ x: mx, y: my }, grabBody.position);

  grabConstraint = Matter.Constraint.create({
    pointA: { x: mx, y: my },
    bodyB: grabBody,
    pointB: localPoint,
    length: 18,
    stiffness: 0.010,
    damping: 0.05
  });

  Matter.World.add(world, grabConstraint);
  return true;
}

function releaseGrab() {
  if (!grabConstraint) return;
  Matter.World.remove(world, grabConstraint);
  grabConstraint = null;
  grabBody = null;
}

// ==========================================================
// 겹침 방지(간단): 기존 바디들과 충돌하면 위로 조금씩 올림
// ==========================================================
function findNonOverlappingSpawn(x, y, w, h, params, angle) {
  const others = keys.map(k => k.body);
  if (others.length === 0) return { x, y };

  // 테스트용 임시 바디(월드에 넣지 않음)
  const temp = buildKeyBodyLocal(0, 0, w, h, params, angle);
  let tx = x, ty = y;

  for (let i = 0; i < 30; i++) {
    Matter.Body.setPosition(temp, { x: tx, y: ty });
    const hits = Matter.Query.collides(temp, others);
    if (hits.length === 0) break;
    ty -= 10; // 위로 올려보기
  }
  return { x: tx, y: ty };
}

// ==========================================================
// KeyObject (머리 + 몸통 + 톱니 충돌)
// ==========================================================
class KeyObject {
  constructor(x, y, w, h, params, initialAngle) {
    this.w = w;
    this.h = h;
    this.params = params;

    this.body = buildKeyBodyLocal(x, y, w, h, params, initialAngle);

    Matter.World.add(world, this.body);
  }

  show() {
    const pos = this.body.position;
    const angle = this.body.angle;

    push();
    translate(pos.x, pos.y);
    rotate(angle);

    drawKeyGraphic(0, 0, this.w, this.h, this.params);

    pop();
  }
}

// ==========================================================
// 로컬 좌표 기반 Key Body 생성 함수
// ==========================================================
function buildKeyBodyLocal(x, y, w, h, params, angle) {
  const bowW = params.bowW;
  const bowH = params.bowH;

  const bowX = -w * 0.3;
  const bowY = 0;

  const shaftW = w * 0.7;
  const shaftH = params.shaftHeight;
  const shaftX = bowX + bowW * 0.6 + shaftW / 2;
  const shaftY = 0;

  const partOpts = {
    density: 0.002,
    friction: 0.6,
    restitution: 0.05
  };

  // 머리: 타원 충돌을 polygon으로 근사
  const head = makeEllipseBody(bowX, bowY, bowW * 0.95, bowH * 0.95, 20, partOpts);

  // 몸통
  const shaft = Matter.Bodies.rectangle(shaftX, shaftY, shaftW, shaftH, partOpts);

  // 톱니 파츠(충돌)
  const notchBodies = [];
  const notchCount = params.notchCount;
  const notchDepths = params.notchDepths;

  const tipRegionRatio = 0.35;
  const regionStart = shaftX + shaftW / 2 - shaftW * tipRegionRatio;
  const regionEnd = shaftX + shaftW / 2;
  const usableWidth = regionEnd - regionStart;

  const notchSpacing = usableWidth / (notchCount + 1);
  const notchW = notchSpacing * 0.7;

  for (let i = 0; i < notchCount; i++) {
    const nx = regionStart + notchSpacing * (i + 1);
    const depth = notchDepths[i];
    const notchH = constrain(depth, shaftH * 0.1, shaftH * 1.6);

    const notchCenterX = nx;
    const notchCenterY = shaftY + shaftH / 2 + notchH / 2;

    notchBodies.push(
      Matter.Bodies.rectangle(notchCenterX, notchCenterY, notchW, notchH, partOpts)
    );
  }

  const compound = Matter.Body.create({
    parts: [head, shaft, ...notchBodies],
    friction: 0.6,
    restitution: 0.08,
    frictionAir: 0.02
  });

  Matter.Body.setPosition(compound, { x, y });
  Matter.Body.setAngle(compound, angle);

  return compound;
}

// 타원(ellipse) 충돌용 폴리곤 생성
function makeEllipseBody(cx, cy, w, h, steps, opts) {
  const verts = [];
  const rx = w / 2;
  const ry = h / 2;

  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    verts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }

  return Matter.Bodies.fromVertices(cx, cy, [verts], opts, true);
}

// ==========================================================
// 유틸
// ==========================================================
function clearAllKeys() {
  for (const k of keys) Matter.World.remove(world, k.body);
  keys = [];
}