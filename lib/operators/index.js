const { Operators: BaseOperators } = require("jsonspecs");

const validInn = require("./check/valid_inn");
const validOgrn = require("./check/valid_ogrn");

const Operators = {
  predicate: {
    ...BaseOperators.predicate,
  },
  check: {
    ...BaseOperators.check,
    valid_inn: validInn,
    valid_ogrn: validOgrn,
  },
};

module.exports = { Operators };
