const baseConfig = require("./jest.config");

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: ["/node_modules/", "/build/", "/dist/"],
};
