const express = require("express");
const users = require("./routes/users");
const orders = require("./routes/orders");

const app = express();
app.use(express.json());
app.use("/api", users);
app.use("/api", orders);

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

app.listen(process.env.PORT || 3000);
