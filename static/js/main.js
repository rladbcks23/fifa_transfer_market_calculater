let players = [];
let coupons = [];

const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");

const couponRateInput = document.getElementById("couponRateInput");
const couponLimitInput = document.getElementById("couponLimitInput");
const couponCountInput = document.getElementById("couponCountInput");
const addCouponBtn = document.getElementById("addCouponBtn");

const imageInput = document.getElementById("imageInput");
const uploadedImageList = document.getElementById("uploadedImageList");

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

// ---------------- 수쿠 ----------------
function getBestCouponDiscount(price) {
  if (coupons.length === 0) return 0;

  let maxDiscount = 0;

  coupons.forEach((coupon) => {
    const discount = price * (coupon.rate / 100);
    const limited = Math.min(discount, coupon.limit);

    if (limited > maxDiscount) maxDiscount = limited;
  });

  return maxDiscount;
}

// ---------------- 렌더 ----------------
function renderPlayers() {
  playerList.innerHTML = "";
  playerCount.textContent = players.length;

  players.forEach((player, index) => {
    const price = parseBp(player.price);
    const discount = getBestCouponDiscount(price);
    const afterPrice = price - discount;

    const row = document.createElement("div");
    row.className = "player-row";

    row.innerHTML = `
      <input class="name-input" value="${player.name}" data-index="${index}">
      <input class="price-input" value="${player.price}" data-index="${index}">
      <div class="discount-rate">${coupons.length ? "적용" : "-"}</div>
      <div class="discount-price">${formatBp(afterPrice)}</div>
      <button class="delete-btn" data-index="${index}">삭제</button>
    `;

    playerList.appendChild(row);
  });

  bindEvents();
  calculateResult();
}

function bindEvents() {
  document.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const i = e.target.dataset.index;
      players[i].price = e.target.value;

      const row = e.target.closest(".player-row");
      const price = parseBp(players[i].price);
      const after = price - getBestCouponDiscount(price);

      row.querySelector(".discount-price").textContent = formatBp(after);
      calculateResult();
    });
  });

  document.querySelectorAll(".name-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const i = e.target.dataset.index;
      players[i].name = e.target.value;
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
  let total = 0;
  let discount = 0;

  players.forEach((p) => {
    const price = parseBp(p.price);
    const d = getBestCouponDiscount(price);

    total += price;
    discount += d;
  });

  const final = total - discount;

  document.getElementById("finalPrice").textContent = formatBp(final);
  document.getElementById("totalDiscountPrice").textContent = formatBp(total);
  document.getElementById("couponPrice").textContent = formatBp(discount);

  document.getElementById("formulaTotal").textContent = formatBp(total);
  document.getElementById("formulaCoupon").textContent = formatBp(discount);
  document.getElementById("formulaFinal").textContent = formatBp(final);
}

// ---------------- 선수 추가 ----------------
document.getElementById("addPlayerBtn").addEventListener("click", () => {
  players.push({ name: "", price: "" });
  renderPlayers();
});

// ---------------- 수쿠 추가 ----------------
addCouponBtn.addEventListener("click", () => {
  const rate = Number(couponRateInput.value);
  const limit = Number(couponLimitInput.value);
  const count = Number(couponCountInput.value) || 1;

  if (!rate || !limit) {
    alert("수쿠와 한도를 입력해주세요.");
    return;
  }

  for (let i = 0; i < count; i++) {
    coupons.push({ rate, limit });
  }

  couponRateInput.value = "";
  couponLimitInput.value = "";
  couponCountInput.value = 1;

  renderPlayers();
});

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

imageInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  addImageToPanel(file);

  const formData = new FormData();
  formData.append("image", file);

  try {
    // 👉 로딩 시작
    loadingOverlay.classList.add("active");

    const res = await fetch("/upload-image/", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "OCR 실패");
      return;
    }

    players = data.players.map((p) => ({
      name: p.name || "",
      price: p.price || "",
    }));

    renderPlayers();
  } catch (err) {
    console.error(err);
    alert("업로드 중 오류 발생");
  } finally {
    // 👉 로딩 종료 (무조건 실행)
    loadingOverlay.classList.remove("active");
    imageInput.value = "";
  }
});

renderPlayers();
