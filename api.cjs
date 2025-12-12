// api.cjs
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();

/* =========================
 *   MIDDLEWARE
 * ======================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  })
);

app.use(express.static(path.join(__dirname, "public")));

/* =========================
 *   MONGO CONFIG
 * ======================= */
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://ragini_user:Ragini%402728@cluster0.nq1itcw.mongodb.net/ishopdb?retryWrites=true&w=majority&appName=Cluster0";

const DB_NAME = process.env.DB_NAME || "ishopdb";

const client = new MongoClient(MONGO_URI);

async function getDb() {
  if (!client.topology || !client.topology.isConnected?.()) {
    await client.connect();
    console.log("Mongo connected");
  }
  return client.db(DB_NAME);
}

function isValidObjectId(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

/* =========================
 *   PRODUCTS
 * ======================= */
app.get("/getproducts", async (req, res) => {
  try {
    const db = await getDb();
    const products = await db.collection("tblproducts").find({}).toArray();
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
 *   AUTH
 * ======================= */
app.post("/customerregister", async (req, res) => {
  try {
    const db = await getDb();
    const { UserId, FirstName, LastName, Email, Password } = req.body;

    if (!UserId || !FirstName || !LastName || !Email || !Password) {
      return res.json({ success: false, message: "All fields required" });
    }

    const exists = await db.collection("tblcustomers").findOne({ UserId });
    if (exists) {
      return res.json({ success: false, message: "User already exists" });
    }

    const hash = await bcrypt.hash(Password, 10);
    await db.collection("tblcustomers").insertOne({
      ...req.body,
      Password: hash,
      createdAt: new Date(),
    });

    res.json({ success: true, message: "Registered successfully" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Register failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const db = await getDb();
    const { UserId, Password } = req.body;

    const user = await db.collection("tblcustomers").findOne({ UserId });
    if (!user) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(Password, user.Password);
    if (!match) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    res.json({ success: true, userId: user.UserId });
  } catch (e) {
    res.status(500).json({ success: false, message: "Login error" });
  }
});

/* =========================
 *   ORDERS
 * ======================= */

// CREATE ORDER
app.post("/createorder", async (req, res) => {
  try {
    const db = await getDb();
    const order = {
      ...req.body,
      createdAt: new Date(),
      status: "Created",
    };

    const result = await db.collection("tblorders").insertOne(order);

    res.json({
      success: true,
      orderId: String(result.insertedId),
      message: "Order placed successfully",
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Order failed" });
  }
});

// USER ORDERS
app.get("/orders/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const orders = await db
      .collection("tblorders")
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, orders });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to load orders" });
  }
});

// ✅ FINAL FIX — UPDATE ORDER STATUS
app.patch("/orders/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const allowed = ["Created", "Processing", "Shipped", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    const db = await getDb();
    const result = await db.collection("tblorders").updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status, updatedAt: new Date() } }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.json({
      success: true,
      message: "Order status updated successfully",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Status update failed" });
  }
});

/* =========================
 *   ADMIN
 * ======================= */
app.post("/admin/login", async (req, res) => {
  const db = await getDb();
  const admin = await db.collection("tbladmins").findOne(req.body);
  if (!admin) {
    return res.json({ success: false, message: "Invalid admin" });
  }
  res.json({ success: true, username: admin.username });
});

app.get("/admin/orders", async (req, res) => {
  const db = await getDb();
  const status = req.query.status;
  const query = status && status !== "All" ? { status } : {};
  const orders = await db.collection("tblorders").find(query).toArray();
  res.json({ success: true, orders });
});

/* =========================
 *   SAFE CATCH ALL
 * ======================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
    path: req.path,
  });
});

/* =========================
 *   START SERVER
 * ======================= */
const PORT = process.env.PORT || 4400;
app.listen(PORT, () =>
  console.log("API running on http://localhost:" + PORT)
);