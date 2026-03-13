const result = document.getElementById("result");
result.style.marginTop = "1em";

function resultRender(poll, options, answers, times){

  if(poll.visible !== 1 || poll.status === "editing") return;

  result.innerHTML = "";

  /* ---------- 選択式 ---------- */
  if(poll.type === "choice"){

    const total = options.reduce((sum,o)=>sum+o.votes,0) || 1;

    options
      .sort((a,b)=>a.ordernum-b.ordernum)
      .forEach(o=>{

        const percent = Math.round((o.votes/total)*100);

        const row = document.createElement("div");
        row.className = "barRow";

        row.innerHTML = `
          <div class="barLabel">${o.text}</div>
          <div class="barBg">
            <div class="barFill" style="width:${percent}%"></div>
          </div>
          <div class="barCount">${o.votes} 票（${percent}%）</div>
        `;

        result.appendChild(row);

      });
  }

  /* ---------- 時間 ---------- */
  if(poll.type === "time"){

    if(!times) return;

    const total = times.reduce((s,r)=>s+r.count,0) || 1;

    times.forEach(r=>{

      const percent = Math.round((r.count/total)*100);

      const row = document.createElement("div");
      row.className = "barRow";

      row.innerHTML = `
        <div class="barLabel">${r.time}</div>
        <div class="barBg">
          <div class="barFill" style="width:${percent}%"></div>
        </div>
        <div class="barCount">${r.count} 票（${percent}%）</div>
      `;

      result.appendChild(row);

    });
  }

  /* ---------- 自由記載 ---------- */
  if(poll.type === "text"){

    answers
      .filter(a=>a.visible)
      .reverse()
      .forEach(a=>{

        const div = document.createElement("div");
        div.className = "resultcard";
        div.id = a.id;
        div.textContent = a.text;

        result.appendChild(div);

      });
  }
}