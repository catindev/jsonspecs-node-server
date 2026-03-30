const { deepGet } = require("jsonspecs");

module.exports = function validOgrn(rule, ctx) {
  try {
    const got = deepGet(ctx.payload, rule.field);
    if (!got.ok) return { status: "FAIL" };

    const value = String(got.value ?? "");
    if (!/^\d+$/.test(value)) return { status: "FAIL" };

    if (value.length === 13) {
      const number = BigInt(value.slice(0, 12));
      const controlDigit = Number((number % 11n) % 10n);
      return { status: controlDigit === Number(value[12]) ? "OK" : "FAIL" };
    }

    if (value.length === 15) {
      const number = BigInt(value.slice(0, 14));
      const controlDigit = Number((number % 13n) % 10n);
      return { status: controlDigit === Number(value[14]) ? "OK" : "FAIL" };
    }

    return { status: "FAIL" };
  } catch (error) {
    return { status: "EXCEPTION", error };
  }
};
