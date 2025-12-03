// ======================== 文本内容 ========================

let originalLines = [
  "There are days when the sheer monotony of it all makes me want to burn every trace of my routine.",
  "This existence, the same page on repeat, is what truly drains me. That slow, grinding pressure",
  "steals more than just time; it dims your passion and snuffs out your inner light.",
  "All I can do is stand by and watch, a passive spectator from the sidelines of my own life,",
  "as the last of my spirit fades to embers. I keep waiting for a sudden change to surge within me,",
  "for a vision of an open grassland to appear in my mind—a promise that my soul could still take flight",
  "and escape this cage of responsibilities. But the alarm clock rings, the to-do list waits,",
  "and the dream dissolves. The weight of a thousand mundane expectations is a heavy cloak I can't take off.",
  "I'm just so tired of pretending to be okay."
];

// ======================== 保留词 ========================

let keepWordsByLine = [
  ["burn"],
  ["This", "page", "That"],
  ["steals", "your", "light"],
  ["watch", "from", "the"],
  ["embers", "surge", "a"],
  ["grassland", "in", "flight"],
  [],
  []
];

// ======================== 行状态 ========================

let lineStates = []; // {phase:"idle"|"burning"|"done", progress:0-1}
let nextLineIndex = 0;
let lineWidths = [];
let keepWordPositions = [];
let customFont; // 👈 新增：存放 loadFont 载入的字体

// ======================== 样式 ========================

let textSizeValue = 25;
let textFontValue = "usefont";
let lineSpacing = 48;

// ======================== 背景 ========================

let bgImg;
let bgLoaded = false;

// ⭐改成你的背景图片文件名
const bgImgPath = "paper1.png";

// ======================== 摄像头 + handpose ========================

let video;
let handpose;
let predictions = [];

let thumbHistory = [];
let historyLength = 10;
let swipeReady = true;
let swipeCooldown = 0;
let debugDx = 0;

// ======================== preload ========================

function preload() {
  customFont = loadFont('usefont.ttf');
  bgImg = loadImage(
    bgImgPath,
    () => { bgLoaded = true; console.log("Background loaded"); },
    () => { bgLoaded = false; console.warn("Failed to load background"); }
  );
}

// ======================== setup ========================

function setup() {
  createCanvas(windowWidth, windowHeight);
textFont(customFont);  // ⭐新增：使用自定义字体
textSize(textSizeValue);
  textAlign(CENTER, CENTER);

  // 行宽、保留词位置、状态初始化
  for (let i = 0; i < originalLines.length; i++) {
    let line = originalLines[i];
    lineStates[i] = { phase: "idle", progress: 0 };
    lineWidths[i] = textWidth(line);

    // 定位关键词原来的 offset 位置
    let keeps = keepWordsByLine[i];
    let positions = [];
    let searchStart = 0;

    for (let w = 0; w < keeps.length; w++) {
      let word = keeps[w];
      let index = line.indexOf(word, searchStart);
      if (index === -1) index = line.indexOf(word);
      if (index === -1) continue;

      let prefix = line.substring(0, index);
      let offset = textWidth(prefix);
      positions.push({ word, offset });
      searchStart = index + word.length;
    }
    keepWordPositions[i] = positions;
  }

  // 摄像头
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  // handpose
  handpose = ml5.handpose(video, () => {
    console.log("Handpose loaded");
  });

  handpose.on("predict", r => {
    predictions = r;
  });
}

// ======================== draw ========================

function draw() {
  background(255);

  // 背景图
  if (bgLoaded) {
    image(bgImg, 0, 0, width, height);
  }

  // 文字绘制
  textFont(customFont);
  textSize(textSizeValue);

  drawLinesWithLeftToRightErase();
  

  // 摄像头预览（可删）
  drawVideoPreview();

  // 手势识别
  detectThumbSwipe();

  // 文本消失动画
  updateLineBurning();

  if (swipeCooldown > 0) {
    swipeCooldown--;
    if (swipeCooldown <= 0) swipeReady = true;
  }

  // 调试（可删）
  drawDebugInfo();
}

// ======================== 文字：左→右消失 + 保留词原位 ========================

function drawLinesWithLeftToRightErase() {
  fill(0);
  textFont(customFont);   
  textSize(textSizeValue);
  textAlign(LEFT, CENTER);

  let totalHeight = originalLines.length * lineSpacing;
  let topOffset = height / 2 - totalHeight / 2;

  for (let i = 0; i < originalLines.length; i++) {
    let state = lineStates[i];
    let line = originalLines[i];
    let w = lineWidths[i];

    let y = topOffset + i * lineSpacing;
    let leftX = width / 2 - w / 2;
    let lh = textSizeValue * 1.4;

    if (state.phase === "idle") {
      text(line, leftX, y);

    } else if (state.phase === "burning") {
      let t = state.progress;
      let visibleWidth = (1 - t) * w;

      // 剪裁显示整句左边 visibleWidth
      if (visibleWidth > 0) {
        push();
        let ctx = drawingContext;
        ctx.save();
        ctx.beginPath();
        ctx.rect(leftX, y - lh / 2, visibleWidth, lh);
        ctx.clip();

        text(line, leftX, y);

        ctx.restore();
        pop();
      }

      // 保留词（不居中、停在原来的 offset 上）
      let keeps = keepWordPositions[i];
      for (let k = 0; k < keeps.length; k++) {
        let kw = keeps[k];
        let xWord = leftX + kw.offset;
        text(kw.word, xWord, y);
      }

    } else if (state.phase === "done") {
      // 只画保留词
      let keeps = keepWordPositions[i];
      for (let k = 0; k < keeps.length; k++) {
        let kw = keeps[k];
        let xWord = leftX + kw.offset;
        text(kw.word, xWord, y);
      }
    }
  }
}

// ======================== 动画：逐渐擦除 ========================

function updateLineBurning() {
  for (let s of lineStates) {
    if (s.phase === "burning") {
      s.progress += 0.015;
      if (s.progress >= 1) {
        s.progress = 1;
        s.phase = "done";
      }
    }
  }
}

// ======================== 手势检测（拇指左右划） ========================

function detectThumbSwipe() {
  if (predictions.length === 0) return;

  let hand = predictions[0];
  if (!hand.annotations || !hand.annotations.thumb) return;

  let x = hand.annotations.thumb[3][0];
  thumbHistory.push(x);
  if (thumbHistory.length > historyLength) thumbHistory.shift();

  if (!swipeReady || thumbHistory.length < historyLength) return;

  let dx = thumbHistory[thumbHistory.length - 1] - thumbHistory[0];
  debugDx = dx;

  if (Math.abs(dx) > 60) {
    triggerLineBurn();
    swipeReady = false;
    swipeCooldown = 20;
    thumbHistory = [];
  }
}


function triggerLineBurn() {
  if (nextLineIndex >= originalLines.length) return;
  let s = lineStates[nextLineIndex];
  if (s.phase === "idle") s.phase = "burning";
  nextLineIndex++;
}

// ======================== 摄像头预览（可删） ========================

function drawVideoPreview() {
  push();
  translate(320, 0);
  scale(-1, 1);
  image(video, 0, 0, 320, 240);
  pop();
}

// ======================== 调试信息（可删） ========================

function drawDebugInfo() {
  fill(0);
  textSize(14);
  textAlign(LEFT, TOP);
  text(
    "dx: " + nf(debugDx, 1, 2) +
    "\nnext line: " + nextLineIndex +
    "\npredictions: " + predictions.length,
    10,
    height - 80
  );
}

// ======================== 窗口自适应 ========================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
