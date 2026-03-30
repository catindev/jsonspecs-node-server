const { deepGet } = require("jsonspecs");

function checksum10(inn10) {
  const d = inn10.split("").map((x) => Number(x));
  const w = [2, 4, 10, 3, 5, 9, 4, 6, 8];
  let s = 0;
  for (let i = 0; i < 9; i += 1) s += w[i] * d[i];
  return (s % 11) % 10;
}

function checksum11(inn12) {
  const d = inn12.split("").map((x) => Number(x));
  const w = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
  let s = 0;
  for (let i = 0; i < 11; i += 1) s += w[i] * d[i];
  return (s % 11) % 10;
}

function checksum12(inn12) {
  const d = inn12.split("").map((x) => Number(x));
  const w = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0];
  let s = 0;
  for (let i = 0; i < 11; i += 1) s += w[i] * d[i];
  return (s % 11) % 10;
}

module.exports = function validInn(rule, ctx) {
  try {
    const got = deepGet(ctx.payload, rule.field);
    if (!got.ok) return { status: "FAIL" };

    const inn = String(got.value ?? "");
    if (!/^\d+$/.test(inn)) return { status: "FAIL" };

    if (inn.length === 10) {
      return { status: checksum10(inn) === Number(inn[9]) ? "OK" : "FAIL" };
    }

    if (inn.length === 12) {
      const ok = checksum11(inn) === Number(inn[10]) && checksum12(inn) === Number(inn[11]);
      return { status: ok ? "OK" : "FAIL" };
    }

    return { status: "FAIL" };
  } catch (error) {
    return { status: "EXCEPTION", error };
  }
};
