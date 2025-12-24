

const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const sanitizeHTML = require("sanitize-html");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use("/api", require("./router-api"));

// Memory store
const sessionOptions = session({
  secret: process.env.SESSION_SECRET || "JavaScript is sooooooooo coool",
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24, 
    httpOnly: true 
  }
});

app.use(sessionOptions);
app.use(flash());

// ✅ PERFECT: INLINE markdown parser + sanitizeHTML
app.use(function(req, res, next) {
  res.locals.csrfToken = "fake-csrf-token-123";
  
  res.locals.filterUserHTML = function(content) {
    if (!content) return content || "";
    
    // ✅ INLINE MARKDOWN PARSER (no external deps)
    let html = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')      // **bold**
      .replace(/\*(.*?)\*/g, '<em>$1</em>')                   // *italic*
      .replace(/`(.*?)`/g, '<code>$1</code>')                 // `code`
      .replace(/^(#{1})\s+(.*$)/gm, '<h1>$2</h1>')            // # Header
      .replace(/^(#{2})\s+(.*$)/gm, '<h2>$2</h2>')            // ## Header
      .replace(/^(#{3})\s+(.*$)/gm, '<h3>$2</h3>')            // ### Header
      .replace(/^(-|\*)\s+(.*$)/gm, '<li>$2</li>')            // - list
      .replace(/(?:\r\n|\r|\n)/g, '<br>');                    // newlines
    
    return sanitizeHTML(html, {
      allowedTags: ["p", "br", "ul", "ol", "li", "strong", "em", "code", "h1", "h2", "h3", "h4", "h5", "h6"],
      allowedAttributes: {}
    });
  };
  
  res.locals.errors = req.flash("errors");
  res.locals.success = req.flash("success");

  if (req.session.user) {
    req.visitorId = req.session.user._id;
  } else {
    req.visitorId = 0;
  }

  res.locals.user = req.session.user;
  next();
});

app.use(express.static("public"));
app.set("views", "views");
app.set("view engine", "ejs");

const router = require("./router");
app.use("/", router);

app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500).render("404");
});

const server = require("http").createServer(app);
const io = require("socket.io")(server);

io.use(function(socket, next) {
  sessionOptions(socket.request, socket.request.res || {}, next);
});

io.on("connection", function(socket) {
  if (socket.request.session.user) {
    let user = socket.request.session.user;
    socket.emit("welcome", { username: user.username, avatar: user.avatar });
    
    socket.on("chatMessageFromBrowser", function(data) {
      socket.broadcast.emit("chatMessageFromServer", {
        message: sanitizeHTML(data.message, { allowedTags: [], allowedAttributes: {} }),
        username: user.username,
        avatar: user.avatar
      });
    });
  }
});

module.exports = app;
