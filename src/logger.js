/**
 * Logger minimalista con marca de tiempo y colores en consola.
 */
const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function stamp() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export const log = {
  info: (msg) => console.log(`${colors.gray}[${stamp()}]${colors.reset} ${colors.cyan}INFO${colors.reset}  ${msg}`),
  ok: (msg) => console.log(`${colors.gray}[${stamp()}]${colors.reset} ${colors.green}OK${colors.reset}    ${msg}`),
  warn: (msg) => console.log(`${colors.gray}[${stamp()}]${colors.reset} ${colors.yellow}WARN${colors.reset}  ${msg}`),
  error: (msg) => console.log(`${colors.gray}[${stamp()}]${colors.reset} ${colors.red}ERROR${colors.reset} ${msg}`),
};
