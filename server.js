const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 20000
});

server.keepAliveTimeout = 70000;
server.headersTimeout = 75000;

app.use(express.static("public"));
app.use(express.json());

function log(level, message, data = null) {
  console.log(`[${new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00')}] [${level}] ${message}`, data || "");
}

/* ================= DB ================= */

const db = new sqlite3.Database("meeting_poll.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    meeting_id TEXT,
    question TEXT,
    type TEXT,
    status TEXT,
    visible INTEGER DEFAULT 0,
    multianswer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    poll_id TEXT,
    text TEXT,
    votes INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    poll_id TEXT,
    text TEXT,
    visible INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS meeting_settings (
    meeting_id TEXT,
    setting_item TEXT,
    setting TEXT,
    PRIMARY KEY(meeting_id, setting_item)
  )`);
});

/* ============ 状態管理 ============ */

// activePoll → 現在投票中の pollId
const activePoll = {};
let voteBuffer = {};

/* ============ 接続クライアント管理 ============ */
// meetingId → { socketId: { role, name } }
const clients = {};

/* ============ 画面ルーティング ============ */
app.use(express.static("public"));

app.get("/admin", (req, res) =>
  res.sendFile(__dirname + "/public/admin.html")
);

/* ============ Text Answer API (for load testing) ============ */

app.post("/api/meetings/:meetingId/text", (req, res) => {
  const meetingId = req.params.meetingId;
  const { text } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Text is required" });
  }

  // 現在アクティブな投票を取得
  const pollId = activePoll[meetingId];
  if (!pollId) {
    return res.status(400).json({ error: "No active poll" });
  }

  // pollがtext形式か確認
  db.get("SELECT type FROM polls WHERE id=?", [pollId], (err, poll) => {
    if (err || !poll) {
      return res.status(500).json({ error: "Poll not found" });
    }

    if (poll.type !== "text") {
      return res.status(400).json({ error: "Active poll is not text type" });
    }

    const answerId = uuidv4();

    db.run(
      "INSERT INTO answers VALUES (?,?,?,0,datetime('now'))",
      [answerId, pollId, text],
      err => {
        if (err) {
          log("ERROR", "Insert answer failed", err);
          return res.status(500).json({ error: "DB insert failed" });
        }

        // 画面へ即時反映
        sendPoll(meetingId);

        res.status(201).json({
          success: true,
          answerId,
        });
      }
    );
  });
});

/* ============ 送信ユーティリティ ============ */

const room = {
  admin: m => `admin-${m}`,
  screen: m => `screen-${m}`,
  participant: m => `participant-${m}`
};

function sendMeeting(meetingId) {
  db.get("SELECT * FROM meetings WHERE id=?", [meetingId], (e, row) => {
    if (!row) return;
    io.to(room.admin(meetingId)).emit("meeting", row);
    io.to(room.screen(meetingId)).emit("meeting", row);
    io.to(room.participant(meetingId)).emit("meeting", row);
  });
}

function sendPoll(meetingId) {
  const pollId = activePoll[meetingId];
  if (!pollId) return;

  db.get("SELECT * FROM polls WHERE id=?", [pollId], (e, poll) => {
    if (!poll) return;

    const send = payload => {
      // 管理者は常に受信
      io.to(room.admin(meetingId)).emit("poll", payload);

      // ★参加者も常に受信（状態で画面制御するのはフロントの役目）
      io.to(room.participant(meetingId)).emit("poll", payload);

      // 投影画面は visible のときだけ
        io.to(room.screen(meetingId)).emit("poll", payload);
    };

    if (poll.type === "choice") {
      db.all("SELECT * FROM options WHERE poll_id=?", [pollId], (e, opts) => {
        send({ poll, options: opts });
      });
    } else {
      db.all("SELECT * FROM answers WHERE poll_id=?", [pollId], (e, ans) => {
        send({ poll, answers: ans });
      });
    }
  });
}


function sendPollList(meetingId) {
  db.all(
    "SELECT id, question FROM polls WHERE meeting_id=? ORDER BY created_at DESC",
    [meetingId],
    (e, rows) => io.to(room.admin(meetingId)).emit("pollList", rows)
  );
}

function sendSettings(meetingId) {
  db.all(
    "SELECT setting_item, setting FROM meeting_settings WHERE meeting_id=?",
    [meetingId],
    (e, rows) => {
      io.to(room.admin(meetingId)).emit("settings", rows);
      io.to(room.screen(meetingId)).emit("settings", rows);
      io.to(room.participant(meetingId)).emit("settings", rows);
    }
  );
}
function sendClientList(meetingId) {

  if (!clients[meetingId]) return;
  
  const list = Object.entries(clients[meetingId])
    .filter(([_, info]) => info.role === "participant" && !info.referer.includes("preview"))
    .map(([id, info]) => ({
      id,
      role: info.role,
      name: info.name || null
    }));
  io.to(room.admin(meetingId)).emit("clients", list);
}

function meetingIdExists(id, callback) {
  db.get("SELECT 1 FROM meetings WHERE id=?", [id], (err, row) => {
    callback(!!row);
  });
}


/* ============ Socket.IO ============ */

io.on("connection", socket => {
  const { role, meetingId } = socket.handshake.query;
  const referer = socket.handshake.headers.referer || "";
  log("SOCKET", "New connection", { id: socket.id, role, meetingId });

  // 🔵 meeting未参加でも接続は許可する
 if (meetingId && ["admin","participant","screen"].includes(role)) {
    meetingIdExists(meetingId, exists => {
      if (!exists) {
        log("BLOCK", "Invalid meetingId rejected", { meetingId });
        socket.emit("invalidMeeting");
        return socket.disconnect(true);
      }

      socket.join(room[role](meetingId));
      log("ROOM", "Joined", { socket: socket.id, room: room[role](meetingId) });

      if (!clients[meetingId]) clients[meetingId] = {};
      clients[meetingId][socket.id] = { role, name: null,referer };
      sendClientList(meetingId);

      sendMeeting(meetingId);
      sendPollList(meetingId);
      sendSettings(meetingId);
      sendPoll(meetingId);
    });
  } else {
    log("INFO", "Connected without meetingId (lobby state)");
  }


  /* ---- 会議作成（meetingId不要） ---- */
  socket.on("createMeeting", title => {
    log("EVENT", "createMeeting received", { title });

    const id = uuidv4();
    db.run(
      "INSERT INTO meetings VALUES (?, ?, ?, datetime('now'))",
      [id, title,"open"],
      err => {
        if (err) return log("ERROR", "createMeeting DB error", err);

        log("DB", "Meeting created", { id, title });
        socket.emit("meetingCreated", { id, title });
      }
    );
  });

  /* ---- ここから下は meetingId がある接続だけ意味がある ---- */
    /* ---- Meeting状態変更 ---- */
  socket.on("toggleMeeting", () => {
    if (!meetingId) return;
    db.get("SELECT status FROM meetings WHERE id=?", [meetingId], (e, row) => {
       if (!row) return; 
      if(row.status === "open"){
        db.run("UPDATE meetings SET status=? WHERE id=?", ["close", meetingId], () =>{
          sendMeeting(meetingId)
          sendPoll(meetingId)
      });
      }else{
        db.run("UPDATE meetings SET status=? WHERE id=?", ["open", meetingId], () =>
          sendMeeting(meetingId)
        );
        db.run("UPDATE polls SET status=?, visible=? WHERE meeting_id=?", ["editing", 0, meetingId], () =>
          sendPoll(meetingId)
        );
      }
    });
  });

  socket.on("setMeetingStatus", status => {
    if (!meetingId) return;
    db.run("UPDATE meetings SET status=? WHERE id=?", [status, meetingId], () =>
      sendMeeting(meetingId)
    );
  });
  /* ---- Poll作成 ---- */
  socket.on("createPoll", data => {
    if (!meetingId) return log("WARN", "createPoll ignored (no meetingId)");

    const { question, type, options, multiAnswer } = data;
    if (!question || !type) return;

    log("EVENT", "createPoll", data);

    const pollId = uuidv4();
    activePoll[meetingId] = pollId;

    db.run(
      "INSERT INTO polls VALUES (?,?,?,?,?,?,?,datetime('now'))",
      [pollId, meetingId, question, type, "editing", 0,multiAnswer],
      () => {
        if (type === "choice" && Array.isArray(options)) {
          options.forEach(text =>
            db.run("INSERT INTO options VALUES (?,?,?,0)", [uuidv4(), pollId, text])
          );
        }
        sendPollList(meetingId);
        sendPoll(meetingId);
      }
    );
  });


  socket.on("switchPoll", pollId => {
    activePoll[meetingId] = pollId;
    db.run("UPDATE polls SET status=?, visible=? WHERE meeting_id=?", ["editing", 0, meetingId], () =>
      sendPoll(meetingId)
    );
    sendPollList(meetingId);
  });

  socket.on("setPollStatus", status => {
    log("EVENT", "setPollStatus", { meetingId, status });
    const pollId = activePoll[meetingId];
    if (!pollId) return;
    db.run("UPDATE polls SET status=? WHERE id=?", [status, pollId], () =>
      sendPoll(meetingId)
    );
  });

  socket.on("togglePollStatus", () => {
    const pollId = activePoll[meetingId];
    if (!pollId) return;

    db.get("SELECT status FROM polls WHERE id=?", [pollId], (e, row) => {
      if (!row) return;

      const next = row.status === "editing" ? "voting" : "editing";

      db.run("UPDATE polls SET status=? WHERE id=?", [next, pollId], () =>
        sendPoll(meetingId)
      );
    });
  });


  socket.on("toggleScreen", () => {
    const pollId = activePoll[meetingId];
    if (!pollId) return;
    db.get("SELECT visible FROM polls WHERE id=?", [pollId], (e, row) => {
      db.run("UPDATE polls SET visible=? WHERE id=?", [row.visible ^ 1, pollId], () =>
        sendPoll(meetingId)
      );
    });
  });

  socket.on("submitText", text => {
    const pollId = activePoll[meetingId];
    if (!pollId) return;
    const referer = socket.handshake.headers.referer || "";
    log("SUBMIT_TEXT", "Text received", {pollId,referer});
    if(role === "participant" && !referer.includes("preview")) {
      db.run(
        "INSERT INTO answers VALUES (?,?,?,0,datetime('now'))",
        [uuidv4(), pollId, text],
        () => sendPoll(meetingId)
      );
    }
  });

  socket.on("toggleAnswerVisible", id => {
    db.run("UPDATE answers SET visible=1-visible WHERE id=?", [id], () =>
      sendPoll(meetingId)
    );
  });

  socket.on("vote", optionId => {
    const referer = socket.handshake.headers.referer || "";
    log("VOTE_BUFFER", "vote received", { optionId, total: voteBuffer[optionId],referer});
    if(role === "participant" && !referer.includes("preview")) voteBuffer[optionId] = (voteBuffer[optionId] || 0) + 1;
  });

  socket.on("updateTitle",({ title, id }) => {
  db.run("UPDATE meetings SET title = ? WHERE id = ?",[title, id], () =>
    sendMeeting(meetingId)
    );
  });

  socket.on("updateSetting", ({ item, value }) => {
    db.run(
      `INSERT INTO meeting_settings VALUES (?,?,?)
       ON CONFLICT(meeting_id,setting_item) DO UPDATE SET setting=excluded.setting`,
      [meetingId, item, value],
      () => sendSettings(meetingId)
    );
  });

  socket.on("disconnect", () => {
    if (meetingId && clients[meetingId] && clients[meetingId][socket.id]) {
      delete clients[meetingId][socket.id];

      if (Object.keys(clients[meetingId]).length === 0) {
        delete clients[meetingId];
      } else {
        sendClientList(meetingId);
      }
    }

    log("SOCKET", "Disconnected", { id: socket.id });
  });
});

/* ============ 投票バッファ処理 ============ */

setInterval(() => {
  const entries = Object.entries(voteBuffer);
  if (!entries.length) return;

  entries.forEach(([id, count]) =>
    db.run("UPDATE options SET votes=votes+? WHERE id=?", [count, id])
  );

  voteBuffer = {};

  // ★ 票数更新を全画面へ反映
  Object.keys(activePoll).forEach(meetingId => sendPoll(meetingId));
}, 1000);



/* ============ Start ============ */

server.listen(3000, "0.0.0.0", () => log("INFO", "Server started"));
