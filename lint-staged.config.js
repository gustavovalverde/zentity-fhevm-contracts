module.exports = {
  "*.{js,ts}": ["biome check --write --no-errors-on-unmatched"],
  "*.{json,jsonc}": ["biome check --write --no-errors-on-unmatched"],
  "*.sol": ["solhint --fix"],
  "*.md": ["biome format --write --no-errors-on-unmatched"],
};
