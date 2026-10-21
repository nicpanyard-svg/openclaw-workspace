const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), false);
const errors = [];
if (process.env.RAPIDQUOTE_ACCESS_MODE !== "restricted") errors.push("Set RAPIDQUOTE_ACCESS_MODE=restricted for the hosted pilot. Browser sign-in is not a security boundary.");
if (!process.env.RAPIDQUOTE_ACCESS_USER || process.env.RAPIDQUOTE_ACCESS_USER.includes(":")) errors.push("Set a deployment access username without colons.");
if ((process.env.RAPIDQUOTE_ACCESS_PASSWORD || "").length < 20) errors.push("Set RAPIDQUOTE_ACCESS_PASSWORD to a unique random secret of at least 20 characters.");
try {
  const url = new URL(process.env.RAPIDQUOTE_APP_ORIGIN || "");
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
} catch { errors.push("Set RAPIDQUOTE_APP_ORIGIN to the HTTPS application origin, without a path."); }
if (!["inet", "ilios"].includes(process.env.NEXT_PUBLIC_RAPIDQUOTE_ENV || "inet")) errors.push("NEXT_PUBLIC_RAPIDQUOTE_ENV must be inet or ilios.");
for (const error of errors) console.error(error);
if (errors.length) process.exit(1);
console.log("Hosted pilot configuration passed. No secret values were printed.");
console.log("Production identity, authorization, shared persistence, and recovery acceptance remain separate release gates.");
