let players = [];
let coupons = [];

const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");

const couponRateInput = document.getElementById("couponRateInput");
const couponLimitInput = document.getElementById("couponLimitInput");
const couponCountInput = document.getElementById("couponCountInput");
const addCouponBtn = document.getElementById("addCouponBtn");

function parseBp(value) {
  if (!value) return 0;

  const clean = value.replaceAll(",", "").replaceAll(" ", "");
  let total = 0;

  const joMatch = clean.match(/(\d+)조/);
  const eokMatch = clean.match(/(\d+)억/);

  if (joMatch) total += Number(joMatch[1]) * 10000;
  if (eokMatch) total += Number(eokMatch[1]);

  if (!joMatch && !eokMatch) total += Number(clean) || 0;

  return total; // 억 단위
}

function formatBp(eok) {
  eok = Math.max(0, Math.floor(eok));

  const jo = Math.floor(eok / 10000);
  const rest = eok % 10000;

  if (jo > 0 && rest > 0) {
    return `${jo}조 ${rest.toLocaleString()}억 BP`;
  }

  if (jo > 0) {
    return `${jo}조 BP`;
  }

  return `${rest.toLocaleString()}억 BP`;
}

function getBestCouponDiscount(price) {
  if (coupons.length === 0) return 0;

  let maxDiscount = 0;

  coupons.forEach((coupon) => {
    const discount = price * (coupon.rate / 100);
    const limitedDiscount = Math.min(discount, coupon.limit);

    if (limitedDiscount > maxDiscount) {
      maxDiscount = limitedDiscount;
    }
  });

  return maxDiscount;
}

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
      <input 
        class="name-input" 
        placeholder="선수 이름" 
        value="${player.name}"
        data-index="${index}"
      >

      <input 
        class="price-input" 
        placeholder="예: 1조 2000억" 
        value="${player.price}"
        data-index="${index}"
      >

      <div class="discount-rate">
        ${coupons.length > 0 ? "적용" : "-"}
      </div>

      <div class="discount-price">
        ${formatBp(afterPrice)}
      </div>

      <button class="delete-btn" data-index="${index}">
        삭제
      </button>
    `;

    playerList.appendChild(row);
  });

  bindPlayerEvents();
  calculateResult();
}

function bindPlayerEvents() {
  document.querySelectorAll(".name-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const index = e.target.dataset.index;
      players[index].name = e.target.value;
    });
  });

  document.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const index = e.target.dataset.index;
      players[index].price = e.target.value;
      renderPlayers();
    });
  });

  document.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      const index = e.target.dataset.index;
      players.splice(index, 1);
      renderPlayers();
    });
  });
}

function calculateResult() {
  let totalBeforeDiscount = 0;
  let totalAfterDiscount = 0;
  let totalCouponDiscount = 0;

  players.forEach((player) => {
    const price = parseBp(player.price);
    const discount = getBestCouponDiscount(price);

    totalBeforeDiscount += price;
    totalCouponDiscount += discount;
    totalAfterDiscount += price - discount;
  });

  document.getElementById("finalPrice").textContent = formatBp(totalAfterDiscount);
  document.getElementById("totalDiscountPrice").textContent = formatBp(totalBeforeDiscount);
  document.getElementById("couponPrice").textContent = formatBp(totalCouponDiscount);

  document.getElementById("formulaTotal").textContent = formatBp(totalBeforeDiscount);
  document.getElementById("formulaCoupon").textContent = formatBp(totalCouponDiscount);
  document.getElementById("formulaFinal").textContent = formatBp(totalAfterDiscount);
}

document.getElementById("addPlayerBtn").addEventListener("click", () => {
  players.push({
    name: "",
    price: "",
  });

  renderPlayers();
});

addCouponBtn.addEventListener("click", () => {
  const rate = Number(couponRateInput.value);
  const limit = Number(couponLimitInput.value);
  const count = Number(couponCountInput.value) || 1;

  if (!rate || !limit) {
    alert("수쿠와 한도를 입력해주세요.");
    return;
  }

  for (let i = 0; i < count; i++) {
    coupons.push({
      rate,
      limit,
    });
  }

  couponRateInput.value = "";
  couponLimitInput.value = "";
  couponCountInput.value = 1;

  renderPlayers();
});

renderPlayers();