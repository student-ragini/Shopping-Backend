// api.cjs
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true }));

/* ================= MONGO ================= */
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || "ishopdb";

const client = new MongoClient(MONGO_URI);

async function getDb() {
  if (!client.topology || !client.topology.isConnected?.()) {
    await client.connect();
    console.log("MongoDB Connected");
  }
  return client.db(DB_NAME);
}

const isObjectId = (id) =>
  typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);

/* ================= PRODUCTS ================= */
app.get("/getproducts", async (req, res) => {
  try {
    const db = await getDb();
    const products = await db.collection("tblproducts").find({}).toArray();
    res.json(products);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Products error" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;

    let product = null;

    if (isObjectId(id)) {
      product = await db
        .collection("tblproducts")
        .findOne({ _id: new ObjectId(id) });
    }

    if (!product) {
      product = await db.collection("tblproducts").findOne({
        $or: [{ id }, { product_id: id }, { title: id }],
      });
    }

    if (!product)
      return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Product error" });
  }
});

/* ================= CATEGORIES ================= */
app.get("/categories", async (req, res) => {
  try {
    const db = await getDb();
    const cats = await db.collection("tblcategories").find({}).toArray();
    res.json(cats);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Categories error" });
  }
});

app.get("/categories/:category", async (req, res) => {
  try {
    const db = await getDb();
    const cat = req.params.category;

    const products = await db.collection("tblproducts").find({
      $or: [{ category: cat }, { Category: cat }, { CategoryName: cat }],
    }).toArray();

    res.json(products);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Category error" });
  }
});

/* ================= AUTH ================= */
app.post("/customerregister", async (req, res) => {
  try {
    const db = await getDb();
    const exists = await db
      .collection("tblcustomers")
      .findOne({ UserId: req.body.UserId });

    if (exists)
      return res.json({ success: false, message: "User already exists" });

    req.body.Password = await bcrypt.hash(req.body.Password, 10);
    req.body.createdAt = new Date();

    await db.collection("tblcustomers").insertOne(req.body);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.post("/login", async (req, res) => {
  try {
    const db = await getDb();
    const user = await db
      .collection("tblcustomers")
      .findOne({ UserId: req.body.UserId });

    if (!user) return res.json({ success: false });

    const ok = await bcrypt.compare(req.body.Password, user.Password);
    if (!ok) return res.json({ success: false });

    res.json({ success: true, userId: user.UserId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* ================= PROFILE ================= */
app.get("/customers/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.collection("tblcustomers").findOne(
      { UserId: req.params.userId },
      { projection: { Password: 0 } }
    );

    if (!user) return res.status(404).json({ success: false });
    res.json({ success: true, customer: user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
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

    const updated = await db.collection("tblcustomers").findOne(
      { UserId: req.params.userId },
      { projection: { Password: 0 } }
    );

    res.json({ success: true, customer: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* ================= ORDERS ================= */
app.post("/createorder", async (req, res) => {
  try {
    const db = await getDb();
    const { userId, items = [], shipping = 0, tax = 0 } = req.body;

    if (!userId || !items.length) {
      return res.status(400).json({ success: false });
    }

    const finalItems = [];
    let subtotal = 0;

    for (const i of items) {
      const pid = String(i.productId);
      const qty = Number(i.qty || 1);

      let product = null;

      if (isObjectId(pid)) {
        product = await db
          .collection("tblproducts")
          .findOne({ _id: new ObjectId(pid) });
      }

      if (!product) {
        product = await db.collection("tblproducts").findOne({ id: pid });
      }

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found during checkout",
        });
      }

      const price = Number(product.price || product.Price || 0);
      const title = product.title || product.name || "Item";

      const lineTotal = price * qty;
      subtotal += lineTotal;

      finalItems.push({
        productId: String(product._id || product.id),
        title,
        qty,
        unitPrice: price,
        lineTotal,
      });
    }

    const order = {
      userId,
      items: finalItems,
      subtotal,
      shipping,
      tax,
      total: subtotal + shipping + tax,
      status: "Created",
      createdAt: new Date(),
    };

    const r = await db.collection("tblorders").insertOne(order);

    res.json({ success: true, orderId: String(r.insertedId) });
  } catch (e) {
    console.error("createorder error:", e);
    res.status(500).json({ success: false });
  }
});

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
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.patch("/orders/:orderId/status", async (req, res) => {
  try {
    if (!isObjectId(req.params.orderId)) {
      return res.status(400).json({ success: false });
    }

    const db = await getDb();
    const r = await db.collection("tblorders").updateOne(
      { _id: new ObjectId(req.params.orderId) },
      { $set: { status: req.body.status, updatedAt: new Date() } }
    );

    if (!r.matchedCount)
      return res.status(404).json({ success: false });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* ================= ADMIN ================= */
app.post("/admin/login", async (req, res) => {
  try {
    const db = await getDb();
    const admin = await db.collection("tbladmins").findOne(req.body);
    if (!admin) return res.json({ success: false });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.get("/admin/orders", async (req, res) => {
  try {
    const db = await getDb();
    const q =
      req.query.status && req.query.status !== "All"
        ? { status: req.query.status }
        : {};

    const orders = await db.collection("tblorders").find(q).toArray();
    res.json({ success: true, orders });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* ================= CART ================= */
app.post("/addtocart", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("tblshoppingcart").insertOne({
      ...req.body,
      addedAt: new Date(),
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.get("/getcart/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const cart = await db
      .collection("tblshoppingcart")
      .find({ userId: req.params.userId })
      .toArray();
    res.json(cart);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 4400;
app.listen(PORT, () => console.log("API running on port", PORT));