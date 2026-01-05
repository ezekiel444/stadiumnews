
const dotenv = require("dotenv");
dotenv.config();
const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.CONNECTIONSTRING);
module.exports = client;

async function startServer() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");
    
    // ✅ CREATE TEXT INDEX (fixes search error)
    const db = client.db();
    await db.collection("posts").createIndex({ title: "text", body: "text" });
    console.log("✅ Text index created for search");
    
    const app = require("./app");
    app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
      console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
