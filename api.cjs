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

// static files
app.use(express.static(path.join(__dirname, "public")));

/* =========================
 *   MONGO CONFIG
 * ======================= */

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://ragini_user:Ragini%402728@cluster0.nq1itcw.mongodb.net/ishopdb?retryWrites=true&w=majority&appName=Cluster0";

const DB_NAME = process.env.DB_NAME || "ishopdb";

const client = new MongoClient(MONGO_URI, {});

async function getDb() {
  if (!client.topology || !client.topology.isConnected?.()) {
    await client.connect();
    console.log("Mongo client connected");
  }
  return client.db(DB_NAME);
}

/* =========================
 *   PRODUCTS
 * ======================= */

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

app.get("/products/:id", async (req, res) => {
  try {
    const rawId = req.params.id;
    const db = await getDb();

    // numeric id
    if (!isNaN(rawId)) {
      const idNum = Number(rawId);
      const doc = await db.collection("tblproducts").findOne({ id: idNum });
      if (doc) return res.json(doc);
    }

    // ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(rawId)) {
      const doc = await db
        .collection("tblproducts")
        .findOne({ _id: new ObjectId(rawId) });
      if (doc) return res.json(doc);
    }

    // string / title
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

/* =========================
 *   CATEGORIES
 * ======================= */

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

app.get("/categories/:category", async (req, res) => {
  try {
    const cat = req.params.category;
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

/* =========================
 *   CUSTOMERS
 * ======================= */

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

    if (!UserId || !FirstName || !LastName || !Email || !Password) {
      return res
        .status(400)
        .json({ success: false, message: "Please fill all required fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Email)) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a valid email" });
    }

    if (Password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const db = await getDb();
    const existing = await db
      .collection("tblcustomers")
      .findOne({ UserId: UserId });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "UserId already exists" });
    }

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
      Password: hashedPassword,
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

app.post("/login", async (req, res) => {
  try {
    const { UserId, Password } = req.body;

    if (!UserId || !Password) {
      return res
        .status(400)
        .json({ success: false, message: "UserId and Password required" });
    }

    const db = await getDb();
    const user = await db
      .collection("tblcustomers")
      .findOne({ UserId: UserId });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    const match = await bcrypt.compare(Password, user.Password);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    return res.json({
      success: true,
      message: "Login success",
      userId: user.UserId,
    });
  } catch (err) {
    console.error("POST /login error:", err);
    res
      .status(500)
      .json({ success: false, message: "Login failed. Server error" });
  }
});

/* PROFILE GET / UPDATE */

app.get("/customers/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    const db = await getDb();

    const customer = await db.collection("tblcustomers").findOne(
      { UserId: userId },
      { projection: { Password: 0 } }
    );

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, customer });
  } catch (err) {
    console.error("GET /customers/:userId error:", err);
    res
      .status(500)
      .json({ success: false, message: "Error fetching profile" });
  }
});

app.put("/customers/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    console.log("PUT /customers/:userId =", userId, "body:", req.body);

    const {
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

    const db = await getDb();

    const setDoc = {
      FirstName: FirstName || "",
      LastName: LastName || "",
      DateOfBirth: DateOfBirth ? new Date(DateOfBirth) : null,
      Email: Email || "",
      Gender: Gender || "",
      Address: Address || "",
      PostalCode: PostalCode || "",
      State: State || "",
      Country: Country || "",
      Mobile: Mobile || "",
    };

    if (Password && String(Password).trim() !== "") {
      if (String(Password).trim().length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters.",
        });
      }
      const hashed = await bcrypt.hash(String(Password).trim(), 10);
      setDoc.Password = hashed;
    }

    const result = await db.collection("tblcustomers").updateOne(
      { UserId: userId },
      { $set: setDoc }
    );

    if (!result.matchedCount) {
      console.log("No customer found for UserId:", userId);
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const updated = await db.collection("tblcustomers").findOne(
      { UserId: userId },
      { projection: { Password: 0 } }
    );

    return res.json({
      success: true,
      message: "Profile updated successfully",
      customer: updated,
    });
  } catch (err) {
    console.error("PUT /customers/:userId error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Profile update failed" });
  }
});

/* fallback POST /updatecustomer (optional) */

app.post("/updatecustomer", async (req, res) => {
  try {
    const payload = req.body;
    const userId = payload.UserId || payload.userId;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "userId required" });
    }

    const updateDoc = { $set: {} };
    const fields = [
      "FirstName",
      "LastName",
      "DateOfBirth",
      "Email",
      "Gender",
      "Address",
      "PostalCode",
      "State",
      "Country",
      "Mobile",
      "Password",
    ];

    fields.forEach((f) => {
      if (payload[f] !== undefined && f !== "Password") {
        if (f === "DateOfBirth") {
          updateDoc.$set[f] = payload[f] ? new Date(payload[f]) : null;
        } else {
          updateDoc.$set[f] = payload[f];
        }
      }
    });

    if (payload.Password && String(payload.Password).trim() !== "") {
      if (String(payload.Password).trim().length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters.",
        });
      }
      updateDoc.$set.Password = await bcrypt.hash(
        String(payload.Password).trim(),
        10
      );
    }

    const db = await getDb();
    const result = await db.collection("tblcustomers").updateOne(
      { UserId: userId },
      updateDoc
    );

    if (!result.matchedCount) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const updated = await db.collection("tblcustomers").findOne(
      { UserId: userId },
      { projection: { Password: 0 } }
    );

    return res.json({
      success: true,
      message: "Profile updated (fallback)",
      customer: updated,
    });
  } catch (err) {
    console.error("POST /updatecustomer error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Update failed" });
  }
});

/* =========================
 *   ORDERS
 * ======================= */

app.post("/createorder", async (req, res) => {
  try {
    const db = await getDb();
    const payload = req.body;

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
        return res.status(400).json({
          success: false,
          message: `Product not found: ${it.productId}`,
        });
      }
      const unitPrice = Number(prod.price || 0);
      const qty = Number(it.qty || 1);
      if (isNaN(unitPrice)) {
        return res.status(500).json({
          success: false,
          message: "Server product price error",
        });
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
      status: "Created",
    };

    const insertRes = await db.collection("tblorders").insertOne(orderDoc);

    return res.json({
      success: true,
      orderId: String(insertRes.insertedId),
      message: "Order created",
    });
  } catch (err) {
    console.error("Create order failed:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Unknown server error",
    });
  }
});

// user ke sab orders
app.get("/orders/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const db = await getDb();

    const orders = await db
      .collection("tblorders")
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, orders });
  } catch (err) {
    console.error("GET /orders/:userId error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load orders" });
  }
});

// status update (admin + customer cancel)
app.patch("/orders/:orderId/status", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const { status } = req.body || {};

    const allowed = ["Created", "Processing", "Shipped", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const db = await getDb();

    const result = await db.collection("tblorders").findOneAndUpdate(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    return res.json({
      success: true,
      message: "Order status updated",
      order: result.value,
    });
  } catch (err) {
    console.error("PATCH /orders/:orderId/status error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update status" });
  }
});

/* =========================
 *   CART
 * ======================= */

app.post("/addtocart", async (req, res) => {
  try {
    const db = await getDb();
    const { userId, productId, qty } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({
        success: false,
        message: "userId and productId required",
      });
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

/* =========================
 *   ADMIN
 * ======================= */

// SIMPLE admin login (username/password plain text in tbladmins)
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Username and Password required" });
    }

    const db = await getDb();
    const admin = await db
      .collection("tbladmins")
      .findOne({ username: username });

    if (!admin || admin.password !== password) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid admin credentials" });
    }

    return res.json({
      success: true,
      message: "Admin login success",
      username: admin.username,
    });
  } catch (err) {
    console.error("POST /admin/login error:", err);
    res
      .status(500)
      .json({ success: false, message: "Admin login failed" });
  }
});

// admin – all orders
app.get("/admin/orders", async (req, res) => {
  try {
    const db = await getDb();
    const status = req.query.status;

    const query =
      status && status !== "All"
        ? { status: status }
        : {};

    const orders = await db
      .collection("tblorders")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, orders });
  } catch (err) {
    console.error("GET /admin/orders error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load admin orders" });
  }
});

/* =========================
 *   CATCH-ALL
 * ======================= */

app.use((req, res) => {
  const isApi =
    req.path.startsWith("/products") ||
    req.path.startsWith("/get") ||
    req.path.startsWith("/categories") ||
    req.path.startsWith("/admin") ||
    req.path.startsWith("/customer") ||
    req.path.startsWith("/createorder") ||
    req.path.startsWith("/addtocart") ||
    req.path.startsWith("/login") ||
    req.path.startsWith("/orders") ||
    req.path.startsWith("/customers");

  if (isApi) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  return res.status(200).json({
    message: "Shopping Backend API is running. Frontend is deployed separately.",
    path: req.path,
  });
});

/* =========================
 *   START SERVER
 * ======================= */

const PORT = process.env.PORT || 4400;
app.listen(PORT, () =>
  console.log(`API Starter http://127.0.0.1:${PORT}`)
);