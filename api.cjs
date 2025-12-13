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
    console.log("Mongo Connected");
  }
  return client.db(DB_NAME);
}

const isObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

/* ================= PRODUCTS ================= */
app.get("/getproducts", async (req, res) => {
  try {
    const db = await getDb();
    const data = await db.collection("tblproducts").find({}).toArray();
    res.json(data);
  } catch {
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
    } else {
      product = await db.collection("tblproducts").findOne({
        $or: [
          { id: id },
          { id: Number(id) },
          { product_id: id },
          { title: id }
        ]
      });
    }

    if (!product)
      return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch {
    res.status(500).json({ message: "Product error" });
  }
});

/* ================= CATEGORIES ================= */
app.get("/categories", async (req, res) => {
  try {
    const db = await getDb();
    const data = await db.collection("tblcategories").find({}).toArray();
    res.json(data);
  } catch {
    res.status(500).json({ message: "Categories error" });
  }
});

app.get("/categories/:category", async (req, res) => {
  try {
    const db = await getDb();
    const cat = req.params.category;
    const data = await db.collection("tblproducts").find({
      $or: [{ category: cat }, { Category: cat }]
    }).toArray();
    res.json(data);
  } catch {
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
      return res.json({ success: false, message: "User exists" });

    req.body.Password = await bcrypt.hash(req.body.Password, 10);
    await db.collection("tblcustomers").insertOne(req.body);

    res.json({ success: true });
  } catch {
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
  } catch {
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
  } catch {
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

    await db
      .collection("tblcustomers")
      .updateOne({ UserId: req.params.userId }, { $set: data });

    const updated = await db.collection("tblcustomers").findOne(
      { UserId: req.params.userId },
      { projection: { Password: 0 } }
    );

    res.json({ success: true, customer: updated });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= ORDERS (FIXED) ================= */
app.post("/createorder", async (req, res) => {
  try {
    const db = await getDb();
    const items = req.body.items || [];

    if (!items.length) {
      return res
        .status(400)
        .json({ success: false, message: "No items" });
    }

    const cleanItems = [];

    for (const i of items) {
      const pid = String(i.productId);
      let product = null;

      // by _id
      if (isObjectId(pid)) {
        product = await db
          .collection("tblproducts")
          .findOne({ _id: new ObjectId(pid) });
      }

      // by id (number/string)
      if (!product) {
        product = await db.collection("tblproducts").findOne({
          $or: [{ id: pid }, { id: Number(pid) }]
        });
      }

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found while creating order"
        });
      }

      const qty = Number(i.qty || 1);
      const price = Number(product.price || product.Price || 0);

      cleanItems.push({
        productId: String(product._id),
        title: product.title || product.name || "Item",
        qty,
        unitPrice: price,
        lineTotal: price * qty
      });
    }

    const subtotal = cleanItems.reduce((s, i) => s + i.lineTotal, 0);
    const shipping = Number(req.body.shipping || 0);
    const tax = Number(req.body.tax || 0);

    const order = {
      userId: req.body.userId,
      items: cleanItems,
      subtotal,
      shipping,
      tax,
      total: subtotal + shipping + tax,
      status: "Created",
      createdAt: new Date()
    };

    const r = await db.collection("tblorders").insertOne(order);
    res.json({ success: true, orderId: r.insertedId });
  } catch (err) {
    console.error("createorder error:", err);
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
  } catch {
    res.status(500).json({ success: false });
  }
});

app.patch("/orders/:orderId/status", async (req, res) => {
  try {
    if (!isObjectId(req.params.orderId))
      return res.status(400).json({ success: false });

    const db = await getDb();
    const r = await db.collection("tblorders").updateOne(
      { _id: new ObjectId(req.params.orderId) },
      { $set: { status: req.body.status, updatedAt: new Date() } }
    );

    if (!r.matchedCount)
      return res.status(404).json({ success: false });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= CART ================= */
app.post("/addtocart", async (req, res) => {
  try {
    const db = await getDb();
    await db.collection("tblshoppingcart").insertOne({
      ...req.body,
      productId: String(req.body.productId),
      addedAt: new Date()
    });
    res.json({ success: true });
  } catch {
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
  } catch {
    res.status(500).json({ success: false });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 4400;
app.listen(PORT, () =>
  console.log("API running on port", PORT)
);