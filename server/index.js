const path = require("path");
const express = require("express");
const cors = require("cors");

require("./db"); // ensure DB + storage dir are initialized

const foldersRouter = require("./routes/folders");
const modelsRouter = require("./routes/models");
const filesRouter = require("./routes/files");
const uploadRouter = require("./routes/upload");
const resolveRouter = require("./routes/resolve");

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

app.use(cors());
app.use(express.json());

app.use("/api/folders", foldersRouter);
app.use("/api/models", modelsRouter);
app.use("/api", filesRouter);
app.use("/api", uploadRouter);
app.use("/api/resolve", resolveRouter);

// Serve the built React app in production
app.use(express.static(CLIENT_DIST));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("Client build not found. Run `npm run build` in /client.");
  });
});

app.listen(PORT, () => {
  console.log(`StlStash server listening on http://localhost:${PORT}`);
});
