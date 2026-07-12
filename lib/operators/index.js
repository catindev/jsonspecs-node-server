const { Operators: BaseOperators } = require("jsonspecs");

const PolkaOperators = require("./polka-operators");

const Operators = {
  predicate: {
    ...BaseOperators.predicate,
    ...(PolkaOperators.predicate || {}),
  },
  check: {
    ...BaseOperators.check,
    ...(PolkaOperators.check || {}),
  },
};

module.exports = { Operators };
