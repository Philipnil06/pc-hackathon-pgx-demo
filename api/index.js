// Vercel serverless entry point. Vercel routes every request here (see
// vercel.json) and we hand it straight to the Express app, which does its own
// routing and static-file serving exactly as it does locally.
module.exports = require("../server");
