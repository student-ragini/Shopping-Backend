// api.cjs
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  })
);

/* =========================
   MONGO CONFIG
========================= */
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || "ishopdb";

const client = new MongoClient(MONGO_URI);

async function getDb() {
  if (!client.topology || !client.topology.isConnected?.()) {
    await client.connect();
    console.log("MongoDB connected");
  }
  return client.db(DB_NAME);
}

function isValidObjectId(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

/* =========================
   PRODUCTS
========================= */
app.get("/getproducts", async (req, res) => {
  try {
    const db = await getDb();
    const products = await db.collection("tblproducts").find({}).toArray();
    res.json(products);
  } catch {
    res.status(500).json({ message: "Failed to load products" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;

    let product = null;

    if (isValidObjectId(id)) {
      product = await db.collection("tblproducts").findOne({ _id: new ObjectId(id) });
    }

    if (!product && !isNaN(id)) {
      product = await db.collection("tblproducts").findOne({ id: Number(id) });
    }

    if (!product) {
      product = await db.collection("tblproducts").findOne({
        $or: [{ title: id }, { product_id: id }],
      });
    }

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch {
    res.status(500).json({ message: "Product error" });
  }
});

/* =========================
   CATEGORIES (FIXED ✅)
========================= */
app.get("/categories", async (req, res) => {
  try {
    const db = await getDb();
    const categories = await db.collection("tblcategories").find({}).toArray();
    res.json(categories);
  } catch {
    res.status(500).json({ message: "Unable to load categories" });
  }
});

app.get("/categories/:category", async (req, res) => {
  try {
    const db = await getDb();
    const category = req.params.category;

    const products = await db.collection("tblproducts").find({
      $or: [
        { category },
        { Category: category },
        { CategoryName: category },
      ],
    }).toArray();

    res.json(products);
  } catch {
    res.status(500).json({ message: "Category products error" });
  }
});

/* =========================
   AUTH / CUSTOMER
========================= */
app.post("/customerregister", async (req, res) => {
  try {
    const db = await getDb();
    const { UserId, Password, Email } = req.body;

    if (!UserId || !Password || !Email) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const exists = await db.collection("tblcustomers").findOne({ UserId });
    if (exists) return res.status(409).json({ message: "User exists" });

    const hashed = await bcrypt.hash(Password, 10);

    await db.collection("tblcustomers").insertOne({
      ...req.body,
      Password: hashed,
      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Register failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const db = await getDb();
    const { UserId, Password } = req.body;

    const user = await db.collection("tblcustomers").findOne({ UserId });
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const ok = await bcrypt.compare(Password, user.Password);
    if (!ok) return res.status(401).json({ message: "Invalid login" });

    res.json({ success: true, userId: user.UserId });
  } catch {
    res.status(500).json({ message: "Login error" });
  }
});

app.get("/customers/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection("tblcustomers")
      .findOne({ UserId: req.params.userId }, { projection: { Password: 0 } });

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ message: "Profile error" });
  }
});

app.put("/customers/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const data = { ...req.body };

    if (data.Password && data.Password.trim() !== "") {
      data.Password = await bcrypt.hash(data.Password, 10);
    } else {
      delete data.Password;
    }

    await db.collection("tblcustomers").updateOne(
      { UserId: req.params.userId },
      { $set: data }
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Update failed" });
  }
});

/* =========================
   ORDERS (CANCEL FIXED ✅)
========================= */
app.post("/createorder", async (req, res) => {
  try {
    const db = await getDb();
    const order = {
      ...req.body,
      createdAt: new Date(),
      status: "Created",
    };

    const result = await db.collection("tblorders").insertOne(order);
    res.json({ success: true, orderId: result.insertedId });
  } catch {
    res.status(500).json({ message: "Order failed" });
  }
});

app.get("/orders/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const orders = await db.collection("tblorders")
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ orders });
  } catch {
    res.status(500).json({ message: "Orders error" });
  }
});

app.patch("/orders/:orderId/status", async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["Created", "Processing", "Shipped", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await (await getDb()).collection("tblorders").updateOne(
      { _id: new ObjectId(req.params.orderId) },
      { $set: { status, updatedAt: new Date() } }
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Status update failed" });
  }
});

/* =========================
   ADMIN
========================= */
app.get("/admin/orders", async (req, res) => {
  try {
    const db = await getDb();
    const query = req.query.status && req.query.status !== "All"
      ? { status: req.query.status }
      : {};

    const orders = await db.collection("tblorders").find(query).toArray();
    res.json({ orders });
  } catch {
    res.status(500).json({ message: "Admin error" });
  }
});

/* =========================
   SAFE CATCH-ALL (FIXED)
========================= */
app.use((req, res) => {
  res.status(404).json({ message: "API route not found" });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 4400;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));