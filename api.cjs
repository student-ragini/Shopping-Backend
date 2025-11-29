const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs"); // ✅ NEW: for password hashing
require("dotenv").config();

const app = express();

// ----------------- MIDDLEWARE -----------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// static files for backend
app.use(express.static(path.join(__dirname, "public")));

// ----------------- MONGO CONFIG -----------------
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://ragini_user:Ragini%402728@cluster0.nq1itcw.mongodb.net/ishopdb?retryWrites=true&w=majority&appName=Cluster0";

const DB_NAME = process.env.DB_NAME || "ishopdb";

const client = new MongoClient(MONGO_URI);

async function getDb() {
  if (!client.topology || !client.topology.isConnected?.()) {
    await client.connect();
    console.log("Mongo client connected");
  }
  console.log("db name used:", DB_NAME);
  return client.db(DB_NAME);
}

// ----------------- PRODUCTS -----------------

// all products
app.get("/getproducts", async (req, res) => {
  try {
    const db = await getDb();
    const documents = await db.collection("tblproducts").find({}).toArray();
    res.json(documents);
  } catch (err) {
    console.error("GET /getproducts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// single product by numeric id OR _id string etc.
app.get("/products/:id", async (req, res) => {
  try {
    const rawId = req.params.id;
    const db = await getDb();

    // 1) numeric id
    if (!isNaN(rawId)) {
      const idNum = Number(rawId);
      const doc = await db.collection("tblproducts").findOne({ id: idNum });
      if (doc) return res.json(doc);
    }

    // 2) ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(rawId)) {
      const doc = await db
        .collection("tblproducts")
        .findOne({ _id: new ObjectId(rawId) });
      if (doc) return res.json(doc);
    }

    // 3) fallback: product_id / id / title string
    const doc = await db.collection("tblproducts").findOne({
      $or: [{ product_id: rawId }, { id: rawId }, { title: rawId }],
    });

    if (!doc) return res.status(404).json({ error: "Product not found" });
    return res.json(doc);
  } catch (err) {
    console.error("GET /products/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------- CATEGORIES -----------------

// list of all categories
app.get("/categories", async (req, res) => {
  try {
    const db = await getDb();
    const documents = await db.collection("tblcategories").find({}).toArray();
    res.json(documents);
  } catch (err) {
    console.error("GET /categories error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// products by category name
app.get("/categories/:category", async (req, res) => {
  try {
    const cat = req.params.category; // e.g. "Men's Fashion"
    const db = await getDb();

    const documents = await db
      .collection("tblproducts")
      .find({
        $or: [{ category: cat }, { Category: cat }, { CategoryName: cat }],
      })
      .toArray();

    res.json(documents);
  } catch (err) {
    console.error("GET /categories/:category error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------- CUSTOMERS -----------------

// all customers (still available; passwords will be hashed now)
app.get("/getcustomers", async (req, res) => {
  try {
    const db = await getDb();
    const documents = await db.collection("tblcustomers").find({}).toArray();
    res.json(documents);
  } catch (err) {
    console.error("GET /getcustomers error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// register customer (with validation + hashing)
app.post("/customerregister", async (req, res) => {
  try {
    const {
      UserId,
      FirstName,
      LastName,
      DateOfBirth,
      Email,
      Gender,
      Address,
      PostalCode,
      State,
      Country,
      Mobile,
      Password,
    } = req.body;

    // Basic required validation
    if (!UserId || !FirstName || !LastName || !Email || !Password) {
      return res
        .status(400)
        .json({ success: false, message: "Please fill all required fields" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Email)) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a valid email" });
    }

    // Password length
    if (Password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Mobile (optional basic check)
    if (Mobile && Mobile.length < 8) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a valid mobile number" });
    }

    const db = await getDb();

    // Check if UserId already exists
    const existing = await db
      .collection("tblcustomers")
      .findOne({ UserId: UserId });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "UserId already exists" });
    }

    // ✅ HASH PASSWORD HERE
    const hashedPassword = await bcrypt.hash(Password, 10);

    const data = {
      UserId,
      FirstName,
      LastName,
      DateOfBirth: DateOfBirth ? new Date(DateOfBirth) : null,
      Email,
      Gender,
      Address,
      PostalCode,
      State,
      Country,
      Mobile,
      Password: hashedPassword, // ✅ store hash, not plain
      createdAt: new Date(),
    };

    await db.collection("tblcustomers").insertOne(data);

    return res.json({
      success: true,
      message: "Customer registered successfully",
    });
  } catch (err) {
    console.error("POST /customerregister error:", err);
    res
      .status(500)
      .json({ success: false, message: "Registration failed" });
  }
});

// ✅ NEW: LOGIN API (checks password on server)
app.post("/login", async (req, res) => {
  try {
    const { UserId, Password } = req.body;

    if (!UserId || !Password) {
      return res
        .status(400)
        .json({ success: false, message: "UserId and Password required" });
    }

    const db = await getDb();
    const user = await db.collection("tblcustomers").findOne({ UserId });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    const match = await bcrypt.compare(Password, user.Password || "");
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    // Never send password back
    return res.json({
      success: true,
      message: "Login successful",
      user: {
        UserId: user.UserId,
        FirstName: user.FirstName,
        LastName: user.LastName,
        Email: user.Email,
      },
    });
  } catch (err) {
    console.error("POST /login error:", err);
    res
      .status(500)
      .json({ success: false, message: "Login failed" });
  }
});

// ----------------- ORDERS -----------------

app.post("/createorder", async (req, res) => {
  try {
    const db = await getDb();

    const payload = req.body;
    console.log("CreateOrder payload:", JSON.stringify(payload, null, 2));

    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payload: items required" });
    }

    const items = payload.items;

    const numericIds = [];
    const objectIds = [];
    const stringIds = [];

    items.forEach((it) => {
      const pid = it.productId;
      if (typeof pid === "string" && /^[0-9a-fA-F]{24}$/.test(pid)) {
        objectIds.push(new ObjectId(pid));
      } else if (!isNaN(Number(pid))) {
        numericIds.push(Number(pid));
      } else {
        stringIds.push(String(pid));
      }
    });

    const queryOr = [];
    if (objectIds.length) queryOr.push({ _id: { $in: objectIds } });
    if (numericIds.length) queryOr.push({ id: { $in: numericIds } });
    if (stringIds.length)
      queryOr.push(
        { id: { $in: stringIds } },
        { product_id: { $in: stringIds } }
      );

    let dbProducts = [];
    if (queryOr.length) {
      dbProducts = await db
        .collection("tblproducts")
        .find({ $or: queryOr })
        .toArray();
    } else {
      dbProducts = await db.collection("tblproducts").find({}).toArray();
    }

    const productMap = {};
    dbProducts.forEach((p) => {
      if (p._id) productMap[String(p._id)] = p;
      if (p.id !== undefined) productMap[String(p.id)] = p;
      if (p.product_id !== undefined) productMap[String(p.product_id)] = p;
    });

    let computedSubtotal = 0;
    const validatedItems = [];

    for (const it of items) {
      const key = String(it.productId);
      const prod = productMap[key];
      if (!prod) {
        console.error("Product not found for item:", it);
        return res
          .status(400)
          .json({ success: false, message: `Product not found: ${it.productId}` });
      }
      const unitPrice = Number(prod.price || 0);
      const qty = Number(it.qty || 1);
      if (isNaN(unitPrice)) {
        console.error("Invalid price in DB for product", prod);
        return res
          .status(500)
          .json({ success: false, message: "Server product price error" });
      }
      const lineTotal = unitPrice * qty;
      computedSubtotal += lineTotal;

      validatedItems.push({
        productId: String(prod._id || prod.id),
        title: prod.title || prod.name || "",
        unitPrice,
        qty,
        lineTotal,
      });
    }

    if (payload.subtotal !== undefined) {
      const diff = Math.abs(Number(payload.subtotal) - computedSubtotal);
      if (diff > 0.5) {
        console.warn(
          "Subtotal mismatch: client sent",
          payload.subtotal,
          "computed",
          computedSubtotal
        );
        return res
          .status(400)
          .json({ success: false, message: "Subtotal mismatch" });
      }
    }

    const shipping = Number(payload.shipping || 0);
    const tax = Number(payload.tax || 0);
    const total = Number(
      payload.total || computedSubtotal + shipping + tax
    );

    const orderDoc = {
      userId: payload.userId || null,
      items: validatedItems,
      subtotal: computedSubtotal,
      shipping,
      tax,
      total,
      createdAt: new Date(),
      status: "created",
    };

    const insertRes = await db.collection("tblorders").insertOne(orderDoc);
    console.log("Order inserted:", insertRes.insertedId);

    return res.json({
      success: true,
      orderId: String(insertRes.insertedId),
      message: "Order created",
    });
  } catch (err) {
    console.error("Create order failed:", err);
    return res
      .status(500)
      .json({ success: false, message: err.message || "Unknown server error" });
  }
});

// ----------------- CART (optional) -----------------

app.post("/addtocart", async (req, res) => {
  try {
    const db = await getDb();
    const { userId, productId, qty } = req.body;

    if (!userId || !productId) {
      return res
        .status(400)
        .json({ success: false, message: "userId and productId required" });
    }

    const existing = await db
      .collection("tblshoppingcart")
      .findOne({ userId, productId });

    if (existing) {
      await db.collection("tblshoppingcart").updateOne(
        { userId, productId },
        { $set: { qty: existing.qty + (qty || 1) } }
      );
    } else {
      await db.collection("tblshoppingcart").insertOne({
        userId,
        productId,
        qty: qty || 1,
        addedAt: new Date(),
      });
    }

    res.json({ success: true, message: "Cart updated" });
  } catch (err) {
    console.error("POST /addtocart error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/getcart/:userId", async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.params.userId;

    const cart = await db
      .collection("tblshoppingcart")
      .find({ userId })
      .toArray();
    res.json(cart);
  } catch (err) {
    console.error("GET /getcart error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ----------------- CATCH-ALL (NO STATIC FRONTEND) -----------------

app.use((req, res) => {
  const isApi =
    req.path.startsWith("/products") ||
    req.path.startsWith("/get") ||
    req.path.startsWith("/categories") ||
    req.path.startsWith("/admin") ||
    req.path.startsWith("/customer") ||
    req.path.startsWith("/createorder") ||
    req.path.startsWith("/addtocart") ||
    req.path.startsWith("/login");

  if (isApi) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  return res.status(200).json({
    message: "Shopping Backend API is running. Frontend is deployed separately.",
    path: req.path,
  });
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 4400;
app.listen(PORT, () =>
  console.log(`API Starter http://127.0.0.1:${PORT}`)
);