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
app.get("/products", async (req, res) => {
  try {
    const db = await getDb();
    const products = await db
      .collection("tblproducts")
      .find({})
      .toArray();
    res.json(products);
  } catch (err) {
    console.error(err);
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
        $or: [{ id: String(id) }, { id: Number(id) }, { title: id }],
      });
    }

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Product error" });
  }
});

/* ================= PRODUCT RATING ================= */

// ADD / UPDATE RATING
app.post("/products/:id/rate", async (req, res) => {
  try {
    const db = await getDb();
    const { userId, rating } = req.body;
    const productId = req.params.id;

    if (!userId || !rating) {
      return res.json({ success: false, message: "Missing data" });
    }

    if (rating < 1 || rating > 5) {
      return res.json({ success: false, message: "Invalid rating" });
    }

    if (!isObjectId(productId)) {
      return res.json({ success: false, message: "Invalid product id" });
    }

    const pid = new ObjectId(productId);

    const existing = await db.collection("tblratings").findOne({
      productId: pid,
      userId,
    });

    if (existing) {
      await db.collection("tblratings").updateOne(
        { _id: existing._id },
        { $set: { rating, updatedAt: new Date() } }
      );
    } else {
      await db.collection("tblratings").insertOne({
        productId: pid,
        userId,
        rating,
        createdAt: new Date(),
      });
    }

    // calculate average
    const stats = await db.collection("tblratings").aggregate([
      { $match: { productId: pid } },
      {
        $group: {
          _id: "$productId",
          avg: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]).toArray();

    const avg = stats[0]?.avg || 0;
    const count = stats[0]?.count || 0;

    await db.collection("tblproducts").updateOne(
      { _id: pid },
      { $set: { rating: { avg: Number(avg.toFixed(1)), count } } }
    );

    res.json({ success: true, avg: Number(avg.toFixed(1)), count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// GET PRODUCT RATING
app.get("/products/:id/rating", async (req, res) => {
  try {
    const db = await getDb();
    const pid = new ObjectId(req.params.id);

    const product = await db.collection("tblproducts").findOne(
      { _id: pid },
      { projection: { rating: 1 } }
    );

    res.json({
      success: true,
      rating: product?.rating || { avg: 0, count: 0 },
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= PRODUCTS BY CATEGORY (FIX) ================= */
app.get("/categories/:name", async (req, res) => {
  try {
    const db = await getDb();
    const name = decodeURIComponent(req.params.name);

    const products = await db
      .collection("tblproducts")
      .find({
        $or: [
          { category: name },
          { Category: name },
          { CategoryName: name },
        ],
      })
      .toArray();

    res.json(products);
  } catch (err) {
    console.error("Category products error:", err);
    res.status(500).json({ message: "Category products error" });
  }
});

/* ================= CATEGORIES ================= */
app.get("/categories", async (req, res) => {
  try {
    const db = await getDb();
    const data = await db.collection("tblcategories").find({}).toArray();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Categories error" });
  }
});

/* ================= AUTH (CUSTOMER) ================= */
app.post("/customerregister", async (req, res) => {
  try {
    const db = await getDb();

    const exists = await db
      .collection("tblcustomers")
      .findOne({ UserId: req.body.UserId });

    if (exists) {
      return res.json({ success: false, message: "User exists" });
    }

    req.body.Password = await bcrypt.hash(req.body.Password, 10);
    await db.collection("tblcustomers").insertOne(req.body);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/login", async (req, res) => {
  try {
    const db = await getDb();
    const { UserId, Password } = req.body;

    if (!UserId || !Password) {
      return res.json({ success: false, message: "Missing credentials" });
    }

    const user = await db
      .collection("tblcustomers")
      .findOne({ UserId });

    if (!user) {
      return res.json({ success: false, message: "Invalid UserId" });
    }

    const ok = await bcrypt.compare(Password, user.Password);
    if (!ok) {
      return res.json({ success: false, message: "Invalid Password" });
    }

    res.json({
      success: true,
      userId: user.UserId,
      name: user.FirstName,
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ success: false, message: "Server error" });
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
  } catch (err) {
    console.error(err);
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= ORDERS ================= */
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

      if (isObjectId(pid)) {
        product = await db
          .collection("tblproducts")
          .findOne({ _id: new ObjectId(pid) });
      }

      if (!product) {
        product = await db.collection("tblproducts").findOne({
          $or: [{ id: pid }, { id: Number(pid) }],
        });
      }

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found while creating order",
        });
      }

      const qty = Number(i.qty || 1);
      const price = Number(product.price || product.Price || 0);

      cleanItems.push({
        productId: String(product._id),
        title: product.title || product.name || "Item",
        qty,
        unitPrice: price,
        lineTotal: price * qty,
      });
    }

    const subtotal = cleanItems.reduce((s, i) => s + i.lineTotal, 0);

    const order = {
      userId: req.body.userId,
      items: cleanItems,
      subtotal,
      shipping: Number(req.body.shipping || 0),
      tax: Number(req.body.tax || 0),
      total: subtotal +
        Number(req.body.shipping || 0) +
        Number(req.body.tax || 0),
      status: "Created",
      createdAt: new Date(),
    };

    const r = await db.collection("tblorders").insertOne(order);
    res.json({ success: true, orderId: r.insertedId });
  } catch (err) {
    console.error(err);
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
  } catch (err) {
    console.error(err);
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

    if (!r.matchedCount) {
      return res.status(404).json({ success: false });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= ADMIN ================= */
app.post("/admin/login", async (req, res) => {
  try {
    const db = await getDb();
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({
        success: false,
        message: "Username or password missing",
      });
    }

    const admin = await db.collection("tbladmins").findOne({ username });

    if (!admin) {
      return res.json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // ✅ bcrypt compare
    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.json({
        success: false,
        message: "Invalid credentials",
      });
    }

    res.json({
      success: true,
      username: admin.username,
    });
  } catch (err) {
    console.error(err);
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

    const orders = await db
      .collection("tblorders")
      .find(q)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/admin/create", async (req, res) => {
  try {
    const db = await getDb();
    const { username, password } = req.body;

    const exists = await db.collection("tbladmins").findOne({ username });
    if (exists) {
      return res.json({ success: false, message: "Admin already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection("tbladmins").insertOne({
      username,
      password: hashedPassword,
      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch (err) {
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
  } catch (err) {
    console.error(err);
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 4400;
app.listen(PORT, () =>
  console.log("API running on port", PORT)
);