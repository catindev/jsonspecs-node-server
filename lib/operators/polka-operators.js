function validInn10(value) {
  if (typeof value !== "string" || !/^\d{10}$/.test(value)) return false;

  const digits = value.split("").map(Number);
  const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
  const checksum = weights.reduce((sum, weight, index) => sum + weight * digits[index], 0) % 11 % 10;

  return checksum === digits[9];
}

module.exports = {
  check: {
    inn10_valid(rule, ctx) {
      try {
        const got = ctx.get(rule.field);
        return {
          status: got.ok && validInn10(got.value) ? "OK" : "FAIL",
          actual: got.ok ? got.value : undefined
        };
      } catch (error) {
        return { status: "EXCEPTION", error };
      }
    }
  },
  predicate: {},
  meta: {
    operators: {
      inn10_valid: { description: "ИНН юридического лица корректен по контрольной сумме" }
    }
  }
};
