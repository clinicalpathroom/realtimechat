const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingInterval: 5000,
  pingTimeout: 5000
});

server.keepAliveTimeout = 70000;
server.headersTimeout = 75000;

app.use(express.static("public"));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

function log(level, message, data = null) {
  console.log(`[${new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00')}] [${level}] ${message}`, data || "");
}

/* ==================storage==============*/
const storage = multer.diskStorage({
  destination:(req,file,cb)=>{
    cb(null,"uploads/");
  },
  filename:(req,file,cb)=>{
    const ext = path.extname(file.originalname);
    const name = Date.now() + "-" + Math.round(Math.random()*1e9);
    cb(null, name + ext);
  }
});

const upload = multer({
  storage,
  limits:{
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

/* ================= DB ================= */

const db = new sqlite3.Database("meeting_poll.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delflg INTEGER DEFAULT 0,
    deleted_at DATETIME DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    meeting_id TEXT,
    question TEXT,
    type TEXT,
    status TEXT,
    visible INTEGER DEFAULT 1,
    settings TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delflg INTEGER DEFAULT 0,
    deleted_at DATETIME DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    poll_id TEXT,
    text TEXT,
    votes INTEGER DEFAULT 0,
    ordernum INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delflg INTEGER DEFAULT 0,
    deleted_at DATETIME DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    poll_id TEXT,
    text TEXT,
    visible INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delflg INTEGER DEFAULT 0,
    deleted_at DATETIME DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS meeting_settings (
    meeting_id TEXT,
    setting_item TEXT,
    setting TEXT,
    delflg INTEGER DEFAULT 0,
    deleted_at DATETIME DEFAULT '',
    PRIMARY KEY(meeting_id, setting_item)
  )`);

db.run(`CREATE INDEX IF NOT EXISTS idx_polls_meeting ON polls(meeting_id);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_options_poll ON options(poll_id);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_answers_poll ON answers(poll_id);`);


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
  db.get("SELECT type FROM polls WHERE id=? AND delflg=0", [pollId], (err, poll) => {
    if (err || !poll) {
      return res.status(500).json({ error: "Poll not found" });
    }

    if (poll.type !== "text") {
      return res.status(400).json({ error: "Active poll is not text type" });
    }

    const answerId = uuidv4();

    db.run(
      "INSERT INTO answers VALUES (?,?,?,1,datetime('now', 'localtime'),0,'')",
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

/* ============ Poll Export API ============ */
app.get("/api/polls/:pollId/export", (req, res) => {
  const pollId = req.params.pollId;
  
  db.get("SELECT * FROM polls WHERE id=? AND delflg=0", [pollId], (e, poll) => {
    if (!poll) return res.status(404).end();
    let settings = {}
    try{
      settings = JSON.parse(poll.settings || "{}")
    }catch{}
    let csv = `質問内容,${poll.question}\n`
    csv += `質問形式,${poll.type === "text" ? "記述式":"選択式"}\n`;
    csv += `複数回答,${settings.multianswer === 1 ? "可":"不可"}\n`;
    csv += `作成日,${poll.created_at}\n\n`;
    if (poll.type === "choice") {
      db.all("SELECT text, votes FROM options WHERE poll_id=? AND delflg=0", [pollId], (e, rows) => {
        csv += "項目,投票数\n";
        rows.forEach(r => csv += `"${r.text}",${r.votes}\n`);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=poll.csv");
        res.send(csv);
      });
    } else {
      db.all("SELECT text, visible, created_at, deleted_at FROM answers WHERE poll_id=? AND delflg=0", [pollId], (e, rows) => {
        csv += "送信文字,承認・非承認,送信日,削除日\n";
        rows.forEach(r =>
          csv += `"${r.text.replace(/"/g,'""')}",${r.visible},${r.created_at},${r.deleted_at}\n`
        );
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=answers.csv");
        res.send("\ufeff" + csv);
      });
    }
  });
});

/* ============ Meeting Export API ============ */
app.get("/api/meetings/:meetingId/export", (req, res) => {
  const meetingId = req.params.meetingId;

  const result = { meetingId, polls: [] };

  db.all("SELECT * FROM polls WHERE meeting_id=? AND delflg=0", [meetingId], (e, polls) => {
    let pending = polls.length;
    if (!pending) return res.json(result);

    polls.forEach(poll => {
      const entry = { poll, options: [], answers: [] };
      result.polls.push(entry);

      db.all("SELECT * FROM options WHERE poll_id=? AND delflg=0", [poll.id], (e, opts) => {
        entry.options = opts || [];
        db.all("SELECT * FROM answers WHERE poll_id=? AND delflg=0", [poll.id], (e, ans) => {
          entry.answers = ans || [];
          if (--pending === 0) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader(
              "Content-Disposition",
              `attachment; filename=meeting-${meetingId}.json`
            );
            res.send(JSON.stringify(result, null, 2));
          }
        });
      });
    });
  });
});

/*=================updaloa api=================*/
app.post("/api/upload/handout",
  upload.single("handout"),
  async (req,res)=>{

    if(!req.file){
      return res.status(400).json({error:"file not found"});
    }

    const url = `/uploads/${req.file.filename}`;

    res.json({ url });
});

/* ============ 送信ユーティリティ ============ */

const room = {
  admin: m => `admin-${m}`,
  screen: m => `screen-${m}`,
  participant: m => `participant-${m}`
};

function sendMeeting(meetingId) {
  db.get("SELECT * FROM meetings WHERE id=? AND delflg=0", [meetingId], (e, row) => {
    if (!row) return;
    io.to(room.admin(meetingId)).emit("meeting", row);
    io.to(room.screen(meetingId)).emit("meeting", row);
    io.to(room.participant(meetingId)).emit("meeting", row);
  });
}

function sendPoll(meetingId) {
  const pollId = activePoll[meetingId];
  if (!pollId) return;

  db.get("SELECT * FROM polls WHERE id=? AND delflg=0", [pollId], (e, poll) => {
    if (!poll) return;

    const send = payload => {
      // 管理者は常に受信
      io.to(room.admin(meetingId)).emit("poll", payload);

      // ★参加者も常に受信（状態で画面制御するのはフロントの役目）
      io.to(room.participant(meetingId)).emit("poll", payload);

      // 投影画面は常に受信
        io.to(room.screen(meetingId)).emit("poll", payload);
    };

    if (poll.type === "choice") {
      db.all("SELECT * FROM options WHERE poll_id=? AND delflg=0", [pollId], (e, opts) => {
        send({ poll, options: opts, settings:poll.settings });
      });
    } else if(poll.type === "text") {
      db.all("SELECT * FROM answers WHERE poll_id=? AND delflg=0", [pollId], (e, ans) => {
        send({ poll, answers: ans, settings:poll.settings });
      });
    } else if(poll.type === "time") {
      const settings = JSON.parse(poll.settings || "{}")
      const group = Number(settings.timegroup || 1)
      db.all(
        "SELECT text FROM answers WHERE poll_id=? AND delflg=0",
        [pollId],
        (e, ans) => {
          const counts = {}
          ans.forEach(a => {
            if(!a.text) return
            const [h,m] = a.text.split(":").map(Number)
            const minutes = h*60 + m
            const bucket = Math.floor(minutes / group) * group
            const bh = Math.floor(bucket / 60)
            const bm = bucket % 60
            const key = `${bh}:${String(bm).padStart(2,"0")}`
            if(!counts[key]) counts[key] = 0
            counts[key]++
          })
          const result = Object.entries(counts)
            .map(([time,count]) => ({time,count}))
            .sort((a,b)=>a.time.localeCompare(b.time))

          send({
            poll,
            answers: ans,
            times: result,
            settings: poll.settings
          })
        }
      )
    }
  });
}


function sendPollList(meetingId) {
  db.all(
    "SELECT id, question FROM polls WHERE meeting_id=? AND delflg=0",
    [meetingId],
    (e, rows) => io.to(room.admin(meetingId)).emit("pollList", rows)
  );
}

function sendSettings(meetingId) {
  db.all(
    "SELECT setting_item, setting FROM meeting_settings WHERE meeting_id=? AND delflg=0",
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
  db.get("SELECT 1 FROM meetings WHERE id=? AND delflg=0", [id], (err, row) => {
    callback(!!row);
  });
}

function restoreActivePoll(meetingId) {
  db.get(
    `SELECT id FROM polls
     WHERE meeting_id=? AND delflg=0
     ORDER BY created_at DESC
     LIMIT 1`,
    [meetingId],
    (e, row) => {
      if (row) activePoll[meetingId] = row.id;
    }
  );
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
      if (!activePoll[meetingId]) {
        restoreActivePoll(meetingId);
      }
      socket.join(room[role](meetingId));
      log("ROOM", "Joined", { socket: socket.id, room: room[role](meetingId) });

      if (!clients[meetingId]) clients[meetingId] = {};
      clients[meetingId][socket.id] = { role, name: null,referer };
      sendClientList(meetingId);
      sendMeeting(meetingId);
      sendSettings(meetingId);
      sendPoll(meetingId);      // ★ 先に現在の質問を確定
      sendPollList(meetingId);  // ★ 後で一覧を送る
    });
  } else {
    log("INFO", "Connected without meetingId (lobby state)");
  }


  /* ---- 会議作成（meetingId不要） ---- */
  socket.on("createMeeting", title => {
    log("EVENT", "createMeeting received", { title });

    const id = uuidv4();
    db.run(
      "INSERT INTO meetings VALUES (?, ?, ?, datetime('now', 'localtime'),0,'')",
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
    db.get("SELECT status FROM meetings WHERE id=? AND delflg=0", [meetingId], (e, row) => {
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

    const { question, type, options, settings } = data;
    if (!question || !type) return;

    log("EVENT", "createPoll", data);

    const pollId = uuidv4();
    activePoll[meetingId] = pollId;
    console.log(options)
    db.run(
      "INSERT INTO polls VALUES (?,?,?,?,?,?,?,datetime('now', 'localtime'),0,'')",
      [pollId, meetingId, question, type, "editing", 1, JSON.stringify(settings)],
      () => {
        if (type === "choice" && Array.isArray(options)) {
          let i = 0
          options.forEach(text =>
            db.run("INSERT INTO options VALUES (?,?,?,0,?,datetime('now', 'localtime'),0,'')", [uuidv4(), pollId, text,i++])
          );
        }
        sendPoll(meetingId);
        sendPollList(meetingId);
      }
    );
  });


  socket.on("switchPoll", pollId => {
    activePoll[meetingId] = pollId;

    // ① まず全pollを editing + 非表示
    db.run(
      "UPDATE polls SET status='editing', visible=0 WHERE meeting_id=?",
      [meetingId],
      () => {

        // ② 切り替えたpollだけ表示状態を維持（必要なら）
        db.run(
          "UPDATE polls SET visible=1 WHERE id=?",
          [pollId],
          () => {
            sendPoll(meetingId);      // ★ ここで確実に新pollを送る
            sendPollList(meetingId);
          }
        );

      }
    );
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

    db.get("SELECT status FROM polls WHERE id=? AND delflg=0", [pollId], (e, row) => {
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
    db.get("SELECT visible FROM polls WHERE id=? AND delflg=0", [pollId], (e, row) => {
      if (e || !row) {
        log("WARN", "toggleScreen ignored (poll not found)", { pollId, error: e?.message });
        return;
      }
      db.run("UPDATE polls SET visible=? WHERE id=?", [row.visible ^ 1, pollId], () =>
        sendPoll(meetingId)
      );
    });
  });

  socket.on("setGroupTime", (t) => {
    const pollId = activePoll[meetingId];
    if (!pollId) return;
    db.get("SELECT settings FROM polls WHERE id=? AND delflg=0", [pollId], (e, row) => {
      if (e || !row) {
        log("WARN", "setGroupTime ignored (poll not found)", { pollId, error: e?.message });
        return;
      }
      let settings = {}
      try {
        settings = JSON.parse(row.settings || "{}")
      } catch {
        settings = {}
      }
      settings.timegroup = t
      db.run("UPDATE polls SET settings=? WHERE id=?", [JSON.stringify(settings), pollId], () =>
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
        "INSERT INTO answers VALUES (?,?,?,1,datetime('now', 'localtime'),0,'')",
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
    if (role !== "participant") return;
    if (referer.includes("preview")) return;

    const pollId = activePoll[meetingId];
    if (!pollId) return;

    db.get(
      "SELECT poll_id FROM options WHERE id=? AND delflg=0",
      [optionId],
      (e, row) => {
        if (!row) return;

        // ★ 整合性チェック
        if (row.poll_id !== pollId) {
          log("WARN", "Vote ignored (poll mismatch)", {
            optionId,
            rowPoll: row.poll_id,
            activePoll: pollId
          });
          return;
        }
        if (!voteBuffer[meetingId]) voteBuffer[meetingId] = {};
        if (!voteBuffer[meetingId][pollId]) voteBuffer[meetingId][pollId] = {};

        voteBuffer[meetingId][pollId][optionId] =
          (voteBuffer[meetingId][pollId][optionId] || 0) + 1;

      }
    );
  });


  socket.on("voteMulti", selected => {
    if (role !== "participant") return;
    if (referer.includes("preview")) return;
    if (!Array.isArray(selected) || selected.length === 0) return;

    const pollId = activePoll[meetingId];
    if (!pollId) return;

    selected.forEach(optionId => {
      db.get(
        "SELECT poll_id FROM options WHERE id=? AND delflg=0",
        [optionId],
        (e, row) => {
          if (!row) return;

          // ★ ここが重要
          if (row.poll_id !== pollId) {
            log("WARN", "VoteMulti ignored (poll mismatch)", {
              optionId,
              rowPoll: row.poll_id,
              activePoll: pollId
            });
            return;
          }

          if (!voteBuffer[meetingId]) voteBuffer[meetingId] = {};
          if (!voteBuffer[meetingId][pollId]) voteBuffer[meetingId][pollId] = {};

          voteBuffer[meetingId][pollId][optionId] =
            (voteBuffer[meetingId][pollId][optionId] || 0) + 1;
        }
      );
    });
  });
  

  socket.on("updateTitle",({ title }) => {
    if(!meetingId) return;
    db.run("UPDATE meetings SET title=? WHERE id=?", [title, meetingId], () =>
      sendMeeting(meetingId)
    );
  });

  socket.on("updateSetting", ({ item, value }) => {
    db.run(
      `INSERT INTO meeting_settings VALUES (?,?,?,0,'')
       ON CONFLICT(meeting_id,setting_item) DO UPDATE SET setting=excluded.setting`,
      [meetingId, item, value],
      () => sendSettings(meetingId)
    );
  });

  socket.on("deleteAnswer", answerId => {
    if (role !== "admin") return;

    db.run("UPDATE answers set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE id=?", [answerId], () => {
      sendPoll(meetingId);
    });
  });

  socket.on("deletePoll", pollId => {
    if (role !== "admin") return;

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      db.run("UPDATE options set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE poll_id=?", [pollId]);
      db.run("UPDATE answers set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE poll_id=?", [pollId]);
      db.run("UPDATE polls set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE id=?", [pollId]);
      db.run("COMMIT", () => {
        if (activePoll[meetingId] === pollId) {
          delete activePoll[meetingId];
        }
        restoreActivePoll(meetingId);
        sendPoll(meetingId);
        sendPollList(meetingId);
      });
    });
  });

  socket.on("deleteMeeting", id => {
    if (role !== "admin") return;
    
    db.serialize(() => {
      db.run("BEGIN");
      db.run("UPDATE meeting_settings set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE meeting_id=?", [id]);
      db.run("UPDATE options set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE poll_id IN (SELECT id FROM polls WHERE meeting_id=? AND delflg=0)", [id]);
      db.run("UPDATE answers set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE poll_id IN (SELECT id FROM polls WHERE meeting_id=? AND delflg=0)", [id]);
      db.run("UPDATE polls set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE meeting_id=?", [id]);
      db.run("UPDATE meetings set delflg = 1, deleted_at=CURRENT_TIMESTAMP WHERE id=?", [id]);
      db.run("COMMIT", () => {
        io.to(room.admin(id)).emit("meetingDeleted");
        io.to(room.participant(id)).emit("meetingDeleted");
        io.to(room.screen(id)).emit("meetingDeleted");
      });
    });
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
  Object.entries(voteBuffer).forEach(([meetingId, polls]) => {
    Object.entries(polls).forEach(([pollId, options]) => {
      Object.entries(options).forEach(([optionId, count]) => {

        db.get(
          `
          SELECT o.poll_id, p.meeting_id
          FROM options o
          JOIN polls p ON o.poll_id = p.id
          WHERE o.id=? AND o.delflg=0 AND p.delflg=0
          `,
          [optionId],
          (e, row) => {
            if (!row) return;

            if (activePoll[row.meeting_id] !== row.poll_id) {
              log("DROP", "Buffered vote dropped (poll changed)", {
                optionId,
                pollId: row.poll_id,
                active: activePoll[row.meeting_id]
              });
              return;
            }

            db.run(
              "UPDATE options SET votes=votes+? WHERE id=?",
              [count, optionId]
            );
          }
        );
      });
    });
    sendPoll(meetingId);
  });

  voteBuffer = {};
}, 1000);



/* ============ Start ============ */

server.listen(3001, "0.0.0.0", () => log("INFO", "Server started"));
