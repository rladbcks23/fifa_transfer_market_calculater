let players = [];
let coupons = [];

const BASE_FEE_RATE = 0.4;

const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");

const couponRateInput = document.getElementById("couponRateInput");
const couponLimitInput = document.getElementById("couponLimitInput");
const couponCountInput = document.getElementById("couponCountInput");
const addCouponBtn = document.getElementById("addCouponBtn");

const imageInput = document.getElementById("imageInput");
const uploadBox = document.getElementById("uploadBox");
const uploadedImageList = document.getElementById("uploadedImageList");
const loadingOverlay = document.getElementById("loadingOverlay");

const pcRoomToggle = document.getElementById("pcRoomToggle");
const topClassToggle = document.getElementById("topClassToggle");

const couponList = document.getElementById("couponList");

// ---------------- 가격 처리 ----------------
function parseBp(value) {
  if (!value) return 0;

  const clean = value.replaceAll(",", "").replaceAll(" ", "");
  let total = 0;

  const joMatch = clean.match(/(\d+)조/);
  const eokMatch = clean.match(/(\d+)억/);

  if (joMatch) total += Number(joMatch[1]) * 10000;
  if (eokMatch) total += Number(eokMatch[1]);

  if (!joMatch && !eokMatch) total += Number(clean) || 0;

  return total;
}

function formatBp(eok) {
  eok = Math.max(0, Math.floor(eok));

  const jo = Math.floor(eok / 10000);
  const rest = eok % 10000;

  if (jo > 0 && rest > 0) {
    return `${jo}조 ${rest.toLocaleString()}억 BP`;
  }

  if (jo > 0) return `${jo}조 BP`;

  return `${rest.toLocaleString()}억 BP`;
}

function getPriceInputNumber(value) {
  return value.replace(/[^\d]/g, "");
}

function formatPriceInput(value) {
  const price = parseBp(value);
  return price > 0 ? formatBp(price) : "";
}

// ---------------- 쿠폰 배정 ----------------
function getAssignedCouponMap() {
  const couponMap = new Map();

  const sortedPlayers = players
    .map((p, index) => ({
      index,
      price: parseBp(p.price),
    }))
    .sort((a, b) => b.price - a.price);

  const sortedCoupons = [...coupons].sort((a, b) => b.rate - a.rate);

  sortedPlayers.forEach((p, i) => {
    if (sortedCoupons[i]) {
      couponMap.set(p.index, sortedCoupons[i]);
    }
  });

  return couponMap;
}

// ---------------- 수수료 계산 ----------------
function getGlobalFeeDiscountRate() {
  let rate = 0;

  if (pcRoomToggle?.checked) rate += 30;
  if (topClassToggle?.checked) rate += 20;

  return rate;
}

function getFinalPrice(price, coupon = null) {
  const baseFee = price * BASE_FEE_RATE;

  const globalDiscount = baseFee * (getGlobalFeeDiscountRate() / 100);

  let couponDiscount = 0;

  if (coupon) {
    const discount = baseFee * (coupon.rate / 100);
    couponDiscount = Math.min(discount, coupon.limit);
  }

  const finalFee = Math.max(0, baseFee - globalDiscount - couponDiscount);

  return price - finalFee;
}

function getCouponDiscountAmount(price, coupon = null) {
  if (!coupon) return 0;

  const baseFee = price * BASE_FEE_RATE;
  const discount = baseFee * (coupon.rate / 100);

  return Math.min(discount, coupon.limit);
}

// ---------------- 라벨 ----------------
function getAppliedDiscountLabel(price, coupon = null) {
  const labels = [];

  if (pcRoomToggle?.checked) labels.push("PC방");
  if (topClassToggle?.checked) labels.push("TOP");

  if (coupon) {
    const couponDiscount = getCouponDiscountAmount(price, coupon);
    labels.push(`수쿠 ${coupon.rate}% (${formatBp(couponDiscount)})`);
  }

  return labels.length ? labels.join(" + ") : "-";
}

// ---------------- 렌더 ----------------
function renderPlayers() {
  playerList.innerHTML = "";
  playerCount.textContent = players.length;

  const couponMap = getAssignedCouponMap();

  players.forEach((player, index) => {
    const displayPrice = formatPriceInput(player.price);
    const price = parseBp(displayPrice);
    const coupon = couponMap.get(index) || null;
    const afterPrice = getFinalPrice(price, coupon);

    const row = document.createElement("div");
    row.className = "player-row";
    row.dataset.index = index;

    row.innerHTML = `
      <input class="price-input" value="${displayPrice}" data-index="${index}" inputmode="numeric">
      <div class="discount-rate">${getAppliedDiscountLabel(price, coupon)}</div>
      <div class="discount-price">${formatBp(afterPrice)}</div>
      <button class="delete-btn" data-index="${index}">삭제</button>
    `;

    playerList.appendChild(row);
  });

  bindEvents();
  calculateResult();
}

function updatePlayerRows() {
  const couponMap = getAssignedCouponMap();

  document.querySelectorAll(".player-row").forEach((row) => {
    const index = Number(row.dataset.index);
    const player = players[index];

    if (!player) return;

    const price = parseBp(player.price);
    const coupon = couponMap.get(index) || null;
    const afterPrice = getFinalPrice(price, coupon);

    row.querySelector(".discount-rate").textContent = getAppliedDiscountLabel(price, coupon);
    row.querySelector(".discount-price").textContent = formatBp(afterPrice);
  });
}

// ---------------- 이벤트 ----------------
function bindEvents() {
  document.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("focus", (e) => {
      const price = parseBp(players[e.target.dataset.index].price);
      e.target.value = price > 0 ? String(price) : "";
    });

    input.addEventListener("input", (e) => {
      const rawPrice = getPriceInputNumber(e.target.value);
      players[e.target.dataset.index].price = rawPrice;
      e.target.value = rawPrice;
      updatePlayerRows();
      calculateResult();
    });

    input.addEventListener("blur", () => {
      renderPlayers();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.target.blur();
      }
    });
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      players.splice(e.target.dataset.index, 1);
      renderPlayers();
    });
  });
}

// ---------------- 결과 ----------------
function calculateResult() {
  let totalBefore = 0;
  let totalAfter = 0;

  const couponMap = getAssignedCouponMap();

  players.forEach((p, index) => {
    const price = parseBp(p.price);
    const coupon = couponMap.get(index) || null;
    const final = getFinalPrice(price, coupon);

    totalBefore += price;
    totalAfter += final;
  });

  const fee = totalBefore - totalAfter;

  document.getElementById("finalPrice").textContent = formatBp(totalAfter);
  document.getElementById("totalDiscountPrice").textContent = formatBp(totalBefore);
  document.getElementById("couponPrice").textContent = formatBp(fee);

  document.getElementById("formulaTotal").textContent = formatBp(totalBefore);
  document.getElementById("formulaCoupon").textContent = formatBp(fee);
  document.getElementById("formulaFinal").textContent = formatBp(totalAfter);
}

// ---------------- 선수 추가 ----------------
document.getElementById("addPlayerBtn").addEventListener("click", () => {
  players.push({ price: "" });
  renderPlayers();
});

// ---------------- 수쿠 추가 (한도 optional) ----------------
function addCoupon() {
  const rate = Number(couponRateInput.value);
  const limit = couponLimitInput.value
    ? Number(couponLimitInput.value)
    : Infinity;
  const count = Number(couponCountInput.value) || 1;

  if (!rate) {
    alert("수쿠를 입력하세요");
    return;
  }

  for (let i = 0; i < count; i++) {
    coupons.push({ rate, limit });
  }

  couponRateInput.value = "";
  couponLimitInput.value = "";
  couponCountInput.value = 1;

  renderCoupons();
  renderPlayers();
  couponRateInput.focus();
}

addCouponBtn.addEventListener("click", addCoupon);

[couponRateInput, couponLimitInput, couponCountInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();
    addCoupon();
  });
});

// ---------------- 토글 ----------------
pcRoomToggle?.addEventListener("change", renderPlayers);
topClassToggle?.addEventListener("change", renderPlayers);

// ---------------- 이미지 ----------------
function addImageToPanel(file) {
  const url = URL.createObjectURL(file);

  const card = document.createElement("div");
  card.className = "uploaded-image-card";

  card.innerHTML = `
    <img src="${url}">
    <span>${file.name}</span>
  `;

  uploadedImageList.appendChild(card);
}

async function uploadImageFile(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    return;
  }

  addImageToPanel(file);

  const formData = new FormData();
  formData.append("image", file);

  try {
    loadingOverlay.classList.add("active");

    const res = await fetch("/upload-image/", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "이미지 분석에 실패했습니다.");
    }

    if (!Array.isArray(data.players)) {
      throw new Error("OCR 응답 형식이 올바르지 않습니다.");
    }

    const newPlayers = data.players.map((p) => ({
      price: formatPriceInput(p.price || ""),
    }));

    players.push(...newPlayers);

    renderPlayers();
  } catch (err) {
    console.error(err);
    alert(err.message || "이미지 분석에 실패했습니다.");
  } finally {
    loadingOverlay.classList.remove("active");
    imageInput.value = "";
  }
}

imageInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  await uploadImageFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadBox.addEventListener(eventName, (e) => {
    e.preventDefault();
    uploadBox.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadBox.addEventListener(eventName, (e) => {
    e.preventDefault();
    uploadBox.classList.remove("drag-over");
  });
});

uploadBox.addEventListener("drop", async (e) => {
  const file = e.dataTransfer.files[0];
  await uploadImageFile(file);
});

function renderCoupons() {
  couponList.innerHTML = "";

  coupons.forEach((coupon, index) => {
    const item = document.createElement("div");
    item.className = "coupon-item";

    const limitText = coupon.limit === Infinity
      ? "한도 없음"
      : `${coupon.limit.toLocaleString()}억 BP`;

    item.innerHTML = `
      <strong>수쿠 ${coupon.rate}%</strong>
      <span>${limitText}</span>
      <button class="coupon-delete-btn" data-index="${index}">삭제</button>
    `;

    couponList.appendChild(item);
  });

  document.querySelectorAll(".coupon-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = Number(e.target.dataset.index);
      coupons.splice(index, 1);
      renderCoupons();
      renderPlayers();
    });
  });
}

renderPlayers();
